import { describe, expect, it, vi } from 'vitest';
import { buscarNoticias, feedNoHtml, lerFeed, porDia, textoPuro, type Baixado, type Dependencias } from './handler';

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
