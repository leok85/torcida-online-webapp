import { describe, expect, it, vi } from 'vitest';
import { buscaDoGoogleNews, buscarNoticias, dominioDe, feedNoHtml, lerFeed, origensDoGoogleNews, porDia, textoPuro, type Baixado, type Dependencias, type Sugestao } from './handler';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title><![CDATA[Gazeta Esportiva &amp; Cia]]></title>
  <link>https://gazeta.com.br</link>
  <item>
    <title>Clube B encaminha renovação do lateral</title>
    <link>https://gazeta.com.br/noticia/1</link>
    <description><![CDATA[<p>Acordo <b>verbal</b> fechado; assinatura na próxima semana.</p><img src="/fotos/1.jpg">]]></description>
    <pubDate>Wed, 14 Oct 2026 12:00:00 -0300</pubDate>
  </item>
  <item>
    <title>Atacante sente lesão</title>
    <link>https://gazeta.com.br/noticia/2</link>
    <media:content url="https://cdn.gazeta.com.br/2.jpg" medium="image" />
    <description>Departamento médico avalia o jogador.</description>
  </item>
  <item><title>Sem link</title></item>
</channel>
</rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Blog Raça</title>
  <link rel="self" href="https://raca.blog/feed" />
  <link rel="alternate" href="https://raca.blog/" />
  <entry>
    <title>Reforço para o ataque</title>
    <link rel="alternate" href="https://raca.blog/reforco" />
    <summary>Centroavante chega por empréstimo.</summary>
    <published>2026-10-13T20:05:00Z</published>
  </entry>
</feed>`;

const AGORA = new Date('2026-10-15T12:00:00Z');

describe('lerFeed', () => {
  it('lê RSS: título, link, resumo sem HTML, imagem da descrição ou do media:content e data', () => {
    const feed = lerFeed(RSS, 'https://gazeta.com.br/rss')!;
    expect(feed.titulo).toBe('Gazeta Esportiva & Cia');
    expect(feed.site).toBe('https://gazeta.com.br/');
    expect(feed.itens).toHaveLength(2);
    expect(feed.itens[0]).toEqual({
      titulo: 'Clube B encaminha renovação do lateral',
      link: 'https://gazeta.com.br/noticia/1',
      resumo: 'Acordo verbal fechado; assinatura na próxima semana.',
      imagem_url: 'https://gazeta.com.br/fotos/1.jpg',
      publicado_em: '2026-10-14T15:00:00.000Z',
    });
    expect(feed.itens[1].imagem_url).toBe('https://cdn.gazeta.com.br/2.jpg');
    expect(feed.itens[1].publicado_em).toBeNull();
  });

  it('lê Atom pelo link alternate', () => {
    const feed = lerFeed(ATOM, 'https://raca.blog/feed')!;
    expect(feed.site).toBe('https://raca.blog/');
    expect(feed.itens[0]).toMatchObject({ titulo: 'Reforço para o ataque', link: 'https://raca.blog/reforco', resumo: 'Centroavante chega por empréstimo.' });
  });

  it('HTML não é feed', () => {
    expect(lerFeed('<html><head><title>Site</title></head></html>', 'https://x.com')).toBeNull();
  });

  it('corta resumo longo na palavra', () => {
    const longo = `<rss><channel><title>X</title><item><title>T</title><link>https://x.com/1</link><description>${'palavra '.repeat(80)}</description></item></channel></rss>`;
    const resumo = lerFeed(longo, 'https://x.com')!.itens[0].resumo;
    expect(resumo.length).toBeLessThanOrEqual(280);
    expect(resumo.endsWith('palavra…')).toBe(true);
  });
});

describe('utilidades', () => {
  it('feedNoHtml acha o feed anunciado e resolve o endereço relativo', () => {
    const html = '<head><link rel="stylesheet" href="/a.css"><link rel="alternate" type="application/rss+xml" title="RSS" href="/feed/"></head>';
    expect(feedNoHtml(html, 'https://site.com/futebol')).toBe('https://site.com/feed/');
    expect(feedNoHtml('<head></head>', 'https://site.com')).toBeNull();
  });

  it('textoPuro tira tags e entidades', () => {
    expect(textoPuro('&lt;p&gt;Olá&nbsp;<b>mundo</b>&#33;&lt;/p&gt;')).toBe('Olá mundo!');
  });

  it('porDia conta os últimos 7 dias', () => {
    const item = (dias: number) => ({ titulo: 't', link: 'https://x.com', resumo: '', imagem_url: null, publicado_em: new Date(AGORA.getTime() - dias * 86_400_000).toISOString() });
    expect(porDia([item(1), item(2), item(3), item(10)], AGORA)).toBe(0.4);
    expect(porDia([{ ...item(1), publicado_em: null }], AGORA)).toBeNull();
  });
});

