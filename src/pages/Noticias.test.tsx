import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMENTARIOS_POR_PAGINA } from '../data/noticias';
import { MENSAGEM_SILENCIADO, MENSAGEM_SUSPENSO, textoDoSilencio } from '../data/restricoes';
import { noticiaDeTeste, type ComentarioDeTeste, type NoticiaDeTeste } from '../test/noticiasDeTeste';
import { renderApp } from '../test/renderApp';
import { perfilDeTeste, supabaseFalso } from '../test/supabaseFalso';
import { lancarXp } from '../test/xpDeTeste';

// Quarta 14/10/2026, 12:00 em Brasília.
const AGORA = '2026-10-14T15:00:00Z';
const banco = () => supabaseFalso.noticias();

function noticia(campos: Partial<NoticiaDeTeste> = {}) {
  const n = noticiaDeTeste(campos);
  banco().noticias.push(n);
  return n;
}

function comentario(n: NoticiaDeTeste, campos: Partial<ComentarioDeTeste> & { autor_id: string; texto: string }) {
  const c: ComentarioDeTeste = { id: (banco().comentarios.at(-1)?.id ?? 0) + 1, noticia_id: n.id, curtidas: 0, oculto: false, criado_em: '2026-10-14T13:00:00Z', ...campos };
  banco().comentarios.push(c);
  if (!c.oculto) n.comentarios += 1;
  return c;
}

/** A mais recente, uma de outra fonte e uma de todas as torcidas, mais as que não podem aparecer. */
function cenario() {
  const a = noticia({
    titulo: 'Meia titular volta de suspensão e deve começar jogando',
    resumo: 'Comissão técnica confirmou o retorno no treino desta quinta.',
    link: 'https://gazeta.example.com/meia-volta',
    publicada_em: '2026-10-14T13:00:00Z',
  });
  const b = noticia({ titulo: 'Clube encaminha renovação do lateral-direito até 2029', fonte: 'ge', publicada_em: '2026-10-13T15:00:00Z' });
  const c = noticia({ titulo: 'Seleção de base convoca garotos de todas as torcidas', clubes: [], publicada_em: '2026-10-12T15:00:00Z' });
  noticia({ titulo: 'Notícia do Corinthians que não é minha', clubes: [167], publicada_em: '2026-10-14T14:00:00Z' });
  noticia({ titulo: 'Recebida na fila que ninguém pode ver', estado: 'recebida', publicada_em: null });
  noticia({ titulo: 'Descartada pela equipe de revisão', estado: 'descartada', publicada_em: '2026-10-14T14:30:00Z' });
  return { a, b, c };
}

function abrir(rota = '/noticias') {
  supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'bia', apelido: 'Bia.T' }));
  supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'gus', apelido: 'gustavo.b' }));
  supabaseFalso.logar(perfilDeTeste());
  return renderApp(rota);
}

const artigo = (titulo: string) => screen.findByRole('article', { name: titulo });
const maisNoticias = () => screen.findByRole('list', { name: 'Mais notícias' });
const leiturasComXp = () => supabaseFalso.xp().lancamentos.filter((l) => l.acao === 'leitura_noticia');
const chamadas = (fn: string) => supabaseFalso.cliente.rpc.mock.calls.filter(([nome]) => nome === fn);

/**
 * Segura a resposta de `fn` até `soltar()` (as outras RPCs seguem normais). `resposta` troca o que volta; sem ela,
 * o falso responde (e grava) só depois de soltar.
 */
function segurar(fn: string, resposta?: () => unknown) {
  const { rpc } = supabaseFalso.cliente;
  const real = rpc.getMockImplementation()!;
  let soltar!: () => void;
  const portao = new Promise<void>((r) => (soltar = r));
  const respondidas: unknown[] = [];
  rpc.mockImplementation(async (nome: string, args?: unknown) => {
    if (nome !== fn) return real(nome, args);
    await portao;
    const r = resposta ? resposta() : await real(nome, args);
    respondidas.push(r);
    return r;
  });
  return { soltar: () => soltar(), respondidas };
}

