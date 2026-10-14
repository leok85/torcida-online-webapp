import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { partidaDeTeste } from '../../test/catalogoDeTeste';
import { renderApp } from '../../test/renderApp';
import { assinaturaDeTeste, perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';
import type { Partida, Perfil } from '../../lib/database.types';
import { CONFERIR_FECHAMENTO_MS } from './Escalacao';

// Palmeiras (162, o time do perfil de teste) x Corinthians (167), quarta 21:30 em Brasília.
const INICIO = '2026-10-15T00:30:00Z';
const ANTES = '2026-10-14T12:00:00Z';
const FECHOU = '2026-10-15T00:16:00Z';
const marcada = (campos = {}) =>
  partidaDeTeste({ id: 7301, inicio: INICIO, status: 'agendada', periodo: null, minuto: null, gols_mandante: null, gols_visitante: null, gols: [], ...campos });

/** A escalação automática do Palmeiras no 4-3-3 (elenco de teste, sem o suspenso e o lesionado). */
const AUTOMATICA = { gol0: 24, l0p0: 3876, l0p1: 35, l0p2: 25, l0p3: 28, l1p0: 3624, l1p1: 30, l1p2: 530, l2p0: 33, l2p1: 5053, l2p2: 34 };

const relogio = (agora: string) => vi.useFakeTimers({ now: new Date(agora), shouldAdvanceTime: true });

function abrir({ partida = marcada(), membro = true, perfil = perfilDeTeste(), rota = '' }: { partida?: Partida; membro?: boolean; perfil?: Perfil; rota?: string } = {}) {
  supabaseFalso.adicionarPartida(partida);
  if (membro) supabaseFalso.assinar(assinaturaDeTeste());
  supabaseFalso.logar(perfil);
  return renderApp(rota || `/jogo/${partida.id}/escalacao`);
}

const campo = () => screen.getByRole('region', { name: 'Escalação' });
const jogadores = () => screen.getByRole('group', { name: 'Jogadores para a posição' });
const confirmar = () => screen.getByRole('button', { name: /Confirmar escalação e palpite/ });

afterEach(() => vi.useRealTimers());

describe('escalação e palpite (W03)', () => {
  it('antes do jogo: monta o time pelo elenco, troca jogadores, palpita o placar e quem marca, e confirma', async () => {
    relogio(ANTES);
    const { user } = abrir();
    expect(await screen.findByRole('heading', { name: 'Escalação ideal e palpite' })).toBeInTheDocument();
    expect(screen.getByText('Palmeiras × Corinthians · fecha 15 min antes')).toBeInTheDocument();
    expect(screen.getByText('Escalação e palpite').closest('[aria-current]')).toHaveAttribute('aria-current', 'page');

    // Time automático pelo elenco: o suspenso (A. Giay) e o lesionado (R. Sosa) ficam de fora.
    await screen.findByRole('button', { name: 'GOL: C. Miguel' });
    expect(within(campo()).getByRole('button', { name: 'ZAG: B. Fuchs' })).toBeInTheDocument();
    expect(within(campo()).queryByRole('button', { name: /A\. Giay|R\. Sosa/ })).not.toBeInTheDocument();

    // Do banco para a vaga.
    await user.click(within(campo()).getByRole('button', { name: 'ZAG: B. Fuchs' }));
    expect(screen.getByRole('heading', { name: 'Quem joga de ZAG' })).toBeInTheDocument();
    expect(within(jogadores()).getByRole('button', { name: 'A. Giay, defensor · suspenso · volta 18/10 · no banco' })).toBeInTheDocument();
    await user.click(within(jogadores()).getByRole('button', { name: 'Murilo, defensor · no banco' }));
    expect(within(campo()).getByRole('button', { name: 'ZAG: Murilo' })).toBeInTheDocument();
    // Quem já está em campo troca de lugar.
    await user.click(within(jogadores()).getByRole('button', { name: 'Khellven, defensor · já está em campo' }));
    expect(within(campo()).getByRole('button', { name: 'ZAG: Khellven' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(campo()).getAllByRole('button', { name: /^ZAG: / }).map((b) => b.getAttribute('aria-label'))).toEqual(['ZAG: Khellven', 'ZAG: Murilo']);

    // Placar 2 x 1 e quem marca.
    await user.click(screen.getByRole('button', { name: 'Mais um gol do Palmeiras' }));
    await user.click(screen.getByRole('button', { name: 'Mais um gol do Palmeiras' }));
    await user.click(screen.getByRole('button', { name: 'Mais um gol do Corinthians' }));
    await user.click(screen.getByRole('button', { name: /Quem marca\?/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: '1º gol do Palmeiras' }), '1º gol · V. Roque');
    await user.selectOptions(screen.getByRole('combobox', { name: '1º gol do Corinthians' }), '1º gol · M. Depay');
    expect(screen.getAllByRole('combobox')).toHaveLength(3);

    await user.click(confirmar());
    expect(await screen.findByRole('button', { name: /Escalação e palpite confirmados/ })).toBeDisabled();
    expect(supabaseFalso.palpites()).toEqual([
      expect.objectContaining({
        partida_id: 7301,
        usuario_id: 'usuario-1',
        clube_id: 162,
        formacao: '4-3-3',
        escalacao: { ...AUTOMATICA, l0p1: 25, l0p2: 27 },
        gols_mandante: 2,
        gols_visitante: 1,
        autores: [
          { mandante: true, jogador: 33 },
          { mandante: false, jogador: 262 },
        ],
      }),
    ]);

    // Mudou algo: volta a pedir confirmação.
    await user.click(screen.getByRole('button', { name: 'Menos um gol do Corinthians' }));
    expect(confirmar()).toBeEnabled();
  });

  it('lesionado fica bloqueado: não entra no time nem em quem marca', async () => {
    relogio(ANTES);
    const { user } = abrir();
    await user.click(await screen.findByRole('button', { name: 'ATA: Paulinho' }));
    const sosa = within(jogadores()).getByRole('button', { name: 'R. Sosa, atacante · lesionado · volta 31/10' });
    expect(sosa).toBeDisabled();
    expect(within(sosa).getByTitle('Lesionado')).toBeInTheDocument();
    await user.click(sosa);
    expect(within(campo()).getByRole('button', { name: 'ATA: Paulinho' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mais um gol do Palmeiras' }));
    await user.click(screen.getByRole('button', { name: /Quem marca\?/ }));
    expect(screen.getByRole('option', { name: '1º gol · R. Sosa (lesionado)' })).toBeDisabled();
  });

  it('se alguém do palpite salvo se lesionou, ele sai da escalação e a tela pede para confirmar de novo', async () => {
    relogio(ANTES);
    supabaseFalso.palpites().push({ partida_id: 7301, usuario_id: 'usuario-1', clube_id: 162, formacao: '4-3-3', escalacao: { ...AUTOMATICA, l2p1: 37 }, gols_mandante: 1, gols_visitante: 0, autores: [] });
    const { user } = abrir();
    expect(await screen.findByRole('status')).toHaveTextContent('R. Sosa se lesionou e saiu da sua escalação. Confira e confirme de novo.');
    expect(within(campo()).getByRole('button', { name: 'ATA: Paulinho' })).toBeInTheDocument();
    await user.click(confirmar());
    await screen.findByRole('button', { name: /Escalação e palpite confirmados/ });
    expect(supabaseFalso.palpites()[0].escalacao).toEqual(AUTOMATICA);
  });

  it('o banco recusa lesionado (ex.: a lesão saiu com a tela aberta)', async () => {
    relogio(ANTES);
    const { user } = abrir();
    await screen.findByRole('button', { name: 'GOL: C. Miguel' });
    supabaseFalso.definirElenco(
      162,
      supabaseFalso.elenco(162).map((j) => (j.id === 33 ? { ...j, disponibilidade: 'injured' } : j)),
    );
    await user.click(confirmar());
    expect(await screen.findByRole('alert')).toHaveTextContent('Um jogador da sua escalação se lesionou. Troque ele e confirme de novo.');
    expect(supabaseFalso.palpites()).toEqual([]);
  });

  it('a formação nova remonta o time; com 0 x 0 não há autores', async () => {
    relogio(ANTES);
    const { user } = abrir();
    await screen.findByRole('button', { name: 'GOL: C. Miguel' });
    await user.click(within(screen.getByRole('group', { name: 'Formação' })).getByRole('button', { name: '3-5-2' }));
    expect(within(campo()).getAllByRole('button', { name: /^ZAG: / })).toHaveLength(3);
    expect(within(campo()).getAllByRole('button', { name: /^ALA: / })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /Quem marca\?/ }));
    expect(screen.getByText('Com placar 0 x 0 não há autores para palpitar.')).toBeInTheDocument();

    await user.click(confirmar());
    await screen.findByRole('button', { name: /Escalação e palpite confirmados/ });
    expect(supabaseFalso.palpites()[0]).toMatchObject({ formacao: '3-5-2', gols_mandante: 0, gols_visitante: 0, autores: [] });
  });

  it('volta com o palpite salvo, pronto para trocar até fechar', async () => {
    relogio(ANTES);
    supabaseFalso.palpites().push({
      partida_id: 7301,
      usuario_id: 'usuario-1',
      clube_id: 162,
      formacao: '4-4-2',
      escalacao: { ...AUTOMATICA },
      gols_mandante: 3,
      gols_visitante: 0,
      autores: [{ mandante: true, jogador: 5053 }],
    });
    abrir();
    expect(await screen.findByRole('button', { name: /Escalação e palpite confirmados/ })).toBeDisabled();
    expect(within(screen.getByRole('group', { name: 'Formação' })).getByRole('button', { name: '4-4-2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Gols do Palmeiras: 3')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '1º gol do Palmeiras' })).toHaveDisplayValue('1º gol · Paulinho');
  });

  it('15 min antes do início fecha: o palpite salvo fica só para leitura', async () => {
    relogio(FECHOU);
    supabaseFalso.palpites().push({ partida_id: 7301, usuario_id: 'usuario-1', clube_id: 162, formacao: '4-3-3', escalacao: AUTOMATICA, gols_mandante: 2, gols_visitante: 1, autores: [] });
    abrir();
    expect(await screen.findByRole('status')).toHaveTextContent('O palpite fechou 15 min antes do início.');
    expect(screen.getByText('Palmeiras × Corinthians · palpite fechado')).toBeInTheDocument();
    expect(screen.getByText('Sua escalação · 4-3-3')).toBeInTheDocument();
    expect(within(campo()).getByText('C. Miguel')).toBeInTheDocument();
    expect(within(campo()).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Gols do Palmeiras: 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /gol do/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirmar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Formação' })).not.toBeInTheDocument();
  });

  it('fechado sem palpite: avisa que não mandou', async () => {
    relogio(FECHOU);
    abrir();
    expect(await screen.findByText('O palpite fechou 15 min antes do início e você não mandou escalação nem palpite para este jogo.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver o jogo' })).toHaveAttribute('href', '/jogo/7301');
  });

  it('com a tela aberta, o palpite fecha na hora e o envio atrasado é recusado', async () => {
    relogio('2026-10-15T00:14:00Z');
    const { user } = abrir();
    await screen.findByRole('button', { name: 'GOL: C. Miguel' });
    // O banco recusa quem tenta enviar depois do horário, mesmo com a tela ainda aberta.
    vi.setSystemTime(new Date(FECHOU));
    await user.click(confirmar());
    expect(await screen.findByRole('alert')).toHaveTextContent('O palpite deste jogo já fechou.');
    expect(supabaseFalso.palpites()).toEqual([]);
    // Na conferência seguinte a tela trava.
    await act(() => vi.advanceTimersByTimeAsync(CONFERIR_FECHAMENTO_MS));
    expect(await screen.findByText('O palpite fechou 15 min antes do início e você não mandou escalação nem palpite para este jogo.')).toBeInTheDocument();
  });

  it('jogo ao vivo ou encerrado: fechado', async () => {
    relogio(ANTES);
    abrir({ partida: marcada({ status: 'ao_vivo', gols_mandante: 0, gols_visitante: 0 }) });
    expect(await screen.findByText(/O palpite fechou 15 min antes do início/)).toBeInTheDocument();
  });

  it('só abre quando o jogo anterior do clube termina', async () => {
    relogio('2026-10-11T21:00:00Z');
    supabaseFalso.adicionarPartida(partidaDeTeste()); // Palmeiras x Corinthians ao vivo, 11/10
    abrir();
    expect(await screen.findByText('O palpite deste jogo abre quando o jogo anterior terminar.')).toBeInTheDocument();
    expect(screen.getByText('Palmeiras × Corinthians · abre quando o jogo anterior terminar')).toBeInTheDocument();
  });

  it('torcedor de outro clube não palpita neste jogo', async () => {
    relogio(ANTES);
    abrir({ perfil: perfilDeTeste({ time_id: 160 }) });
    expect(await screen.findByText('O palpite é da torcida dos times em campo.')).toBeInTheDocument();
  });

  it('quem não é membro vê o bloqueio de "Escalação e palpite"', async () => {
    abrir({ membro: false });
    expect(await screen.findByRole('heading', { name: 'Escalação e palpite' })).toBeInTheDocument();
    expect(screen.getByText('SÓ PARA MEMBROS')).toBeInTheDocument();
  });

  it('/escalacao abre o palpite do próximo jogo do clube', async () => {
    relogio(ANTES);
    const { local } = abrir({ rota: '/escalacao' });
    await waitFor(() => expect(local()).toBe('/jogo/7301/escalacao'));
  });
});