function dependencias(extra: Partial<Dependencias> = {}): Dependencias {
  const paginas: Record<string, string> = {
    'https://gazeta.com.br/rss': RSS,
    'https://raca.blog/': '<link rel="alternate" type="application/atom+xml" href="/feed">',
    'https://raca.blog/feed': ATOM,
  };
  return {
    segredo: 'segredo',
    agora: () => AGORA,
    baixar: vi.fn(async (url: string): Promise<Baixado> => (paginas[url] ? { status: 200, tipo: 'text/xml', texto: paginas[url], url } : { status: 404, tipo: '', texto: '', url })),
    papelDoToken: vi.fn(async (jwt: string) => (jwt === 'token-editor' ? 'editor' : jwt === 'token-moderador' ? 'moderador' : null)),
    fontesAtivas: vi.fn(async () => [
      { id: 'f1', url: 'https://gazeta.com.br/rss', nome: 'Gazeta' },
      { id: 'f2', url: 'https://fora.do.ar/rss', nome: 'Fora do ar' },
    ]),
    fonte: vi.fn(async (id: string) => (id === 'f1' ? { id: 'f1', url: 'https://gazeta.com.br/rss', nome: 'Gazeta' } : null)),
    registrar: vi.fn(async (_fonte: string, itens: unknown[]) => itens.length),
    registrarErro: vi.fn(async () => {}),
    contextoDaDescoberta: vi.fn(async () => ({ clubes: [], conhecidos: [] })),
    registrarSugestoes: vi.fn(async (itens: Sugestao[]) => itens.filter((i) => i.ok).length),
    iniciarDescoberta: vi.fn(async () => true),
    ...extra,
  };
}

const pedido = (corpo: object, cabecalhos: Record<string, string> = {}) =>
  new Request('https://x/functions/v1/buscar-noticias', { method: 'POST', headers: { 'Content-Type': 'application/json', ...cabecalhos }, body: JSON.stringify(corpo) });

describe('buscarNoticias', () => {
  it('cron com segredo lê todas as fontes e marca o erro da que falhou', async () => {
    const deps = dependencias();
    const resposta = await buscarNoticias(pedido({ modo: 'todas' }, { 'x-segredo': 'segredo' }), deps);
    expect(await resposta.json()).toMatchObject({ ok: true, fontes: 2, novas: 2 });
    expect(deps.registrar).toHaveBeenCalledWith('f1', expect.arrayContaining([expect.objectContaining({ link: 'https://gazeta.com.br/noticia/1' })]));
    expect(deps.registrarErro).toHaveBeenCalledWith('f2', 'HTTP 404');
  });

  it('sem segredo nem token da equipe: 401; moderador também não', async () => {
    expect((await buscarNoticias(pedido({ modo: 'todas' }), dependencias())).status).toBe(401);
    expect((await buscarNoticias(pedido({ modo: 'verificar', url: 'https://gazeta.com.br/rss' }, { Authorization: 'Bearer token-moderador' }), dependencias())).status).toBe(401);
  });

  it('editor verifica um site: acha o feed no HTML e devolve nome e notícias por dia', async () => {
    const resposta = await buscarNoticias(pedido({ modo: 'verificar', url: 'https://raca.blog/' }, { Authorization: 'Bearer token-editor' }), dependencias());
    expect(await resposta.json()).toEqual({
      ok: true,
      feed: 'https://raca.blog/feed',
      nome: 'Blog Raça',
      site: 'https://raca.blog/',
      itens: 1,
      por_dia: 0.1,
      exemplos: ['Reforço para o ataque'],
    });
  });

  it('verificar site que não anuncia o feed tenta os caminhos de costume', async () => {
    const deps = dependencias({
      baixar: vi.fn(async (url: string): Promise<Baixado> => {
        if (url === 'https://portal.com.br/esportes') return { status: 200, tipo: 'text/html', texto: '<html><head></head></html>', url };
        if (url === 'https://portal.com.br/rss') return { status: 200, tipo: 'text/xml', texto: RSS, url };
        return { status: 404, tipo: '', texto: '', url };
      }),
    });
    const resposta = await buscarNoticias(pedido({ modo: 'verificar', url: 'https://portal.com.br/esportes' }, { Authorization: 'Bearer token-editor' }), deps);
    expect(await resposta.json()).toMatchObject({ ok: true, feed: 'https://portal.com.br/rss', nome: 'Gazeta Esportiva & Cia' });
    expect(deps.baixar).toHaveBeenCalledWith('https://portal.com.br/feed', undefined);
  });

  it('verificar endereço sem feed responde ok: false com o motivo', async () => {
    const resposta = await buscarNoticias(pedido({ modo: 'verificar', url: 'https://nada.com' }, { Authorization: 'Bearer token-editor' }), dependencias());
    expect(await resposta.json()).toEqual({ ok: false, erro: 'HTTP 404' });
  });

  it('editor busca uma fonte agora, mas não dispara todas', async () => {
    const deps = dependencias();
    const uma = await buscarNoticias(pedido({ modo: 'fonte', fonte: 'f1' }, { Authorization: 'Bearer token-editor' }), deps);
    expect(await uma.json()).toEqual({ ok: true, fonte: 'f1', novas: 2 });
    expect((await buscarNoticias(pedido({ modo: 'todas' }, { Authorization: 'Bearer token-editor' }), deps)).status).toBe(403);
    expect((await buscarNoticias(pedido({ modo: 'fonte', fonte: 'nao' }, { Authorization: 'Bearer token-editor' }), deps)).status).toBe(404);
  });
});

