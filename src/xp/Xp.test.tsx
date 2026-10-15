import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { partidaDeTeste } from '../test/catalogoDeTeste';
import { renderApp } from '../test/renderApp';
import { assinaturaDeTeste, perfilDeTeste, perfilNovo, supabaseFalso } from '../test/supabaseFalso';
import { lancarXp, type MissaoDeTeste } from '../test/xpDeTeste';

// Quarta 14/10/2026, 12:00 em Brasília: a semana começou na segunda 12/10.
const AGORA = '2026-10-14T15:00:00Z';
const xp = () => supabaseFalso.xp();
const lancar = (usuario_id: string, acao: string, campos: { xp?: number; criado_em?: string; detalhe?: string; fator?: number; missao_id?: string; partida_id?: number } = {}) =>
  lancarXp(xp(), { usuario_id, acao, criado_em: '2026-10-13T20:00:00Z', ...campos });

function missao(campos: Partial<MissaoDeTeste> & { titulo: string; acao: string }): MissaoDeTeste {
  const m: MissaoDeTeste = {
    id: `m-${xp().missoes.length + 1}`,
    regra: 'Faça a ação',
    icone: 'flag',
    tipo: 'semanal',
    meta: 1,
    xp: 100,
    status: 'ativa',
    ordem: xp().missoes.length,
    criado_em: '2026-10-01T12:00:00Z',
    ...campos,
  };
  xp().missoes.push(m);
  return m;
}

function abrir(rota: string, { membro = true } = {}) {
  supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'bia', apelido: 'Bia.T' }));
  supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'gus', apelido: 'gustavo.b' }));
  supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'fla', apelido: 'Do.Flamengo', time_id: 160 }));
  if (membro) supabaseFalso.assinar(assinaturaDeTeste());
  supabaseFalso.logar(perfilDeTeste());
  return renderApp(rota);
}

