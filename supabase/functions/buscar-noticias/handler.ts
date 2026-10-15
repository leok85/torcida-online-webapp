// Busca das notícias nas fontes (RSS 2.0 e Atom). Sem dependências do Deno: os testes do Vitest importam direto.
//
//   POST {modo:'todas'}               cron a cada 15 min, com o cabeçalho x-segredo: lê todas as fontes ativas;
//   POST {modo:'fonte', fonte}        equipe (super admin/editor) ou cron: busca uma fonte agora (logo depois de cadastrar);
//   POST {modo:'verificar', url}      equipe: confere o endereço antes de cadastrar. Aceita o site (acha o feed no HTML)
//                                     ou o próprio feed, e devolve o nome, o feed e quantas notícias por dia.
// O banco (registrar_noticias_da_fonte) decide o clube de cada notícia e se ela vai para a fila ou direto para o app.
import { json, jwtDe, lerCorpo } from '../_compartilhado/http.ts';

export type Item = { titulo: string; link: string; resumo: string; imagem_url: string | null; publicado_em: string | null };
export type Feed = { titulo: string; site: string | null; itens: Item[] };
export type Fonte = { id: string; url: string; nome: string };
export type Baixado = { status: number; tipo: string; texto: string; url: string };

export type Dependencias = {
  segredo: string | undefined;
  baixar: (url: string) => Promise<Baixado>;
  /** Papel na equipe de quem mandou o token, ou null. */
  papelDoToken: (jwt: string) => Promise<string | null>;
  fontesAtivas: () => Promise<Fonte[]>;
  fonte: (id: string) => Promise<Fonte | null>;
  registrar: (fonte: string, itens: Item[]) => Promise<number>;
  registrarErro: (fonte: string, erro: string) => Promise<void>;
  agora?: () => Date;
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

/** Baixa e lê o feed; se o endereço for de um site, procura o feed nele. */
export async function abrirFeed(url: string, baixar: Dependencias['baixar']): Promise<{ feed: Feed; url: string }> {
  const primeiro = await baixar(url);
  if (primeiro.status >= 400) throw new Error(`HTTP ${primeiro.status}`);
  const direto = lerFeed(primeiro.texto, primeiro.url);
  if (direto) return { feed: direto, url: primeiro.url };
  const anunciado = feedNoHtml(primeiro.texto, primeiro.url);
  if (!anunciado) throw new Error('Nenhum feed RSS encontrado nesse endereço');
  const segundo = await baixar(anunciado);
  if (segundo.status >= 400) throw new Error(`HTTP ${segundo.status} no feed`);
  const feed = lerFeed(segundo.texto, segundo.url);
  if (!feed) throw new Error('O feed anunciado pelo site não pôde ser lido');
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

  if (!doCron) return json(403, { erro: 'so_o_cron' });
  const fontes = await deps.fontesAtivas();
  const resultados = [];
  // Em série e com poucas fontes por vez: são sites de terceiros, sem pressa.
  for (const fonte of fontes) resultados.push(await buscarFonte(fonte, deps));
  return json(200, { ok: true, fontes: resultados.length, novas: resultados.reduce((s, r) => s + (r.novas ?? 0), 0), resultados });
}
