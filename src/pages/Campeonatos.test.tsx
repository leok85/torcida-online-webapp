import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPETICOES_DE_TESTE, partidaDeTeste, TABELAS_DE_TESTE, temporadaDoPalmeiras } from '../test/catalogoDeTeste';
import { renderApp } from '../test/renderApp';
import { assinaturaDeTeste, perfilDeTeste, supabaseFalso } from '../test/supabaseFalso';

// Segunda, 12/10/2026: Libertadores com a semifinal marcada, Copa do Brasil já encerrada.
beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-12T15:00:00Z'), shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

function temporada() {
  for (const p of temporadaDoPalmeiras()) supabaseFalso.adicionarPartida(p);
  supabaseFalso.adicionarCompeticoes(COMPETICOES_DE_TESTE, TABELAS_DE_TESTE);
  supabaseFalso.assinar(assinaturaDeTeste());
  supabaseFalso.logar(perfilDeTeste());
}

const abas = async () => screen.findAllByRole('tab');

describe('Campeonatos (W10)', () => {
  it('mostra um card por competição da temporada, com a situação de cada uma', async () => {
    temporada();
    renderApp('/campeonatos');
    expect(await screen.findByText('Palmeiras está em 3 competições na temporada')).toBeInTheDocument();
    const [br, lib, cdb] = await abas();
    expect(br).toHaveAttribute('aria-selected', 'true');
    expect(br).toHaveTextContent('Brasileirão Série Apontos corridos · 38 rodadas2º61 pts · rodada 30');
    expect(br).toHaveTextContent('São Paulo x Palmeiras · dom 16:00');
    expect(lib).toHaveTextContent('Copa Libertadoresgrupos + mata-mataSemifinalvs Fluminense');
    expect(lib).toHaveTextContent('Ida · qua 14/10 21:30 · fora');
    expect(cdb).toHaveTextContent('Copa do Brasilencerrado · set 2026Eliminadonas quartas');
    // Amistosos não são competição.
    expect(screen.queryByRole('tab', { name: /Friendlies/ })).not.toBeInTheDocument();
  });

  it('pontos corridos: tabela com o clube destacado e as zonas, próximos jogos e últimos 5', async () => {
    temporada();
    renderApp('/campeonatos');
    const tabela = await screen.findByRole('region', { name: 'Brasileirão Série A · rodada 30' });
    expect(within(tabela).getAllByRole('listitem').map((l) => l.textContent?.replace(/sports_soccer/g, ''))).toEqual([
      '1Flamengo6330+10',
      '2Palmeiras6130+10',
      '3Corinthians5030+10',
      '4São Paulo3130+10',
    ]);
    expect(within(tabela).getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'true');
    expect(tabela).toHaveTextContent('LibertadoresSul-AmericanaRebaixamento');

    const proximos = screen.getByRole('region', { name: 'Próximos jogos' });
    expect(within(proximos).getAllByRole('listitem').map((l) => l.textContent)).toEqual([
      'R31São Paulo x Palmeirasdom 18/10',
      'R32Palmeiras x Flamengodom 25/10',
    ]);
    expect(within(screen.getByRole('region', { name: 'Últimos 5' })).getAllByTitle(/Vitória|Empate|Derrota/).map((e) => e.textContent)).toEqual(['V', 'V']);
  });

  it('mata-mata: fase atual com ida e volta, palpite na ida e o caminho com as fases para abrir', async () => {
    temporada();
    const { user, local } = renderApp('/campeonatos');
    await user.click((await abas())[1]);

    const fase = screen.getByRole('region', { name: 'Fase atual' });
    expect(fase).toHaveTextContent('Semifinal');
    expect(within(fase).getAllByRole('listitem').map((l) => l.textContent)).toEqual([
      'Fluminense x Palmeirasqua 14/10',
      'Palmeiras x Fluminensevolta · qua 21/10',
    ]);

    const caminho = screen.getByRole('region', { name: 'Caminho até a final' });
    expect(caminho).toHaveTextContent('Fase de grupos');
    expect(caminho).toHaveTextContent('Quartas de finalclassificado');
    expect(caminho).toHaveTextContent('Semifinalem disputa');
    expect(caminho).toHaveTextContent('Finala disputar');

    await user.click(within(caminho).getByRole('button', { name: 'Ver jogos de Fase de grupos' }));
    const grupo = within(caminho).getByRole('region', { name: 'Grupo F' });
    expect(grupo).toHaveTextContent('Cerro Porteño');
    expect(caminho).toHaveTextContent('Palmeiras 2 x 2 Cerro Porteño');

    await user.click(within(caminho).getByRole('button', { name: 'Ver jogos de Quartas de final' }));
    expect(caminho).toHaveTextContent('LDU 3 x 2 Palmeiras (3 x 4 pên.)');

    await user.click(within(fase).getByRole('link', { name: /Palpitar na ida/ }));
    expect(local()).toBe('/jogo/15/escalacao');
  });

  it('com jogo ao vivo, o palpite da próxima fase fica fechado', async () => {
    temporada();
    supabaseFalso.adicionarPartida(partidaDeTeste({ id: 99, inicio: '2026-10-12T14:00:00Z' }));
    const { user } = renderApp('/campeonatos');
    await user.click((await abas())[1]);
    const fase = screen.getByRole('region', { name: 'Fase atual' });
    expect(within(fase).queryByRole('link', { name: /Palpitar/ })).not.toBeInTheDocument();
  });

  it('campanha encerrada: eliminado, por quem, e o caminho só até onde o clube chegou', async () => {
    temporada();
    const { user } = renderApp('/campeonatos');
    await user.click((await abas())[2]);
    const campanha = screen.getByRole('region', { name: 'Campanha' });
    expect(campanha).toHaveTextContent('Eliminado nas quartas');
    expect(campanha).toHaveTextContent('Eliminado pelo Corinthians');
    expect(screen.queryByRole('region', { name: 'Fase atual' })).not.toBeInTheDocument();
    const caminho = screen.getByRole('region', { name: 'Caminho até a final' });
    expect(caminho).toHaveTextContent('Quartas de finaleliminado');
    expect(caminho).not.toHaveTextContent('Semifinal');
  });

  it('sem competições ainda, avisa', async () => {
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/campeonatos');
    expect(await screen.findByText('As competições do Palmeiras aparecem aqui assim que a temporada começar.')).toBeInTheDocument();
  });

  it('com erro ao carregar, deixa tentar de novo', async () => {
    temporada();
    const original = supabaseFalso.cliente.from.getMockImplementation()!;
    supabaseFalso.cliente.from.mockImplementation((tabela: string) =>
      tabela === 'competicoes'
        ? { select: () => ({ in: async () => ({ data: null, error: { message: 'offline' } }) }) }
        : original(tabela),
    );
    const { user } = renderApp('/campeonatos');
    expect(await screen.findByText('Não deu para carregar os campeonatos agora. Verifique sua conexão.')).toBeInTheDocument();
    supabaseFalso.cliente.from.mockImplementation(original);
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Palmeiras está em 3 competições na temporada')).toBeInTheDocument();
  });
});