/** Deixa as promessas e os re-renders pendentes rodarem. */
const assentar = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => vi.useFakeTimers({ now: new Date(AGORA), shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('notícias do clube (W09)', () => {
  it('mostra a mais recente em destaque, com fonte e resumo, e as outras publicadas para mim na lista', async () => {
    const { a, b, c } = cenario();
    abrir();
    const destaque = await artigo(a.titulo);
    expect(destaque).toHaveTextContent('Gazeta Esportiva· há 2 h');
    expect(destaque).toHaveTextContent('Comissão técnica confirmou o retorno no treino desta quinta.');
    expect(destaque).toHaveTextContent('+10 XP por ler');

    const lista = await maisNoticias();
    expect(within(lista).getAllByRole('link').map((l) => l.textContent)).toEqual([
      `${b.titulo}ge · há 1 dia · 0 comentários`,
      `${c.titulo}Gazeta Esportiva · há 2 dias · 0 comentários`,
    ]);
    expect(screen.queryByText(/Corinthians que não é minha|Recebida na fila|Descartada pela equipe/)).not.toBeInTheDocument();
    // Sem categorias (as fontes não têm) e sem o áudio do mock (fica para a etapa 2).
    expect(screen.queryByRole('group', { name: 'Filtrar por categoria' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Flash da torcida|ao ouvir/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Notícias/ })).toHaveAttribute('aria-current', 'page');
  });

  it('"Ler no site" é um link para o original em nova aba e conta o clique', async () => {
    const { a } = cenario();
    abrir();
    const original = within(await artigo(a.titulo)).getByRole('link', { name: 'Ler no site' });
    expect(original).toHaveAttribute('href', 'https://gazeta.example.com/meia-volta');
    expect(original).toHaveAttribute('target', '_blank');
    expect(original).toHaveAttribute('rel', 'noopener noreferrer');
    // fireEvent: o jsdom não abre aba; o que importa é o clique chamar abrir_original sem segurar o link.
    fireEvent.click(original);
    await waitFor(() => expect(banco().cliques).toEqual([{ noticia_id: a.id, usuario_id: 'usuario-1' }]));
    expect(banco().noticias.find((n) => n.id === a.id)!.cliques).toBe(1);
    expect(chamadas('abrir_original')).toEqual([['abrir_original', { p_id: a.id }]]);
  });

  it('abrir uma da lista navega, conta a leitura e o XP sobe; reabrir não credita de novo', async () => {
    const { a, c } = cenario();
    const { user, local } = abrir();
    const destaque = await artigo(a.titulo);
    // Entrar em /noticias não lê: o destaque só convida.
    expect(destaque).toHaveTextContent('+10 XP por ler');
    await waitFor(() => expect(within(screen.getByRole('banner')).getByText('1º · 20 XP')).toBeInTheDocument());

    await user.click(within(await maisNoticias()).getByRole('link', { name: new RegExp(c.titulo) }));
    expect(local()).toBe(`/noticias/${c.id}`);
    const aberta = await artigo(c.titulo);
    expect(await within(aberta).findByRole('status')).toHaveTextContent('+10 XP pela leitura');
    await waitFor(() => expect(within(screen.getByRole('banner')).getByText('1º · 30 XP')).toBeInTheDocument());

    await user.click(within(await maisNoticias()).getByRole('link', { name: new RegExp(a.titulo) }));
    expect(await within(await artigo(a.titulo)).findByRole('status')).toHaveTextContent('+10 XP pela leitura');
    await waitFor(() => expect(within(screen.getByRole('banner')).getByText('1º · 40 XP')).toBeInTheDocument());

    await user.click(within(await maisNoticias()).getByRole('link', { name: new RegExp(c.titulo) }));
    const reaberta = await artigo(c.titulo);
    expect(await within(reaberta).findByText('Lida')).toBeInTheDocument();
    expect(within(reaberta).queryByText(/XP por ler/)).not.toBeInTheDocument();
    expect(leiturasComXp()).toHaveLength(2);
    // Uma chamada por notícia aberta, sem repetir em re-render, e nenhuma para a já lida.
    expect(chamadas('ler_noticia').map(([, x]) => x.p_id)).toEqual([c.id, a.id]);
  });

  it('depois das 3 leituras com XP do dia, a notícia fica lida sem XP', async () => {
    const a = noticia({ titulo: 'Quarta notícia lida hoje pelo torcedor' });
    for (let i = 0; i < 3; i += 1) lancarXp(supabaseFalso.xp(), { usuario_id: 'usuario-1', acao: 'leitura_noticia', criado_em: '2026-10-14T13:00:00Z' });
    abrir(`/noticias/${a.id}`);
    expect(await within(await artigo(a.titulo)).findByText('Lida')).toBeInTheDocument();
    expect(leiturasComXp()).toHaveLength(3);
    expect(banco().leituras).toEqual([expect.objectContaining({ noticia_id: a.id, usuario_id: 'usuario-1' })]);
  });

  it('usa a imagem do feed direto e cai no listrado sem imagem ou quando ela não carrega', async () => {
    const a = noticia({ titulo: 'Notícia com imagem vinda do feed', imagem_url: 'https://img.gazeta.example.com/meia.jpg', publicada_em: '2026-10-14T13:00:00Z' });
    const b = noticia({ titulo: 'Notícia sem imagem nenhuma no feed', publicada_em: '2026-10-14T12:00:00Z' });
    const { user } = abrir();
    const destaque = await artigo(a.titulo);
    // Decorativa (alt vazio): o título já está no h3.
    const imagem = destaque.querySelector('img')!;
    expect(imagem).toHaveAttribute('src', 'https://img.gazeta.example.com/meia.jpg');
    expect(imagem).toHaveAttribute('alt', '');
    fireEvent.error(imagem);
    expect(destaque.querySelector('img')).toBeNull();

    await user.click(within(await maisNoticias()).getByRole('link', { name: new RegExp(b.titulo) }));
    const semImagem = await artigo(b.titulo);
    expect(semImagem.querySelector('img')).toBeNull();
  });

  it('curte e descurte a notícia', async () => {
    const a = noticia({ titulo: 'Notícia para curtir e descurtir', curtidas: 4 });
    const { user } = abrir();
    const destaque = await artigo(a.titulo);
    const curtir = within(destaque).getByRole('button', { name: /Curtir a notícia/ });
    expect(curtir).toHaveAttribute('aria-pressed', 'false');
    await user.click(curtir);
    await waitFor(() => expect(curtir).toHaveAttribute('aria-pressed', 'true'));
    expect(curtir).toHaveTextContent('5');
    expect(banco().curtidas).toEqual([{ noticia_id: a.id, usuario_id: 'usuario-1' }]);
    await user.click(curtir);
    await waitFor(() => expect(curtir).toHaveAttribute('aria-pressed', 'false'));
    expect(curtir).toHaveTextContent('4');
    expect(banco().curtidas).toEqual([]);
  });

  it('comenta: o comentário aparece, o contador sobe e o segundo seguido é barrado com a mensagem traduzida', async () => {
    const a = noticia({ titulo: 'Notícia para comentar agora mesmo' });
    const { user } = abrir();
    const destaque = await artigo(a.titulo);
    expect(await within(destaque).findByText('Ninguém comentou ainda. Abra a conversa!')).toBeInTheDocument();
    await user.type(within(destaque).getByRole('textbox', { name: 'Escreva um comentário' }), 'Esse volta voando');
    await user.click(within(destaque).getByRole('button', { name: 'Publicar' }));

    const conversa = await within(destaque).findByRole('list', { name: 'Comentários' });
    expect(within(conversa).getByText('Esse volta voando')).toBeInTheDocument();
    expect(conversa).toHaveTextContent('Rafa_9');
    expect(within(destaque).getByRole('heading', { name: '1 comentário' })).toBeInTheDocument();
    expect(within(destaque).getByRole('img', { name: '1 comentário' })).toHaveTextContent('1');
    expect(within(destaque).getByRole('textbox', { name: 'Escreva um comentário' })).toHaveValue('');

    await user.type(within(destaque).getByRole('textbox', { name: 'Escreva um comentário' }), 'Mais um');
    await user.click(within(destaque).getByRole('button', { name: 'Publicar' }));
    expect(await within(destaque).findByRole('alert')).toHaveTextContent('Calma, um comentário de cada vez.');
    expect(banco().comentarios).toHaveLength(1);
  });

  it('apaga o próprio comentário (e só o próprio tem o botão)', async () => {
    const a = noticia({ titulo: 'Notícia com comentário meu e de outro' });
    comentario(a, { autor_id: 'usuario-1', texto: 'Comentário meu' });
    comentario(a, { autor_id: 'bia', texto: 'Comentário da Bia' });
    const { user } = abrir();
    const conversa = await within(await artigo(a.titulo)).findByRole('list', { name: 'Comentários' });
    const [meu, daBia] = within(conversa).getAllByRole('listitem');
    expect(within(daBia).queryByRole('button', { name: /Apagar/ })).not.toBeInTheDocument();
    // Nada de botões que o banco não tem.
    expect(screen.queryByRole('button', { name: /Responder|Denunciar/ })).not.toBeInTheDocument();

    await user.click(within(meu).getByRole('button', { name: 'Apagar meu comentário: Comentário meu' }));
    await waitFor(() => expect(within(conversa).queryByText('Comentário meu')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: '1 comentário' })).toBeInTheDocument();
    expect(banco().comentarios.map((c) => c.texto)).toEqual(['Comentário da Bia']);
  });

  it('curte o comentário de outro torcedor', async () => {
    const a = noticia({ titulo: 'Notícia com comentário para curtir' });
    comentario(a, { autor_id: 'bia', texto: 'Comentário da Bia', curtidas: 2 });
    const { user } = abrir();
    const botao = await within(await artigo(a.titulo)).findByRole('button', { name: /Curtir o comentário de Bia.T/ });
    await user.click(botao);
    await waitFor(() => expect(botao).toHaveAttribute('aria-pressed', 'true'));
    expect(botao).toHaveTextContent('3');
  });

  it('ordena por relevantes (mais curtidos) ou recentes', async () => {
    const a = noticia({ titulo: 'Notícia com comentários para ordenar' });
    comentario(a, { autor_id: 'bia', texto: 'Antigo e curtido', curtidas: 5, criado_em: '2026-10-14T13:00:00Z' });
    comentario(a, { autor_id: 'gus', texto: 'Novo e sem curtida', criado_em: '2026-10-14T14:00:00Z' });
    const { user } = abrir();
    const destaque = await artigo(a.titulo);
    const textos = () => within(within(destaque).getByRole('list', { name: 'Comentários' })).getAllByRole('paragraph').map((p) => p.textContent);
    await within(destaque).findByRole('list', { name: 'Comentários' });
    expect(textos()).toEqual(['Antigo e curtido', 'Novo e sem curtida']);
    await user.click(within(destaque).getByRole('button', { name: 'Recentes' }));
    await waitFor(() => expect(textos()).toEqual(['Novo e sem curtida', 'Antigo e curtido']));
  });

  it('comentário meu oculto pela moderação aparece só para mim como removido', async () => {
    const a = noticia({ titulo: 'Notícia com comentários ocultos' });
    comentario(a, { autor_id: 'usuario-1', texto: 'Meu comentário feio', oculto: true });
    comentario(a, { autor_id: 'bia', texto: 'Comentário feio da Bia', oculto: true });
    abrir();
    const destaque = await artigo(a.titulo);
    expect(await within(destaque).findByText('Comentário removido pela moderação')).toBeInTheDocument();
    expect(within(destaque).getByText(/Meu comentário feio/)).toBeInTheDocument();
    expect(within(destaque).queryByText(/Comentário feio da Bia/)).not.toBeInTheDocument();
    expect(within(destaque).queryByRole('button', { name: /Curtir o comentário/ })).not.toBeInTheDocument();
  });

  it('silenciado vê o aviso no lugar do campo, mas ainda curte', async () => {
    const a = noticia({ titulo: 'Notícia para quem está silenciado' });
    const ate = '2026-10-15T23:00:00Z';
    supabaseFalso.restricoes().push({ usuario_id: 'usuario-1', tipo: 'silencio', ate });
    const { user } = abrir();
    const destaque = await artigo(a.titulo);
    expect(await within(destaque).findByText(textoDoSilencio(new Date(ate)))).toBeInTheDocument();
    expect(within(destaque).queryByRole('textbox', { name: 'Escreva um comentário' })).not.toBeInTheDocument();
    await user.click(within(destaque).getByRole('button', { name: /Curtir a notícia/ }));
    await waitFor(() => expect(banco().curtidas).toHaveLength(1));
  });

  it('suspensão aplicada com a tela aberta: a curtida é recusada e o campo some', async () => {
    const a = noticia({ titulo: 'Notícia para quem acabou de ser suspenso' });
    const { user } = abrir();
    const destaque = await artigo(a.titulo);
    await within(destaque).findByRole('textbox', { name: 'Escreva um comentário' });
    supabaseFalso.restricoes().push({ usuario_id: 'usuario-1', tipo: 'suspensao', ate: '2026-10-20T12:00:00Z' });
    await user.click(within(destaque).getByRole('button', { name: /Curtir a notícia/ }));
    expect(await within(destaque).findByRole('alert')).toHaveTextContent(MENSAGEM_SUSPENSO);
    await waitFor(() => expect(within(destaque).queryByRole('textbox', { name: 'Escreva um comentário' })).not.toBeInTheDocument());
    expect(banco().curtidas).toEqual([]);
  });

  it('notícia de outro clube ou inexistente: "não encontrada"', async () => {
    const outra = noticia({ titulo: 'Notícia só do Corinthians', clubes: [167] });
    const { user } = abrir(`/noticias/${outra.id}`);
    expect(await screen.findByText(/Notícia não encontrada/)).toBeInTheDocument();
    expect(screen.queryByText(outra.titulo)).not.toBeInTheDocument();
    expect(chamadas('ler_noticia')).toHaveLength(0);
    await user.click(screen.getByRole('link', { name: 'Ver as notícias' }));
    expect(await screen.findByText('Ainda não há notícias do seu clube.')).toBeInTheDocument();
  });

  it('id que não existe também é "não encontrada"', async () => {
    abrir('/noticias/00000000-0000-4000-9000-999999999999');
    expect(await screen.findByText(/Notícia não encontrada/)).toBeInTheDocument();
  });

  it('sem notícias publicadas para o meu clube: avisa', async () => {
    noticia({ titulo: 'Só tem notícia de outra torcida', clubes: [167] });
    noticia({ titulo: 'E uma que ainda está na fila', estado: 'recebida', publicada_em: null });
    abrir();
    expect(await screen.findByText('Ainda não há notícias do seu clube.')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('erro ao carregar: mostra o aviso e tenta de novo', async () => {
    const a = noticia({ titulo: 'Notícia que chega na segunda tentativa' });
    const { rpc } = supabaseFalso.cliente;
    const real = rpc.getMockImplementation()!;
    let falhar = true;
    rpc.mockImplementation(async (fn: string, args?: unknown) =>
      fn === 'noticias_do_clube' && falhar ? { data: null, error: { code: '08000', message: 'sem conexão' } } : real(fn, args),
    );
    const { user } = abrir();
    expect(await screen.findByText('Não deu para carregar as notícias. Verifique sua conexão.')).toBeInTheDocument();
    falhar = false;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await artigo(a.titulo)).toBeInTheDocument();
  });

  it('carrega mais notícias pela data da última', async () => {
    for (let i = 0; i < 12; i += 1) noticia({ titulo: `Notícia de número ${String(i + 1).padStart(2, '0')} da semana`, publicada_em: `2026-10-${String(14 - Math.floor(i / 2)).padStart(2, '0')}T${i % 2 ? '10' : '12'}:00:00Z` });
    const { user } = abrir();
    await artigo('Notícia de número 01 da semana');
    expect(within(await maisNoticias()).getAllByRole('link')).toHaveLength(9);
    await user.click(screen.getByRole('button', { name: 'Carregar mais notícias' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Mais notícias' })).getAllByRole('link')).toHaveLength(11));
    expect(screen.queryByRole('button', { name: 'Carregar mais notícias' })).not.toBeInTheDocument();
    const ultima = banco().noticias.find((n) => n.titulo === 'Notícia de número 10 da semana')!;
    expect(chamadas('noticias_do_clube').at(-1)![1]).toEqual({ p_limite: 10, p_antes: '2026-10-10T10:00:00Z', p_antes_id: ultima.id });
  });

  describe('correções da revisão', () => {
    // Bug: a curtida de A respondia depois da troca para B e caía em B (contadores e "curti" de A em B).
    it('curtir e trocar de notícia antes da resposta: a outra notícia fica intacta', async () => {
      const { a, b } = cenario();
      a.curtidas = 4;
      const { user } = abrir();
      const segura = segurar('curtir_noticia');
      await user.click(within(await artigo(a.titulo)).getByRole('button', { name: /Curtir a notícia/ }));
      await user.click(within(await maisNoticias()).getByRole('link', { name: new RegExp(b.titulo) }));
      const outra = await artigo(b.titulo);
      segura.soltar();
      await waitFor(() => expect(segura.respondidas).toHaveLength(1));
      await assentar();
      const curtirB = within(outra).getByRole('button', { name: /Curtir a notícia/ });
      expect(curtirB).toHaveAttribute('aria-pressed', 'false');
      expect(curtirB).toHaveTextContent('0');
      expect(banco().curtidas).toEqual([{ noticia_id: a.id, usuario_id: 'usuario-1' }]);
    });

    // Bug: o erro da curtida de A aparecia como aviso em B.
    it('erro da curtida que chega depois da troca não aparece na outra notícia', async () => {
      const { a, b } = cenario();
      const { user } = abrir();
      const segura = segurar('curtir_noticia', () => ({ data: null, error: { code: 'P0001', message: 'x', hint: 'noticia_inexistente' } }));
      await user.click(within(await artigo(a.titulo)).getByRole('button', { name: /Curtir a notícia/ }));
      await user.click(within(await maisNoticias()).getByRole('link', { name: new RegExp(b.titulo) }));
      const outra = await artigo(b.titulo);
      segura.soltar();
      await waitFor(() => expect(segura.respondidas).toHaveLength(1));
      await assentar();
      expect(within(outra).queryByRole('alert')).not.toBeInTheDocument();
    });

    // Bug: duplo clique em Apagar mandava duas chamadas e o contador caía 2.
    it('duplo clique em Apagar: uma chamada só e o contador cai 1', async () => {
      const a = noticia({ titulo: 'Notícia com dois comentários meus' });
      comentario(a, { autor_id: 'usuario-1', texto: 'Primeiro meu' });
      comentario(a, { autor_id: 'bia', texto: 'Da Bia' });
      const { user } = abrir(`/noticias/${a.id}`);
      const destaque = await artigo(a.titulo);
      const apagar = await within(destaque).findByRole('button', { name: 'Apagar meu comentário: Primeiro meu' });
      const segura = segurar('apagar_comentario_da_noticia');
      await user.dblClick(apagar);
      segura.soltar();
      await waitFor(() => expect(within(destaque).queryByText('Primeiro meu')).not.toBeInTheDocument());
      await assentar();
      expect(chamadas('apagar_comentario_da_noticia')).toHaveLength(1);
      expect(within(destaque).getByRole('heading', { name: '1 comentário' })).toBeInTheDocument();
    });

    // Bug: o total vinha do closure; duas respostas seguidas partiam do mesmo valor velho.
    it('apagar dois comentários com as respostas juntas desconta os dois', async () => {
      const a = noticia({ titulo: 'Notícia com três comentários meus' });
      comentario(a, { autor_id: 'usuario-1', texto: 'Meu um' });
      comentario(a, { autor_id: 'usuario-1', texto: 'Meu dois' });
      comentario(a, { autor_id: 'usuario-1', texto: 'Meu três' });
      const { user } = abrir(`/noticias/${a.id}`);
      const destaque = await artigo(a.titulo);
      await within(destaque).findByRole('button', { name: 'Apagar meu comentário: Meu um' });
      const segura = segurar('apagar_comentario_da_noticia');
      await user.click(within(destaque).getByRole('button', { name: 'Apagar meu comentário: Meu um' }));
      await user.click(within(destaque).getByRole('button', { name: 'Apagar meu comentário: Meu dois' }));
      segura.soltar();
      await waitFor(() => expect(within(destaque).getByRole('heading', { name: '1 comentário' })).toBeInTheDocument());
      expect(within(destaque).getByRole('img', { name: '1 comentário' })).toBeInTheDocument();
    });

    // Bug: falha em ler_noticia virava "Lida" e não tentava de novo.
    it('se a leitura falha, não mostra "Lida" e tenta de novo ao reabrir', async () => {
      const { a, b } = cenario();
      const { rpc } = supabaseFalso.cliente;
      const real = rpc.getMockImplementation()!;
      let falhas = 1;
      rpc.mockImplementation(async (fn: string, args?: unknown) =>
        fn === 'ler_noticia' && falhas-- > 0 ? { data: null, error: { code: '08000', message: 'sem conexão' } } : real(fn, args),
      );
      const { user } = abrir(`/noticias/${a.id}`);
      const primeira = await artigo(a.titulo);
      await waitFor(() => expect(chamadas('ler_noticia')).toHaveLength(1));
      await assentar();
      expect(within(primeira).queryByText('Lida')).not.toBeInTheDocument();
      expect(primeira).toHaveTextContent('+10 XP por ler');

      await user.click(within(await maisNoticias()).getByRole('link', { name: new RegExp(b.titulo) }));
      await artigo(b.titulo);
      await user.click(within(await maisNoticias()).getByRole('link', { name: new RegExp(a.titulo) }));
      expect(await within(await artigo(a.titulo)).findByRole('status')).toHaveTextContent('+10 XP pela leitura');
      expect(chamadas('ler_noticia').filter(([, x]) => x.p_id === a.id)).toHaveLength(2);
    });

    it('notícia que já vem lida não chama ler_noticia', async () => {
      const a = noticia({ titulo: 'Notícia que eu já tinha lido ontem' });
      banco().leituras.push({ noticia_id: a.id, usuario_id: 'usuario-1', lida_em: '2026-10-13T12:00:00Z' });
      abrir(`/noticias/${a.id}`);
      expect(await within(await artigo(a.titulo)).findByText('Lida')).toBeInTheDocument();
      await within(await artigo(a.titulo)).findByText('Ninguém comentou ainda. Abra a conversa!');
      expect(chamadas('ler_noticia')).toHaveLength(0);
    });

    // Bug: /noticias/abc ia ao banco, que recusa com 22P02, e a tela mostrava erro de conexão.
    it('id que nem é uuid: "não encontrada" sem chamar o banco', async () => {
      noticia({ titulo: 'Uma notícia qualquer do meu clube' });
      abrir('/noticias/abc');
      expect(await screen.findByText(/Notícia não encontrada/)).toBeInTheDocument();
      expect(chamadas('noticia')).toHaveLength(0);
      expect(screen.queryByText(/Verifique sua conexão/)).not.toBeInTheDocument();
    });

    it('entrar em /noticias não credita; "Ler no site" no destaque credita a leitura', async () => {
      const { a } = cenario();
      abrir();
      const destaque = await artigo(a.titulo);
      await within(destaque).findByText('Ninguém comentou ainda. Abra a conversa!');
      expect(chamadas('ler_noticia')).toHaveLength(0);
      expect(destaque).toHaveTextContent('+10 XP por ler');
      fireEvent.click(within(destaque).getByRole('link', { name: 'Ler no site' }));
      expect(await within(destaque).findByRole('status')).toHaveTextContent('+10 XP pela leitura');
      expect(leiturasComXp()).toHaveLength(1);
      expect(banco().cliques).toHaveLength(1);
    });

    it('clique do meio em "Ler no site" também conta', async () => {
      const { a } = cenario();
      abrir();
      const original = within(await artigo(a.titulo)).getByRole('link', { name: 'Ler no site' });
      fireEvent(original, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
      await waitFor(() => expect(banco().cliques).toEqual([{ noticia_id: a.id, usuario_id: 'usuario-1' }]));
      // O botão direito (menu de contexto) não conta.
      fireEvent(original, new MouseEvent('auxclick', { bubbles: true, button: 2 }));
      await assentar();
      expect(banco().cliques).toHaveLength(1);
    });

    // Bug: "Carregar mais comentários" sumia ao apagar um da página cheia (decidia pelo tamanho da lista na tela).
    it('"Carregar mais comentários" segue a última busca, não o tamanho da lista na tela', async () => {
      const a = noticia({ titulo: 'Notícia com a página de comentários cheia' });
      comentario(a, { autor_id: 'usuario-1', texto: 'O meu na página cheia', curtidas: 9 });
      for (let i = 1; i < COMENTARIOS_POR_PAGINA + 5; i += 1) comentario(a, { autor_id: 'bia', texto: `Comentário ${i} da Bia` });
      const { user } = abrir(`/noticias/${a.id}`);
      const destaque = await artigo(a.titulo);
      await user.click(await within(destaque).findByRole('button', { name: 'Apagar meu comentário: O meu na página cheia' }));
      await waitFor(() => expect(within(destaque).queryByText('O meu na página cheia')).not.toBeInTheDocument());
      expect(within(destaque).getByRole('button', { name: 'Carregar mais comentários' })).toBeInTheDocument();
      await user.click(within(destaque).getByRole('button', { name: 'Carregar mais comentários' }));
      await waitFor(() => expect(within(within(destaque).getByRole('list', { name: 'Comentários' })).getAllByRole('listitem')).toHaveLength(COMENTARIOS_POR_PAGINA + 4));
      expect(within(destaque).queryByRole('button', { name: 'Carregar mais comentários' })).not.toBeInTheDocument();
    });

    // Bug: em "Relevantes" com a página cheia, o comentário novo (sem curtidas) não voltava na releitura e sumia.
    it('o comentário novo aparece mesmo em "Relevantes" com a lista cheia', async () => {
      const a = noticia({ titulo: 'Notícia com muitos comentários curtidos' });
      for (let i = 0; i < COMENTARIOS_POR_PAGINA; i += 1) comentario(a, { autor_id: 'bia', texto: `Curtido ${i}`, curtidas: 1 });
      const { user } = abrir(`/noticias/${a.id}`);
      const destaque = await artigo(a.titulo);
      await within(destaque).findByText('Curtido 0');
      await user.type(within(destaque).getByRole('textbox', { name: 'Escreva um comentário' }), 'Cheguei agora');
      await user.click(within(destaque).getByRole('button', { name: 'Publicar' }));
      const conversa = within(destaque).getByRole('list', { name: 'Comentários' });
      expect(await within(conversa).findByText('Cheguei agora')).toBeInTheDocument();
      expect(within(conversa).getAllByRole('listitem')[0]).toHaveTextContent('Cheguei agora');
      expect(within(destaque).getByRole('heading', { name: `${COMENTARIOS_POR_PAGINA + 1} comentários` })).toBeInTheDocument();
    });

    // Bug: silenciado com a tela aberta só via o campo sumir, sem explicação.
    it('silêncio aplicado com a tela aberta: comentar mostra a mensagem e o campo dá lugar ao aviso', async () => {
      const a = noticia({ titulo: 'Notícia para quem foi silenciado agora' });
      const { user } = abrir(`/noticias/${a.id}`);
      const destaque = await artigo(a.titulo);
      const campo = await within(destaque).findByRole('textbox', { name: 'Escreva um comentário' });
      supabaseFalso.restricoes().push({ usuario_id: 'usuario-1', tipo: 'silencio', ate: '2026-10-15T23:00:00Z' });
      await user.type(campo, 'Vou falar mesmo assim');
      await user.click(within(destaque).getByRole('button', { name: 'Publicar' }));
      expect(await within(destaque).findByRole('alert')).toHaveTextContent(MENSAGEM_SILENCIADO);
      await waitFor(() => expect(within(destaque).queryByRole('textbox', { name: 'Escreva um comentário' })).not.toBeInTheDocument());
      expect(banco().comentarios).toEqual([]);
    });

    it('comentário de quem não tem apelido aparece como "Torcedor"', async () => {
      const a = noticia({ titulo: 'Notícia com comentário de torcedor sem apelido' });
      supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'sem-apelido', apelido: null }));
      comentario(a, { autor_id: 'sem-apelido', texto: 'Comentário anônimo' });
      abrir(`/noticias/${a.id}`);
      const destaque = await artigo(a.titulo);
      const item = (await within(destaque).findByText('Comentário anônimo')).closest('li')!;
      expect(item).toHaveTextContent(/^TOTorcedor/);
      expect(within(item).getByRole('button', { name: /Curtir o comentário de Torcedor/ })).toBeInTheDocument();
    });
  });
});
