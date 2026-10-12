import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Partida } from '../lib/database.types';
import { ATUALIZAR_AO_VIVO_MS } from '../partidas/JogosDoClube';
import { partidaDeTeste } from '../test/catalogoDeTeste';
import { renderApp } from '../test/renderApp';
import { perfilDeTeste, supabaseFalso } from '../test/supabaseFalso';

// O perfil de teste torce para o Palmeiras (162).
const card = async () => screen.findByRole('region', { name: 'Jogo do Palmeiras' });
const relogio = (agora: string) => vi.useFakeTimers({ now: new Date(agora), shouldAdvanceTime: true });

const GOLS_DO_CLASSICO: Partida['gols'] = [
  { jogador: 'A. Barboza', minuto: '16', mandante: true, contra: false, penalti: false },
  { jogador: 'A. Giay', minuto: '45+1', mandante: true, contra: false, penalti: false },
  { jogador: 'M. Bidu', minuto: '46', mandante: true, contra: true, penalti: false },
  { jogador: 'A. Giay', minuto: '51', mandante: true, contra: false, penalti: true },
  { jogador: 'G. Henrique', minuto: '90+1', mandante: false, contra: false, penalti: false },
];
/** Palmeiras 4 × 1 Corinthians, dom 11/10 17:30 (Brasília). */
const classico = () =>
  partidaDeTeste({ status: 'encerrada', periodo: null, minuto: null, gols_mandante: 4, gols_visitante: 1, gols: GOLS_DO_CLASSICO });
/** Palmeiras × Flamengo, qua 14/10 21:30 (Brasília). */
const proximo = () =>
  partidaDeTeste({ id: 7301, inicio: '2026-10-15T00:30:00Z', rodada: 31, status: 'agendada', periodo: null, minuto: null, gols_mandante: null, gols_visitante: null, gols: [], visitante_id: 160, visitante_nome: 'Flamengo' });

const itens = (lista: HTMLElement) => within(lista).getAllByRole('listitem').map((li) => li.textContent?.replace('sports_soccer', ''));

