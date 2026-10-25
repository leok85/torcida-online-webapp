// Busca das notícias nas fontes (RSS 2.0 e Atom). Sem dependências do Deno: os testes do Vitest importam direto.
//
//   POST {modo:'todas'}               cron a cada 15 min, com o cabeçalho x-segredo: lê todas as fontes ativas;
//   POST {modo:'fonte', fonte}        equipe (super admin/editor) ou cron: busca uma fonte agora (logo depois de cadastrar);
//   POST {modo:'verificar', url}      equipe: confere o endereço antes de cadastrar. Aceita o site (acha o feed no HTML)
//                                     ou o próprio feed, e devolve o nome, o feed e quantas notícias por dia.
//   POST {modo:'descobrir'}           cron semanal ou equipe: procura no Google News as notícias dos clubes com torcida,
//                                     acha o feed de futebol dos sites novos (editoria de esportes ou feed geral que
//                                     seja de futebol) e registra as sugestões (o editor aceita ou ignora).
// O banco (registrar_noticias_da_fonte) decide o clube de cada notícia e se ela vai para a fila ou direto para o app.
import { json, jwtDe, lerCorpo } from '../_compartilhado/http.ts';

export type Item = { titulo: string; link: string; resumo: string; imagem_url: string | null; publicado_em: string | null };
export type Feed = { titulo: string; site: string | null; itens: Item[] };
export type Fonte = { id: string; url: string; nome: string };
export type Baixado = { status: number; tipo: string; texto: string; url: string };
export type ClubeDaDescoberta = { id: number; nome: string; pais: string | null };
export type Sugestao = {
  dominio: string;
  achada_para: number[];
  aparicoes: number;
  ok: boolean;
  feed?: string;
  nome?: string;
  site?: string | null;
  itens?: number;
  por_dia?: number | null;
  exemplos?: string[];
  textos?: string[];
  erro?: string;
};

export type Dependencias = {
  segredo: string | undefined;
  /** Baixa o endereço; `limite` em ms (sem ele, o padrão do baixador). */
  baixar: (url: string, limite?: number) => Promise<Baixado>;
  /** Papel na equipe de quem mandou o token, ou null. */
  papelDoToken: (jwt: string) => Promise<string | null>;
  fontesAtivas: () => Promise<Fonte[]>;
  fonte: (id: string) => Promise<Fonte | null>;
  registrar: (fonte: string, itens: Item[]) => Promise<number>;
  registrarErro: (fonte: string, erro: string) => Promise<void>;
  /** Clubes com torcida (mais torcedores primeiro) e os domínios que a descoberta não confere de novo. */
  contextoDaDescoberta: (limite: number) => Promise<{ clubes: ClubeDaDescoberta[]; conhecidos: string[] }>;
  /** Grava as sugestões; devolve quantas ficaram pendentes. */
  registrarSugestoes: (itens: Sugestao[]) => Promise<number>;
  /** Marca o início de uma descoberta; false se a equipe já pediu uma há pouco (o cron sempre passa). */
  iniciarDescoberta: (doCron: boolean) => Promise<boolean>;
  agora?: () => Date;
  /** Tempo da descoberta antes de parar e gravar o que já conferiu (ms). */
  prazoDaDescoberta?: number;
};

export const MAX_ITENS = 40;
const RESUMO = 280;

// ---------- XML sem biblioteca ----------
const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodificar(texto: string) {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
}

/** Texto puro de um trecho que pode trazer HTML (descrições de feed costumam trazer). */
export function textoPuro(html: string) {
  // Tag de bloco vira espaço; tag de linha (b, a, span…) some sem separar as palavras.
  const semTags = (t: string) => t.replace(/<\/?(p|br|div|li|ul|ol|h\d|tr|td|blockquote|figure|figcaption)\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, '');
  return semTags(decodificar(semTags(decodificar(html))))
    .replace(/\s+/g, ' ')
    .trim();
}

const blocos = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, 'gi'))].map((m) => m[0]);

function conteudo(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1] : null;
}

