import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { partidaDeTeste } from '../../test/catalogoDeTeste';
import { detalhesDeTeste } from '../../test/jogoDeTeste';
import { renderApp } from '../../test/renderApp';
import { assinaturaDeTeste, perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';

// Palmeiras 4 x 1 Corinthians: apito final às 22:25Z; a janela das notas fecha às 23:25Z.
const APITO = '2026-10-11T22:25:00Z';
const encerrada = (campos = {}) =>
  partidaDeTeste({ status: 'encerrada', periodo: null, minuto: null, gols_mandante: 4, gols_visitante: 1, encerrada_em: APITO, ...campos });
const relogio = (agora: string) => vi.useFakeTimers({ now: new Date(agora), shouldAdvanceTime: true });
/** 13 min depois do apito: faltam 47 min para fechar, como no design. */
const JANELA_ABERTA = '2026-10-11T22:38:00Z';
const JANELA_FECHADA = '2026-10-12T15:00:00Z';

function abrir({ partida = encerrada(), membro = true, perfil = perfilDeTeste() } = {}) {
  supabaseFalso.adicionarPartida(partida);
  supabaseFalso.definirDetalhes(partida.id, detalhesDeTeste());
  if (membro) supabaseFalso.assinar(assinaturaDeTeste());
  supabaseFalso.logar(perfil);
  return renderApp(`/jogo/${partida.id}/notas`);
}

/** Votos de outros torcedores do Palmeiras. */
function votosDaTorcida() {
  const voto = (usuario_id: string, jogador_id: number, nota: number) =>
    supabaseFalso.notasDosJogadores().push({ partida_id: 7290, jogador_id, usuario_id, clube_id: 162, nota });
  voto('t1', 3876, 9);
  voto('t2', 3876, 8);
  voto('t1', 24, 6);
  voto('t2', 24, 7);
  // Torcida do Corinthians: não entra na média do Palmeiras.
  supabaseFalso.notasDosJogadores().push({ partida_id: 7290, jogador_id: 253, usuario_id: 't3', clube_id: 167, nota: 10 });
}

const suasNotas = () => screen.getByRole('region', { name: 'Suas notas' });
const media = () => screen.getByRole('region', { name: 'Notas da partida' });
const linhaDaMedia = (nome: string) => within(media()).getByText(nome).closest('li')!;

afterEach(() => vi.useRealTimers());

describe('pós-jogo e notas (W04)', () => {
  it('com a janela aberta: relógio, MVP a sair e os jogadores que entraram em campo, com os minutos', async () => {
    relogio(JANELA_ABERTA);
    abrir();
    expect(await screen.findByText('fecha em 47 min')).toBeInTheDocument();
    expect(screen.getByText('Pós-jogo e notas').closest('[aria-current]')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Placar: 4 a 1')).toBeInTheDocument();
    const mvp = screen.getByRole('region', { name: 'MVP da partida' });
    expect(mvp).toHaveTextContent('sai em 47 min');
    expect(mvp).toHaveTextContent('Sai quando as notas fecharem. Vence a maior média da torcida.');

    // 11 titulares + quem entrou (R. Sosa aos 58').
    const jogadores = within(suasNotas()).getAllByRole('listitem');
    expect(jogadores).toHaveLength(12);
    expect(jogadores[0]).toHaveTextContent('C. Miguelgoleiro · 90 min · sem nota');
    expect(within(suasNotas()).getByText('V. Roque').nextSibling).toHaveTextContent('atacante · 58 min · sem nota');
    expect(within(suasNotas()).getByText('R. Sosa').nextSibling).toHaveTextContent('atacante · 32 min · sem nota');
  });

  it('dá notas, envia e vê a sua nota na média da torcida e no XP do jogo', async () => {
    relogio(JANELA_ABERTA);
    const { user } = abrir();
    await screen.findByRole('region', { name: 'Suas notas' });
    const enviar = await within(suasNotas()).findByRole('button', { name: /Enviar avaliações/ });
    expect(enviar).toBeDisabled();

    // O primeiro sem nota já vem aberto.
    await user.click(within(suasNotas()).getByRole('radio', { name: '8' }));
    expect(within(suasNotas()).getByText('C. Miguel').nextSibling).toHaveTextContent('goleiro · 90 min · jogou bem');
    await user.click(within(suasNotas()).getByRole('button', { name: 'Dar nota para A. Barboza' }));
    await user.click(within(suasNotas()).getByRole('radio', { name: '4' }));
    expect(within(suasNotas()).getByText('A. Barboza').nextSibling).toHaveTextContent('ficou devendo');

    await user.click(enviar);
    expect(await within(suasNotas()).findByRole('button', { name: 'Avaliações enviadas' })).toBeDisabled();
    expect(supabaseFalso.notasDosJogadores()).toEqual([
      { partida_id: 7290, jogador_id: 24, usuario_id: 'usuario-1', clube_id: 162, nota: 8 },
      { partida_id: 7290, jogador_id: 3876, usuario_id: 'usuario-1', clube_id: 162, nota: 4 },
    ]);
    await waitFor(() => expect(linhaDaMedia('C. Miguel')).toHaveTextContent('SUA8TO6,98,0TORCIDA'));
    expect(within(media()).getByText('1 votou')).toBeInTheDocument();
    const xp = screen.getByRole('region', { name: 'Seu XP neste jogo' });
    expect(xp).toHaveTextContent('+50 XP');
    expect(within(xp).getByText('Notas dos jogadores').nextSibling).toHaveTextContent('enviadas');
  });

  it('média da torcida do meu time, da maior para a menor; quem não tem voto fica com "—"', async () => {
    relogio(JANELA_ABERTA);
    votosDaTorcida();
    abrir();
    await waitFor(() => expect(within(media()).getByText('2 votaram')).toBeInTheDocument());
    const linhas = within(media()).getAllByRole('listitem');
    expect(linhas[0]).toHaveTextContent('A. Barboza');
    expect(linhas[0]).toHaveTextContent('8,5TORCIDA');
    expect(linhas[1]).toHaveTextContent('C. Miguel');
    expect(linhas[1]).toHaveTextContent('6,5TORCIDA');
    expect(linhaDaMedia('V. Roque')).toHaveTextContent('SUA—TO7,2—TORCIDA');
  });

  it('nota TO de cada jogador entre a sua e a da torcida; sem nota, "—"', async () => {
    relogio(JANELA_ABERTA);
    abrir();
    await screen.findByRole('region', { name: 'Notas da partida' });
    // Os jogadores chegam com os detalhes do jogo: espera a lista.
    await within(media()).findByText('A. Barboza');
    expect(screen.getByText('Nota TO é calculada pela Torcida Online com os números de cada jogador em campo.')).toBeInTheDocument();
    expect(linhaDaMedia('A. Barboza')).toHaveTextContent('TO8,1');
    expect(linhaDaMedia('R. Sosa')).toHaveTextContent('TO6,5');
    expect(linhaDaMedia('Murilo')).toHaveTextContent('TO—');
  });

  it('com a janela fechada: MVP revelado, notas só para leitura', async () => {
    relogio(JANELA_FECHADA);
    votosDaTorcida();
    supabaseFalso.notasDosJogadores().push({ partida_id: 7290, jogador_id: 3876, usuario_id: 'usuario-1', clube_id: 162, nota: 9 });
    abrir();
    const mvp = await screen.findByRole('region', { name: 'MVP da partida' });
    await waitFor(() => expect(mvp).toHaveTextContent('2 · A. Barboza'));
    expect(mvp).toHaveTextContent('nota média 8,7 · sua nota 9');
    expect(within(suasNotas()).getByText('fechada')).toBeInTheDocument();
    expect(within(suasNotas()).queryByRole('radio')).not.toBeInTheDocument();
    expect(within(suasNotas()).queryByRole('button')).not.toBeInTheDocument();
    expect(linhaDaMedia('A. Barboza')).toHaveTextContent('(MVP)');
  });

  it('janela fechada sem nenhum voto', async () => {
    relogio(JANELA_FECHADA);
    abrir();
    expect(await screen.findByText('Ninguém deu nota neste jogo.')).toBeInTheDocument();
  });

  it('se a janela fechar com a tela aberta, o envio avisa', async () => {
    relogio(JANELA_ABERTA);
    const partida = encerrada();
    const { user } = abrir({ partida });
    await screen.findByRole('region', { name: 'Suas notas' });
    await user.click(await within(suasNotas()).findByRole('radio', { name: '7' }));
    partida.encerrada_em = '2026-10-11T20:00:00Z';
    await user.click(within(suasNotas()).getByRole('button', { name: /Enviar avaliações/ }));
    expect(await within(suasNotas()).findByRole('alert')).toHaveTextContent('As notas deste jogo já fecharam.');
  });

  it('XP do jogo conta a presença no chat', async () => {
    relogio(JANELA_ABERTA);
    supabaseFalso.mensagemDaTorcida({ texto: 'vamo', autor_id: 'usuario-1', autor_apelido: 'Rafa_9' });
    supabaseFalso.mensagemDaTorcida({ texto: 'que jogo', autor_id: 'usuario-1', autor_apelido: 'Rafa_9' });
    supabaseFalso.mensagemDaTorcida({ texto: 'de outro', autor_id: 'usuario-9' });
    abrir();
    const xp = await screen.findByRole('region', { name: 'Seu XP neste jogo' });
    await waitFor(() => expect(within(xp).getByText('Presença no chat').nextSibling).toHaveTextContent('2 mensagens'));
    expect(xp).toHaveTextContent('+60 XP');
    expect(within(xp).getByText('Notas dos jogadores').nextSibling).toHaveTextContent('pendente · fecha em 47 min');
  });

  it('antes do apito final, as notas ainda não abriram', async () => {
    abrir({ partida: partidaDeTeste() });
    expect(await screen.findByText('As notas abrem no apito final.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver o jogo' })).toHaveAttribute('href', '/jogo/7290');
  });

  it('torcedor de outro clube não dá notas neste jogo', async () => {
    relogio(JANELA_ABERTA);
    abrir({ perfil: perfilDeTeste({ time_id: 160 }) });
    expect(await screen.findByText('As notas são da torcida dos times em campo.')).toBeInTheDocument();
  });

  it('quem não é membro vê o bloqueio de "Pós-jogo e notas"', async () => {
    abrir({ membro: false });
    expect(await screen.findByRole('heading', { name: 'Pós-jogo e notas' })).toBeInTheDocument();
    expect(screen.getByText('SÓ PARA MEMBROS')).toBeInTheDocument();
  });

  it('/pos-jogo (links antigos) abre as notas do último jogo encerrado', async () => {
    supabaseFalso.adicionarPartida(encerrada());
    supabaseFalso.assinar(assinaturaDeTeste());
    supabaseFalso.logar(perfilDeTeste());
    const { local } = renderApp('/pos-jogo');
    await waitFor(() => expect(local()).toBe('/jogo/7290/notas'));
  });
});