describe('Início · card do jogo', () => {
  afterEach(() => vi.useRealTimers());

  it('ao vivo: período, minuto, placar, gols embaixo de cada time e o próximo jogo bloqueado para palpite', async () => {
    relogio('2026-10-11T21:40:00Z');
    supabaseFalso.adicionarPartida(partidaDeTeste());
    supabaseFalso.adicionarPartida(proximo());
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/');

    const jogo = await card();
    expect(await within(jogo).findByText('AO VIVO · 2º T')).toBeInTheDocument();
    expect(within(jogo).getByText("Brasileirão Série A · rodada 30 · 67'")).toBeInTheDocument();
    expect(within(jogo).getByLabelText('Placar: 1 a 0')).toHaveTextContent('1 × 0');
    expect(itens(within(jogo).getByRole('list', { name: 'Gols do Palmeiras' }))).toEqual(["A. Barboza 16'"]);
    expect(within(jogo).queryByRole('list', { name: 'Gols do Corinthians' })).not.toBeInTheDocument();

    const faixa = within(jogo).getByRole('group', { name: 'Próximo jogo' });
    expect(faixa).toHaveTextContent('Palmeiras × Flamengo');
    expect(faixa).toHaveTextContent('Palpite abre no apito final');
    expect(within(faixa).queryByRole('link')).not.toBeInTheDocument();

    await user.click(within(jogo).getByRole('button', { name: /Entrar no chat/ }));
    expect(local()).toBe('/ao-vivo');
  });

  it('encerrado: há quanto tempo acabou, gols de cada lado, notas, chat e fotos, e o próximo com palpite aberto', async () => {
    relogio('2026-10-12T15:00:00Z'); // seg 12:00; o próximo é quarta, ainda não é véspera
    supabaseFalso.adicionarPartida(classico());
    supabaseFalso.adicionarPartida(proximo());
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/');

    const jogo = await card();
    expect(await within(jogo).findByText('ENCERRADO · HÁ 16 H')).toBeInTheDocument();
    expect(within(jogo).getByText('Brasileirão Série A · rodada 30')).toBeInTheDocument();
    expect(within(jogo).getByLabelText('Placar: 4 a 1')).toBeInTheDocument();
    expect(itens(within(jogo).getByRole('list', { name: 'Gols do Palmeiras' }))).toEqual([
      "A. Barboza 16'",
      "A. Giay 45+1', 51' (pên.)",
      "M. Bidu 46' (contra)",
    ]);
    expect(itens(within(jogo).getByRole('list', { name: 'Gols do Corinthians' }))).toEqual(["G. Henrique 90+1'"]);
    expect(within(jogo).queryByRole('button', { name: /Entrar no chat/ })).not.toBeInTheDocument();

    const faixa = within(jogo).getByRole('group', { name: 'Próximo jogo' });
    expect(faixa).toHaveTextContent('Brasileirão Série A · rodada 31 · qua 21:30');
    expect(within(faixa).getByRole('link', { name: /Dar palpite/ })).toHaveAttribute('href', '/escalacao');

    await user.click(within(jogo).getByRole('button', { name: /Fotos/ }));
    expect(local()).toBe('/fotos');
  });

  it.each([
    ['Dar notas', '/pos-jogo'],
    ['Chat', '/ao-vivo'],
  ])('encerrado: "%s" leva para %s', async (botao, destino) => {
    relogio('2026-10-12T15:00:00Z');
    supabaseFalso.adicionarPartida(classico());
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/');
    await user.click(await within(await card()).findByRole('button', { name: new RegExp(botao) }));
    expect(local()).toBe(destino);
  });

  it('véspera: a partir do dia anterior, o próximo jogo com contagem regressiva e o último resultado embaixo', async () => {
    relogio('2026-10-13T22:00:00Z'); // ter 19:00; o jogo é qua 21:30
    supabaseFalso.adicionarPartida(classico());
    supabaseFalso.adicionarPartida(proximo());
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/');

    const jogo = await card();
    expect(await within(jogo).findByText('PRÓXIMO JOGO')).toBeInTheDocument();
    expect(within(jogo).getByText('Brasileirão Série A · rodada 31 · qua 14/10 21:30')).toBeInTheDocument();
    expect(within(jogo).getByText('1d 02h')).toBeInTheDocument();
    expect(within(jogo).getByText('para o apito inicial')).toBeInTheDocument();
    expect(within(jogo).getByText('Palpite e escalação abertos até 15 min antes')).toBeInTheDocument();

    const faixa = within(jogo).getByRole('group', { name: 'Último jogo' });
    expect(faixa).toHaveTextContent('Palmeiras 4 × 1 Corinthians');
    expect(within(faixa).getByRole('link', { name: /Notas e fotos/ })).toHaveAttribute('href', '/pos-jogo');

    await user.click(within(jogo).getByRole('button', { name: /Dar palpite/ }));
    expect(local()).toBe('/escalacao');
  });

  it('a contagem regressiva anda sozinha', async () => {
    // 39,5 min para o apito: no meio do minuto, para os milissegundos reais do relógio não mudarem o número.
    relogio('2026-10-14T23:50:30Z');
    supabaseFalso.adicionarPartida(classico());
    supabaseFalso.adicionarPartida(proximo());
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/');
    const jogo = await card();
    expect(await within(jogo).findByText('39 min')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(await within(jogo).findByText('29 min')).toBeInTheDocument();
  });

  it('sem nenhum resultado ainda, já mostra o próximo jogo', async () => {
    relogio('2026-10-01T12:00:00Z');
    supabaseFalso.adicionarPartida(proximo());
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/');
    const jogo = await card();
    expect(await within(jogo).findByText('PRÓXIMO JOGO')).toBeInTheDocument();
    expect(within(jogo).getByText('13d 12h')).toBeInTheDocument();
    expect(within(jogo).queryByRole('group', { name: 'Último jogo' })).not.toBeInTheDocument();
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
      tabela === 'partidas' ? { select: () => ({ or: () => ({ order: async () => ({ data: null, error: { message: 'offline' } }) }) }) } : original(tabela),
    );
    const { user } = renderApp('/');

    const jogo = await card();
    expect(await within(jogo).findByText('Não deu para carregar o jogo agora. Verifique sua conexão.')).toBeInTheDocument();

    supabaseFalso.cliente.from.mockImplementation(original);
    await user.click(within(jogo).getByRole('button', { name: /Tentar de novo/ }));
    expect(await within(jogo).findByText('AO VIVO · 2º T')).toBeInTheDocument();
  });

  it('atualiza o placar sozinho durante o jogo', async () => {
    relogio('2026-10-11T21:40:00Z');
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
    expect(itens(within(jogo).getByRole('list', { name: 'Gols do Corinthians' }))).toEqual(["Y. Alberto 70'"]);
  });
});
