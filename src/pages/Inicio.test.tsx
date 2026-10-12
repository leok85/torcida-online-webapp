import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { partidaDeTeste } from '../test/catalogoDeTeste';
import { perfilDeTeste, supabaseFalso } from '../test/supabaseFalso';
import { ATUALIZAR_AO_VIVO_MS } from '../partidas/JogosDoClube';

// O perfil de teste torce para o Palmeiras (162).
const card = async () => screen.findByRole('region', { name: 'Jogo do Palmeiras' });

describe('Início · jogo do clube', () => {
  afterEach(() => vi.useRealTimers());

  it('mostra o jogo ao vivo com período, minuto, placar e autores dos gols', async () => {
    supabaseFalso.adicionarPartida(partidaDeTeste());
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/');

    const jogo = await card();
    expect(await within(jogo).findByText('AO VIVO · 2º T')).toBeInTheDocument();
    expect(within(jogo).getByText("Brasileirão Série A · rodada 30 · 67'")).toBeInTheDocument();
    expect(within(jogo).getByLabelText('Placar: 1 a 0')).toHaveTextContent('1 — 0');
    expect(within(jogo).getByRole('list', { name: 'Gols' })).toHaveTextContent("A. Barboza 16'");
    expect(within(jogo).getByText('Palmeiras')).toBeInTheDocument();
    expect(within(jogo).getByText('Corinthians')).toBeInTheDocument();

    await user.click(within(jogo).getByRole('button', { name: /Entrar no chat/ }));
    expect(local()).toBe('/ao-vivo');
  });

  it('sem jogo agora, mostra o último resultado com a data e o caminho para o pós-jogo', async () => {
    supabaseFalso.adicionarPartida(
      partidaDeTeste({
        id: 7279,
        inicio: '2026-10-09T00:30:00+00:00',
        status: 'encerrada',
        periodo: null,
        minuto: null,
        rodada: 29,
        visitante_id: 166,
        visitante_nome: 'Bahia',
        gols_mandante: 1,
        gols_visitante: 0,
      }),
    );
    supabaseFalso.adicionarPartida(
      partidaDeTeste({
        status: 'encerrada',
        periodo: null,
        minuto: null,
        gols_mandante: 4,
        gols_visitante: 1,
        gols: [
          { jogador: 'A. Barboza', minuto: '16', mandante: true, contra: false, penalti: false },
          { jogador: 'A. Giay', minuto: '45+1', mandante: true, contra: false, penalti: false },
          { jogador: 'M. Bidu', minuto: '46', mandante: true, contra: true, penalti: false },
          { jogador: 'A. Giay', minuto: '51', mandante: true, contra: false, penalti: true },
          { jogador: 'G. Henrique', minuto: '90+1', mandante: false, contra: false, penalti: false },
        ],
      }),
    );
    // Jogo marcado para depois não entra no card.
    supabaseFalso.adicionarPartida(partidaDeTeste({ id: 7301, inicio: '2026-10-18T21:00:00+00:00', status: 'agendada', gols_mandante: null, gols_visitante: null, gols: [] }));
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/');

    const jogo = await card();
    expect(await within(jogo).findByText('ENCERRADO')).toBeInTheDocument();
    // 20:30 UTC = 17:30 em Brasília, ainda no domingo 11/10.
    expect(within(jogo).getByText(/^Brasileirão Série A · rodada 30 · dom\.?, 11\/10$/)).toBeInTheDocument();
    expect(within(jogo).getByLabelText('Placar: 4 a 1')).toBeInTheDocument();
    const autores = within(within(jogo).getByRole('list', { name: 'Gols' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(autores).toEqual(["A. Barboza 16'", "A. Giay 45+1', 51' (pên.)", "M. Bidu 46' (contra)", "G. Henrique 90+1'"]);
    expect(within(jogo).queryByRole('button', { name: /Entrar no chat/ })).not.toBeInTheDocument();

    await user.click(within(jogo).getByRole('button', { name: /Ver pós-jogo/ }));
    expect(local()).toBe('/pos-jogo');
  });

  it('mostra o intervalo sem minuto', async () => {
    supabaseFalso.adicionarPartida(partidaDeTeste({ periodo: 'INT', minuto: 45 }));
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/');
    const jogo = await card();
    expect(await within(jogo).findByText('AO VIVO · INTERVALO')).toBeInTheDocument();
    expect(within(jogo).getByText('Brasileirão Série A · rodada 30')).toBeInTheDocument();
  });

  it('avisa quando ainda não há jogos do clube', async () => {
    supabaseFalso.adicionarPartida(partidaDeTeste({ mandante_id: 160, mandante_nome: 'Flamengo' }));
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/');
    const jogo = await card();
    expect(await within(jogo).findByText('Os jogos do Palmeiras aparecem aqui assim que a bola rolar.')).toBeInTheDocument();
  });

  it('com erro ao carregar, deixa tentar de novo', async () => {
    supabaseFalso.adicionarPartida(partidaDeTeste());
    supabaseFalso.logar(perfilDeTeste());
    const original = supabaseFalso.cliente.from.getMockImplementation()!;
    supabaseFalso.cliente.from.mockImplementation((tabela: string) =>
      tabela === 'partidas'
        ? { select: () => ({ or: () => ({ order: async () => ({ data: null, error: { message: 'offline' } }) }) }) }
        : original(tabela),
    );
    const { user } = renderApp('/');

    const jogo = await card();
    expect(await within(jogo).findByText('Não deu para carregar o jogo agora. Verifique sua conexão.')).toBeInTheDocument();

    supabaseFalso.cliente.from.mockImplementation(original);
    await user.click(within(jogo).getByRole('button', { name: /Tentar de novo/ }));
    expect(await within(jogo).findByText('AO VIVO · 2º T')).toBeInTheDocument();
  });

  it('atualiza o placar sozinho durante o jogo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const partida = supabaseFalso.adicionarPartida(partidaDeTeste());
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/');
    const jogo = await card();
    expect(await within(jogo).findByLabelText('Placar: 1 a 0')).toBeInTheDocument();

    Object.assign(partida, {
      minuto: 71,
      gols_visitante: 1,
      gols: [...partida.gols, { jogador: 'Y. Alberto', minuto: '70', mandante: false, contra: false, penalti: false }],
    });
    await act(() => vi.advanceTimersByTimeAsync(ATUALIZAR_AO_VIVO_MS));

    expect(await within(jogo).findByLabelText('Placar: 1 a 1')).toBeInTheDocument();
    expect(within(jogo).getByText("Brasileirão Série A · rodada 30 · 71'")).toBeInTheDocument();
    expect(within(jogo).getAllByRole('listitem').map((li) => li.textContent)).toEqual(["A. Barboza 16'", "Y. Alberto 70'"]);
  });
});