function atributo(xml: string, tag: string, nome: string, filtro?: (abertura: string) => boolean) {
  for (const m of xml.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'gi'))) {
    if (filtro && !filtro(m[0])) continue;
    const a = m[0].match(new RegExp(`\\s${nome}\\s*=\\s*["']([^"']+)["']`, 'i'));
    if (a) return decodificar(a[1]);
  }
  return null;
}

const absoluto = (url: string | null, base: string) => {
  if (!url) return null;
  try {
    const u = new URL(url.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
};

const data = (texto: string | null) => {
  if (!texto) return null;
  const d = new Date(decodificar(texto).trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const cortar = (texto: string, max: number) => (texto.length <= max ? texto : `${texto.slice(0, max - 1).replace(/\s+\S*$/, '')}…`);

const ehImagem = (abertura: string) => !/type\s*=\s*["'](?!image)/i.test(abertura);

/** Lê um feed RSS 2.0 ou Atom. Devolve null quando o texto não é um feed. */
export function lerFeed(xml: string, base: string): Feed | null {
  const atom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  if (!atom && !/<rss[\s>]|<rdf:RDF[\s>]/i.test(xml)) return null;
  const cabeca = xml.split(/<(?:item|entry)[\s>]/i)[0];
  const titulo = textoPuro(conteudo(cabeca, 'title') ?? '') || new URL(base).hostname;
  const site = atom
    ? absoluto(atributo(cabeca, 'link', 'href', (a) => !/rel\s*=\s*["'](?!alternate)/i.test(a)), base)
    : absoluto(textoPuro(conteudo(cabeca, 'link') ?? ''), base);

  const itens: Item[] = [];
  for (const bloco of blocos(xml, atom ? 'entry' : 'item').slice(0, MAX_ITENS)) {
    const link = atom
      ? absoluto(atributo(bloco, 'link', 'href', (a) => !/rel\s*=\s*["'](?!alternate)/i.test(a)), base)
      : absoluto(textoPuro(conteudo(bloco, 'link') ?? '') || textoPuro(conteudo(bloco, 'guid') ?? ''), base);
    const tituloDoItem = textoPuro(conteudo(bloco, 'title') ?? '');
    if (!link || !tituloDoItem) continue;
    const descricao = conteudo(bloco, 'description') ?? conteudo(bloco, 'summary') ?? conteudo(bloco, 'content:encoded') ?? conteudo(bloco, 'content') ?? '';
    const imagem =
      atributo(bloco, 'media:content', 'url', ehImagem) ??
      atributo(bloco, 'media:thumbnail', 'url') ??
      atributo(bloco, 'enclosure', 'url', ehImagem) ??
      atributo(decodificar(descricao), 'img', 'src');
    itens.push({
      titulo: cortar(tituloDoItem, 200),
      link,
      resumo: cortar(textoPuro(descricao), RESUMO),
      imagem_url: absoluto(imagem, link),
      publicado_em: data(conteudo(bloco, 'pubDate') ?? conteudo(bloco, 'published') ?? conteudo(bloco, 'updated') ?? conteudo(bloco, 'dc:date')),
    });
  }
  return { titulo: cortar(titulo, 80), site, itens };
}

/** Endereço do feed anunciado no HTML de um site (<link rel="alternate" type="application/rss+xml">). */
export function feedNoHtml(html: string, base: string) {
  return absoluto(
    atributo(html, 'link', 'href', (a) => /rel\s*=\s*["']alternate["']/i.test(a) && /type\s*=\s*["']application\/(rss|atom)\+xml["']/i.test(a)),
    base,
  );
}

/** Notícias por dia pelas datas do feed (últimos 7 dias); sem datas, null. */
export function porDia(itens: Item[], agora: Date) {
  const datas = itens.map((i) => (i.publicado_em ? new Date(i.publicado_em).getTime() : null)).filter((d): d is number => d !== null);
  if (!datas.length) return null;
  const semana = datas.filter((d) => d >= agora.getTime() - 7 * 86_400_000).length;
  if (semana > 0) return Math.round((semana / 7) * 10) / 10;
  return 0;
}

// Onde os sites costumam deixar o feed quando não o anunciam no HTML.
export const CAMINHOS_DE_FEED = ['/feed', '/rss', '/rss.xml', '/feed.xml', '/feeds/rss'];

/** O site respondeu, mas não tem feed que dê para ler (diferente de rede fora ou erro passageiro do servidor). */
export class SemFeed extends Error {}

const falhaHttp = (status: number, onde = '') => (status >= 500 ? new Error(`HTTP ${status}${onde}`) : new SemFeed(`HTTP ${status}${onde}`));

/** Baixa e lê o feed; se o endereço for de um site, procura o feed nele (no HTML ou nos caminhos de costume). */
export async function abrirFeed(url: string, baixar: Dependencias['baixar'], limite?: number): Promise<{ feed: Feed; url: string }> {
  const primeiro = await baixar(url, limite);
  if (primeiro.status >= 400) throw falhaHttp(primeiro.status);
  const direto = lerFeed(primeiro.texto, primeiro.url);
  if (direto) return { feed: direto, url: primeiro.url };
  const anunciado = feedNoHtml(primeiro.texto, primeiro.url);
  if (!anunciado) {
    // Em paralelo; vale o primeiro caminho da lista que trouxer um feed.
    const tentativas = await Promise.all(CAMINHOS_DE_FEED.map((c) => baixar(new URL(c, primeiro.url).toString(), limite).catch(() => null)));
    for (const tentativa of tentativas) {
      const feed = tentativa && tentativa.status < 400 ? lerFeed(tentativa.texto, tentativa.url) : null;
      if (feed) return { feed, url: tentativa!.url };
    }
    throw new SemFeed('Nenhum feed RSS encontrado nesse endereço');
  }
  const segundo = await baixar(anunciado, limite);
  if (segundo.status >= 400) throw falhaHttp(segundo.status, ' no feed');
  const feed = lerFeed(segundo.texto, segundo.url);
  if (!feed) throw new SemFeed('O feed anunciado pelo site não pôde ser lido');
  return { feed, url: segundo.url };
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

async function buscarFonte(fonte: Fonte, deps: Dependencias) {
  try {
    const { feed } = await abrirFeed(fonte.url, deps.baixar);
    return { fonte: fonte.id, novas: await deps.registrar(fonte.id, feed.itens) };
  } catch (e) {
    await deps.registrarErro(fonte.id, mensagem(e));
    return { fonte: fonte.id, erro: mensagem(e) };
  }
}

// ---------- descoberta de fontes ----------
// Portais gerais anunciam na página inicial o feed de todas as editorias; o de esportes costuma estar num destes.
export const CAMINHOS_DE_ESPORTE = ['/esportes/rss.xml', '/esportes/feed', '/esportes/rss', '/futebol/feed', '/futebol/rss', '/esporte/feed', '/esporte/rss', '/rss/esportes'];

const VOCABULARIO_DE_FUTEBOL =
  /\b(futebol|gol(s|eada|eiro|eiros)?|campeonato|brasileir[ãa]o|libertadores|sul-americana|copa do brasil|copa do mundo|s[ée]rie [ab]|rodada|cl[áa]ssico|t[ée]cnico|treinador|zagueiro|atacante|lateral|volante|meio-campo|meia|elenco|escala[çc][ãa]o|placar|torcida|torcedor(es)?|est[áa]dio|partida|empate|empata|vence|venceu|derrota|goleia|premier league|la liga|champions|serie a|bundesliga|transfer[êe]ncia|refor[çc]o|contrata[çc][ãa]o|cbf|fifa|var|p[êe]nalti|escanteio|artilheiro)\b/i;

/** Feed de futebol: ao menos 5 notícias e metade delas com vocabulário de futebol no título ou no resumo. */
export function ehDeFutebol(itens: Item[]) {
  if (itens.length < 5) return false;
  return itens.filter((i) => VOCABULARIO_DE_FUTEBOL.test(`${i.titulo} ${i.resumo}`)).length >= itens.length / 2;
}

/** O feed de futebol do site: primeiro a editoria de esportes, depois o feed da página inicial, se for de futebol. */
export async function abrirFeedDeFutebol(site: string, baixar: Dependencias['baixar'], limite?: number): Promise<{ feed: Feed; url: string }> {
  const tentativas = await Promise.all(CAMINHOS_DE_ESPORTE.map((c) => baixar(new URL(c, site).toString(), limite).catch(() => null)));
  for (const tentativa of tentativas) {
    const feed = tentativa && tentativa.status < 400 ? lerFeed(tentativa.texto, tentativa.url) : null;
    if (feed && ehDeFutebol(feed.itens)) return { feed, url: tentativa!.url };
  }
  const geral = await abrirFeed(site, baixar, limite);
  if (!ehDeFutebol(geral.feed.itens)) throw new SemFeed(geral.feed.itens.length ? 'O feed do site não é de futebol' : 'O feed não tem notícias');
  return geral;
}

export const MAX_CLUBES = 20;
export const MAX_CONFERIR = 12;
const EM_PARALELO = 5;
// A função tem 150 s; para em 100 s e grava o que já conferiu. Cada download da descoberta espera no máximo 6 s.
const PRAZO_DA_DESCOBERTA = 100_000;
const LIMITE_POR_DOWNLOAD = 6_000;

// Redes sociais e agregadores aparecem como origem no Google News, mas não são fonte.
const BLOQUEADOS = ['google.com', 'youtube.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'msn.com', 'yahoo.com', 'flipboard.com', 'linkedin.com', 'reddit.com'];

/** Domínio sem "www.", em minúsculas (o mesmo que o banco usa em dominio_de). */
export function dominioDe(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.toLowerCase().replace(/^www\./, '') : null;
  } catch {
    return null;
  }
}

const bloqueado = (dominio: string) => BLOQUEADOS.some((b) => dominio === b || dominio.endsWith(`.${b}`));

/** Busca do Google News pelas notícias do clube, no idioma do país dele. */
export function buscaDoGoogleNews(clube: ClubeDaDescoberta) {
  const br = (clube.pais ?? 'BR') === 'BR';
  const q = encodeURIComponent(`${clube.nome} ${br ? 'futebol' : 'football'}`);
  return br ? `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419` : `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

/** Sites de origem das notícias de uma busca do Google News (<source url="...">), com quantas notícias cada um. */
export function origensDoGoogleNews(xml: string) {
  const origens = new Map<string, { site: string; aparicoes: number }>();
  for (const bloco of blocos(xml, 'item')) {
    const site = absoluto(atributo(bloco, 'source', 'url'), 'https://news.google.com/');
    const dominio = dominioDe(site);
    if (!site || !dominio) continue;
    const atual = origens.get(dominio);
    origens.set(dominio, { site: atual?.site ?? site, aparicoes: (atual?.aparicoes ?? 0) + 1 });
  }
  return origens;
}

/** Processa em lotes; não começa lote novo depois do prazo (o que já terminou fica). */
async function emLotes<T, R>(itens: T[], tamanho: number, fazer: (item: T) => Promise<R>, ate: number) {
  const resultados: R[] = [];
  for (let i = 0; i < itens.length && Date.now() < ate; i += tamanho) resultados.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fazer))));
  return resultados;
}

async function descobrir(deps: Dependencias) {
  const ate = Date.now() + (deps.prazoDaDescoberta ?? PRAZO_DA_DESCOBERTA);
  const { clubes, conhecidos } = await deps.contextoDaDescoberta(MAX_CLUBES);
  const jaConhecidos = new Set(conhecidos);
  const achados = new Map<string, { site: string; achada_para: number[]; aparicoes: number }>();

  // Clubes em lotes; a ordem de achada_para segue a ordem dos clubes (mais torcedores primeiro).
  const porClube = await emLotes(clubes, EM_PARALELO, async (clube) => {
    try {
      const resposta = await deps.baixar(buscaDoGoogleNews(clube), LIMITE_POR_DOWNLOAD);
      return resposta.status < 400 ? origensDoGoogleNews(resposta.texto) : new Map();
    } catch {
      return new Map<string, { site: string; aparicoes: number }>();
    }
  }, ate);
  porClube.forEach((origens, i) => {
    for (const [dominio, { site, aparicoes }] of origens) {
      if (jaConhecidos.has(dominio) || bloqueado(dominio)) continue;
      const atual = achados.get(dominio) ?? { site, achada_para: [], aparicoes: 0 };
      atual.achada_para.push(clubes[i].id);
      atual.aparicoes += aparicoes;
      achados.set(dominio, atual);
    }
  });

  // Os que mais apareceram primeiro: são sites de terceiros, então só alguns por rodada.
  const candidatos = [...achados].sort((a, b) => b[1].achada_para.length - a[1].achada_para.length || b[1].aparicoes - a[1].aparicoes).slice(0, MAX_CONFERIR);
  const agora = deps.agora?.() ?? new Date();
  const conferidos = await emLotes(candidatos, EM_PARALELO, async ([dominio, { site, achada_para, aparicoes }]): Promise<Sugestao | null> => {
    try {
      const { feed, url } = await abrirFeedDeFutebol(site, deps.baixar, LIMITE_POR_DOWNLOAD);
      return {
        dominio,
        achada_para,
        aparicoes,
        ok: true,
        feed: url,
        nome: feed.titulo,
        site: feed.site ?? site,
        itens: feed.itens.length,
        por_dia: porDia(feed.itens, agora),
        exemplos: feed.itens.slice(0, 3).map((i) => i.titulo),
        textos: feed.itens.map((i) => `${i.titulo} ${i.resumo}`),
      };
    } catch (e) {
      // Rede fora, tempo esgotado ou 5xx: não registra, para o site não sumir por 30 dias por um erro passageiro.
      return e instanceof SemFeed ? { dominio, achada_para, aparicoes, ok: false, nome: dominio, erro: mensagem(e) } : null;
    }
  }, ate);
  const sugestoes = conferidos.filter((s): s is Sugestao => s !== null);

  const novas = sugestoes.length ? await deps.registrarSugestoes(sugestoes) : 0;
  return { ok: true, clubes: clubes.length, sites: achados.size, conferidos: conferidos.length, novas, interrompida: Date.now() >= ate };
}

const EDITORES = ['super_admin', 'editor'];

export async function buscarNoticias(req: Request, deps: Dependencias): Promise<Response> {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { erro: 'metodo_nao_permitido' });
  const doCron = !!deps.segredo && req.headers.get('x-segredo') === deps.segredo;
  const jwt = jwtDe(req);
  const daEquipe = !doCron && !!jwt && EDITORES.includes((await deps.papelDoToken(jwt)) ?? '');
  if (!doCron && !daEquipe) return json(401, { erro: 'nao_autorizado' });

  const corpo = await lerCorpo(req);

  if (corpo.modo === 'verificar') {
    if (typeof corpo.url !== 'string' || !/^https?:\/\//i.test(corpo.url.trim())) return json(400, { erro: 'url_invalida' });
    try {
      const { feed, url } = await abrirFeed(corpo.url.trim(), deps.baixar);
      return json(200, {
        ok: true,
        feed: url,
        nome: feed.titulo,
        site: feed.site,
        itens: feed.itens.length,
        por_dia: porDia(feed.itens, deps.agora?.() ?? new Date()),
        exemplos: feed.itens.slice(0, 3).map((i) => i.titulo),
      });
    } catch (e) {
      return json(200, { ok: false, erro: mensagem(e) });
    }
  }

  if (corpo.modo === 'fonte') {
    if (typeof corpo.fonte !== 'string') return json(400, { erro: 'fonte_invalida' });
    const fonte = await deps.fonte(corpo.fonte);
    if (!fonte) return json(404, { erro: 'fonte_inexistente' });
    return json(200, { ok: true, ...(await buscarFonte(fonte, deps)) });
  }

  if (corpo.modo === 'descobrir') {
    // A equipe pode pedir uma por vez a cada 10 min: são dezenas de downloads em sites de terceiros e no Google.
    if (!(await deps.iniciarDescoberta(doCron))) return json(429, { erro: 'descoberta_recente' });
    return json(200, await descobrir(deps));
  }

  if (!doCron) return json(403, { erro: 'so_o_cron' });
  const fontes = await deps.fontesAtivas();
  const resultados = [];
  // Em série e com poucas fontes por vez: são sites de terceiros, sem pressa.
  for (const fonte of fontes) resultados.push(await buscarFonte(fonte, deps));
  return json(200, { ok: true, fontes: resultados.length, novas: resultados.reduce((s, r) => s + (r.novas ?? 0), 0), resultados });
}