// Busca do Google News: cada item traz o site de origem em <source url>.
const noticiaDoGoogle = (site: string, titulo = 'Notícia') =>
  `<item><title>${titulo}</title><link>https://news.google.com/rss/articles/x</link><source url="${site}">Site</source></item>`;
const GOOGLE = (...sites: string[]) => `<rss version="2.0"><channel><title>Google News</title>${sites.map((s) => noticiaDoGoogle(s)).join('')}</channel></rss>`;

describe('descoberta de fontes', () => {
  it('dominioDe tira o www e recusa o que não é http', () => {
    expect(dominioDe('https://www.Gazeta.com.br/futebol')).toBe('gazeta.com.br');
    expect(dominioDe('ftp://x.com')).toBeNull();
    expect(dominioDe('nada')).toBeNull();
  });

  it('busca no Google News no idioma do país do clube', () => {
    expect(buscaDoGoogleNews({ id: 1, nome: 'Clube A', pais: 'BR' })).toBe('https://news.google.com/rss/search?q=Clube%20A%20futebol&hl=pt-BR&gl=BR&ceid=BR:pt-419');
    expect(buscaDoGoogleNews({ id: 2, nome: 'Club B', pais: 'AR' })).toContain('q=Club%20B%20football&hl=en-US');
  });

  it('origensDoGoogleNews conta as notícias de cada site', () => {
    const origens = origensDoGoogleNews(GOOGLE('https://gazeta.com.br', 'https://www.gazeta.com.br/', 'https://raca.blog'));
    expect([...origens]).toEqual([
      ['gazeta.com.br', { site: 'https://gazeta.com.br/', aparicoes: 2 }],
      ['raca.blog', { site: 'https://raca.blog/', aparicoes: 1 }],
    ]);
  });

  it('confere o feed só dos sites novos e registra o que tem e o que não tem feed', async () => {
    const paginas: Record<string, string> = {
      [buscaDoGoogleNews({ id: 10, nome: 'Clube A', pais: 'BR' })]: GOOGLE('https://raca.blog', 'https://gazeta.com.br', 'https://youtube.com', 'https://semfeed.com'),
      [buscaDoGoogleNews({ id: 20, nome: 'Clube B', pais: 'BR' })]: GOOGLE('https://raca.blog', 'https://raca.blog'),
      'https://raca.blog/': '<link rel="alternate" type="application/atom+xml" href="/feed">',
      'https://raca.blog/feed': ATOM,
      'https://semfeed.com/': '<html><head></head></html>',
    };
    const deps = dependencias({
      baixar: vi.fn(async (url: string): Promise<Baixado> => (paginas[url] ? { status: 200, tipo: 'text/xml', texto: paginas[url], url } : { status: 404, tipo: '', texto: '', url })),
      contextoDaDescoberta: vi.fn(async () => ({
        clubes: [
          { id: 10, nome: 'Clube A', pais: 'BR' },
          { id: 20, nome: 'Clube B', pais: 'BR' },
        ],
        conhecidos: ['gazeta.com.br'],
      })),
    });

    const resposta = await buscarNoticias(pedido({ modo: 'descobrir' }, { 'x-segredo': 'segredo' }), deps);
    expect(await resposta.json()).toEqual({ ok: true, clubes: 2, sites: 2, conferidos: 2, novas: 1, interrompida: false });
    expect(deps.iniciarDescoberta).toHaveBeenCalledWith(true);
    expect(deps.registrarSugestoes).toHaveBeenCalledWith([
      {
        dominio: 'raca.blog',
        achada_para: [10, 20],
        aparicoes: 3,
        ok: true,
        feed: 'https://raca.blog/feed',
        nome: 'Blog Raça',
        site: 'https://raca.blog/',
        itens: 1,
        por_dia: 0.1,
        exemplos: ['Reforço para o ataque'],
        textos: ['Reforço para o ataque Centroavante chega por empréstimo.'],
      },
      { dominio: 'semfeed.com', achada_para: [10], aparicoes: 1, ok: false, nome: 'semfeed.com', erro: 'Nenhum feed RSS encontrado nesse endereço' },
    ]);
    // O site que já é fonte e a rede social nem são abertos.
    expect(deps.baixar).not.toHaveBeenCalledWith('https://gazeta.com.br/');
    expect(deps.baixar).not.toHaveBeenCalledWith('https://youtube.com/');
  });

  it('busca do Google que falha não derruba a rodada', async () => {
    const deps = dependencias({
      baixar: vi.fn(async () => {
        throw new Error('timeout');
      }),
      contextoDaDescoberta: vi.fn(async () => ({ clubes: [{ id: 10, nome: 'Clube A', pais: 'BR' }], conhecidos: [] })),
    });
    const resposta = await buscarNoticias(pedido({ modo: 'descobrir' }, { Authorization: 'Bearer token-editor' }), deps);
    expect(await resposta.json()).toEqual({ ok: true, clubes: 1, sites: 0, conferidos: 0, novas: 0, interrompida: false });
    expect(deps.registrarSugestoes).not.toHaveBeenCalled();
  });

  it('erro passageiro não vira sem feed; feed vazio não vira sugestão', async () => {
    const google = buscaDoGoogleNews({ id: 10, nome: 'Clube A', pais: 'BR' });
    const deps = dependencias({
      baixar: vi.fn(async (url: string): Promise<Baixado> => {
        if (url === google) return { status: 200, tipo: 'text/xml', texto: GOOGLE('https://caiu.com', 'https://vazio.com'), url };
        if (url === 'https://caiu.com/') return { status: 503, tipo: '', texto: '', url };
        if (url === 'https://vazio.com/') return { status: 200, tipo: 'text/xml', texto: '<rss><channel><title>Vazio</title></channel></rss>', url };
        throw new Error('timeout');
      }),
      contextoDaDescoberta: vi.fn(async () => ({ clubes: [{ id: 10, nome: 'Clube A', pais: 'BR' }], conhecidos: [] })),
    });
    const resposta = await buscarNoticias(pedido({ modo: 'descobrir' }, { 'x-segredo': 'segredo' }), deps);
    expect(await resposta.json()).toMatchObject({ conferidos: 2, novas: 0 });
    expect(deps.registrarSugestoes).toHaveBeenCalledWith([{ dominio: 'vazio.com', achada_para: [10], aparicoes: 1, ok: false, nome: 'vazio.com', erro: 'O feed não tem notícias' }]);
  });

  it('com o prazo vencido para e grava só o que já conferiu', async () => {
    const deps = dependencias({
      contextoDaDescoberta: vi.fn(async () => ({ clubes: [{ id: 10, nome: 'Clube A', pais: 'BR' }], conhecidos: [] })),
      prazoDaDescoberta: -1,
    });
    const resposta = await buscarNoticias(pedido({ modo: 'descobrir' }, { 'x-segredo': 'segredo' }), deps);
    expect(await resposta.json()).toMatchObject({ conferidos: 0, interrompida: true });
    expect(deps.baixar).not.toHaveBeenCalled();
  });

  it('equipe que pede de novo em menos de 10 min recebe 429', async () => {
    const deps = dependencias({ iniciarDescoberta: vi.fn(async (doCron: boolean) => doCron) });
    const resposta = await buscarNoticias(pedido({ modo: 'descobrir' }, { Authorization: 'Bearer token-editor' }), deps);
    expect(resposta.status).toBe(429);
    expect(deps.iniciarDescoberta).toHaveBeenCalledWith(false);
    expect(deps.contextoDaDescoberta).not.toHaveBeenCalled();
  });

  it('moderador não dispara a descoberta', async () => {
    expect((await buscarNoticias(pedido({ modo: 'descobrir' }, { Authorization: 'Bearer token-moderador' }), dependencias())).status).toBe(401);
  });
});