beforeEach(() => vi.useFakeTimers({ now: new Date(AGORA), shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('XP no app', () => {
  it('abrir o app conta o login do dia uma vez só', async () => {
    const { user } = abrir('/');
    await waitFor(() => expect(xp().lancamentos.filter((l) => l.acao === 'login_diario')).toHaveLength(1));
    await user.click(screen.getByRole('link', { name: /Jogos/ }));
    await user.click(screen.getByRole('link', { name: /Início/ }));
    expect(xp().lancamentos.filter((l) => l.acao === 'login_diario')).toHaveLength(1);
    expect(xp().lancamentos[0]).toMatchObject({ usuario_id: 'usuario-1', xp: 20 });
  });

  it('cabeçalho e início: nível, barra, posição na temporada e o ranking da torcida', async () => {
    lancar('usuario-1', 'palpite_exato', { xp: 1000 });
    lancar('bia', 'foto_campea', { xp: 2000 });
    lancar('gus', 'notas', { xp: 300 });
    lancar('fla', 'notas', { xp: 5000 }); // outra torcida: fora do ranking do Palmeiras, mas conta na temporada
    abrir('/');

    // 1000 + 20 do login de hoje = nível 4 (750 a 1.100).
    const topo = await screen.findByRole('banner');
    expect(await within(topo).findByText('NÍVEL 4')).toBeInTheDocument();
    expect(within(topo).getByText('3º · 1.020 XP')).toBeInTheDocument();
    expect(screen.getByText('270 / 350 XP')).toBeInTheDocument();
    expect(screen.getByText('80 XP para o nível 5')).toBeInTheDocument();

    const ranking = screen.getByRole('heading', { name: 'Ranking da torcida' }).parentElement!;
    await waitFor(() => expect(ranking).toHaveTextContent('1ºpersonBia.T2.000'));
    expect(ranking).toHaveTextContent('2ºpersonVocê · Rafa_91.020');
    expect(ranking).toHaveTextContent('3ºpersongustavo.b300');
    expect(ranking).not.toHaveTextContent('Do.Flamengo');
  });

  it('início: as três primeiras missões da semana, ou o aviso de que não há', async () => {
    abrir('/');
    expect(await screen.findByText('Nenhuma missão nesta semana.')).toBeInTheDocument();
  });

  it('início mostra o progresso das missões', async () => {
    missao({ titulo: 'Palpite em 2 jogos', acao: 'palpite_enviado', meta: 2 });
    missao({ titulo: 'Fale no chat', acao: 'mensagem_chat', meta: 10 });
    missao({ titulo: 'Avalie o time', acao: 'notas' });
    missao({ titulo: 'Quarta missão', acao: 'feedback' });
    lancar('usuario-1', 'palpite_enviado', { partida_id: 7290 });
    abrir('/');
    const card = (await screen.findByText('Palpite em 2 jogos')).closest('section')!;
    expect(card).toHaveTextContent('1/2');
    expect(card).toHaveTextContent('0/10');
    expect(card).not.toHaveTextContent('Quarta missão');
  });

  it('missões: progresso, concluída, XP da semana e a sequência de login', async () => {
    const palpite = missao({ titulo: 'Palpite em 2 jogos', regra: 'Envie palpite', acao: 'palpite_enviado', meta: 2, xp: 150 });
    missao({ titulo: 'Avalie o time', regra: 'Dê notas', acao: 'notas', tipo: 'por_jogo', xp: 80 });
    lancar('usuario-1', 'palpite_enviado', { partida_id: 7290, criado_em: '2026-10-12T22:00:00Z' });
    lancar('usuario-1', 'palpite_enviado', { partida_id: 7301, criado_em: '2026-10-13T22:00:00Z' });
    lancar('usuario-1', 'missao', { xp: 150, missao_id: palpite.id, detalhe: palpite.titulo, criado_em: '2026-10-13T22:00:01Z' });
    // Login no domingo (semana passada), segunda e terça; quarta entra ao abrir.
    for (const dia of ['2026-10-11', '2026-10-12', '2026-10-13']) lancar('usuario-1', 'login_diario', { criado_em: `${dia}T13:00:00Z` });
    abrir('/missoes');

    expect(await screen.findByText('reinicia segunda 00:00 · 4 d 11 h restantes')).toBeInTheDocument();
    const feita = (await screen.findByText('Palpite em 2 jogos')).parentElement!.parentElement!;
    expect(feita).toHaveTextContent('Envie palpite');
    expect(feita).toHaveTextContent('feita+150 XP');
    const aberta = screen.getByText('Avalie o time').parentElement!.parentElement!;
    expect(aberta).toHaveTextContent('Dê notas · num jogo');
    expect(aberta).toHaveTextContent('0/1+80 XP');

    // 50 + 50 + 150 + 20 (seg) + 20 (ter) + 20 (hoje) = 310 na semana.
    expect(await screen.findByText('310 / 2.000')).toBeInTheDocument();
    expect(screen.getByText('1.690 XP')).toBeInTheDocument();

    const sequencia = screen.getByRole('region', { name: 'Sequência de login' });
    await waitFor(() => expect(sequencia).toHaveTextContent('4 dias'));
    expect(within(sequencia).getByLabelText('seg: entrou')).toBeInTheDocument();
    expect(within(sequencia).getByLabelText('qua: entrou')).toBeInTheDocument();
    expect(within(sequencia).getByLabelText('qui')).toBeInTheDocument();
  });

  it('missões vazias', async () => {
    abrir('/missoes');
    expect(await screen.findByText('Nenhuma missão nesta semana')).toBeInTheDocument();
  });

  it('ranking: torcedores do clube por período e quanto falta para subir', async () => {
    lancar('bia', 'foto_campea', { xp: 2000, criado_em: '2026-09-20T12:00:00Z' }); // mês passado
    lancar('gus', 'notas', { xp: 300 });
    lancar('usuario-1', 'notas', { xp: 100 });
    const { user } = abrir('/ranking');

    expect(await screen.findByRole('heading', { name: 'Torcedores do Palmeiras' })).toBeInTheDocument();
    const linhas = async () => (await screen.findByText('Bia.T')).closest('section')!;
    expect(await linhas()).toHaveTextContent('1ºpersonBia.T2.000nv 7');
    expect(await linhas()).toHaveTextContent('3ºpersonVocê · Rafa_9120nv 1');
    expect(screen.getByText('120 XP · faltam 181 para o 2º')).toBeInTheDocument();

    // Em outubro, a Bia não pontuou: sai do ranking do mês.
    await user.click(screen.getByRole('tab', { name: 'mês' }));
    await waitFor(() => expect(screen.queryByText('Bia.T')).not.toBeInTheDocument());
    expect(screen.getByText('120 XP · faltam 181 para o 1º')).toBeInTheDocument();
  });

  it('ranking: quem lidera e período sem ninguém pontuando', async () => {
    lancar('gus', 'notas', { xp: 300, criado_em: '2026-10-01T12:00:00Z' });
    const { user } = abrir('/ranking');
    await screen.findByRole('heading', { name: 'Torcedores do Palmeiras' });
    // Na semana, só o login de hoje.
    await user.click(screen.getByRole('tab', { name: 'semana' }));
    expect(await screen.findByText('20 XP · você lidera a torcida')).toBeInTheDocument();
    expect(screen.queryByText('gustavo.b')).not.toBeInTheDocument();
  });

  it('ranking vazio', async () => {
    supabaseFalso.logar(perfilDeTeste());
    supabaseFalso.assinar(assinaturaDeTeste());
    // Ninguém pontuou: nem o login de hoje entrou.
    const original = supabaseFalso.cliente.rpc.getMockImplementation()!;
    supabaseFalso.cliente.rpc.mockImplementation(async (fn: string, args?: unknown) =>
      fn === 'registrar_presenca' ? ({ data: 0, error: null } as never) : original(fn, args as never),
    );
    renderApp('/ranking');
    expect(await screen.findByText('Ninguém da torcida ganhou XP nesta temporada.')).toBeInTheDocument();
    expect(screen.getByText('Sem XP nesta temporada')).toBeInTheDocument();
  });

  it('perfil: nível, posição e o histórico de XP com os detalhes do banco', async () => {
    lancar('usuario-1', 'palpite_exato', { detalhe: 'Placar exato: Palmeiras 2 x 1 Corinthians', partida_id: 7290, criado_em: '2026-10-14T01:30:00Z' });
    lancar('usuario-1', 'mensagem_chat', { detalhe: 'Palmeiras x Corinthians', fator: 2, xp: 4, criado_em: '2026-10-11T20:00:00Z' });
    lancar('usuario-1', 'missao', { xp: 150, detalhe: 'Palpite em 2 jogos', criado_em: '2026-10-12T20:00:00Z' });
    abrir('/perfil');

    const historico = (await screen.findByRole('heading', { name: 'Histórico de XP' })).closest('section')!;
    await waitFor(() => expect(within(historico).getAllByText(/^\+/)).toHaveLength(4));
    const textos = within(historico)
      .getAllByText(/^\+/)
      .map((xpDaLinha) => xpDaLinha.parentElement!.textContent);
    expect(textos).toEqual([
      expect.stringContaining('Login diáriohoje 12:00+20'),
      expect.stringContaining('Placar exato: Palmeiras 2 x 1 Corinthiansontem 22:30+240'),
      expect.stringContaining('Missão concluída: Palpite em 2 jogos2 d atrás+150'),
      expect.stringContaining('Mensagem no chat · Palmeiras x Corinthians3 d atrás · 2× XP+4'),
    ]);
    // 240 + 4 + 150 + 20 = 414: nível 2, 214 de 250.
    expect(screen.getByText('214 XP')).toBeInTheDocument();
    expect(screen.getByText('36 para o 3')).toBeInTheDocument();
    expect(screen.getByText('1º')).toBeInTheDocument();
  });

  it('os valores de XP das telas vêm das regras do banco', async () => {
    xp().regras.find((r) => r.acao === 'foto_enviada')!.xp = 45;
    xp().regras.find((r) => r.acao === 'foto_campea')!.xp = 600;
    supabaseFalso.adicionarPartida(partidaDeTeste());
    abrir('/jogo/7290/fotos');
    expect(await screen.findByRole('button', { name: /Enviar foto · \+45 XP/ })).toBeInTheDocument();
    const como = screen.getByRole('region', { name: 'Como ganhar XP aqui' });
    expect(como).toHaveTextContent('Enviar foto+45 XP');
    expect(como).toHaveTextContent('Foto mais votada+600 XP');
    // Joinha não rende XP.
    expect(como).not.toHaveTextContent('Dar joinha');
  });
});

describe('boas-vindas', () => {
  it('mostra o nível de verdade e as primeiras ações com o XP das regras', async () => {
    supabaseFalso.logar(perfilNovo({ time_id: null, onboarding_concluido_em: null }));
    renderApp('/boas-vindas');
    expect(await screen.findByText('0 / 200 XP para o nível 2')).toBeInTheDocument();
    expect(screen.getByText('Nível 1')).toBeInTheDocument();
    // Fora do app, a presença não conta.
    expect(xp().lancamentos).toHaveLength(0);
    const primeiras = screen.getByText('Primeiras missões').parentElement!;
    expect(primeiras).toHaveTextContent('Dar o primeiro palpite+50 XP');
    expect(primeiras).toHaveTextContent('Dar notas aos jogadores+50 XP');
    expect(primeiras).toHaveTextContent('Mandar uma foto do jogo+40 XP');
  });
});
