import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { partidaDeTeste } from '../test/catalogoDeTeste';
import { renderApp } from '../test/renderApp';
import { assinaturaDeTeste, perfilDeTeste, supabaseFalso } from '../test/supabaseFalso';
import type { Partida } from '../lib/database.types';

// O perfil de teste torce para o Palmeiras (162).
const marcada = (id: number, inicio: string, campos: Partial<Partida> = {}) =>
  partidaDeTeste({ id, inicio, status: 'agendada', periodo: null, minuto: null, gols_mandante: null, gols_visitante: null, gols: [], ...campos });
const encerrada = (id: number, inicio: string, campos: Partial<Partida>) =>
  partidaDeTeste({ id, inicio, status: 'encerrada', periodo: null, minuto: null, ...campos });

function temporada({ aoVivo = true } = {}) {
  if (aoVivo) supabaseFalso.adicionarPartida(partidaDeTeste()); // Palmeiras 1 × 0 Corinthians, 67'
  supabaseFalso.adicionarPartida(encerrada(7279, '2026-10-09T00:30:00Z', { visitante_id: 166, visitante_nome: 'Bahia', rodada: 29, gols_mandante: 1, gols_visitante: 0 }));
  supabaseFalso.adicionarPartida(
    encerrada(7270, '2026-10-05T19:00:00Z', { mandante_id: 160, mandante_nome: 'Flamengo', visitante_id: 162, visitante_nome: 'Palmeiras', rodada: 28, gols_mandante: 2, gols_visitante: 0 }),
  );
  supabaseFalso.adicionarPartida(encerrada(7260, '2026-10-01T22:00:00Z', { visitante_id: 158, visitante_nome: 'São Paulo', rodada: 27, gols_mandante: 1, gols_visitante: 1 }));
  supabaseFalso.adicionarPartida(marcada(7301, '2026-10-15T00:30:00Z', { visitante_id: 160, visitante_nome: 'Flamengo', rodada: 31 })); // qua 21:30
  supabaseFalso.adicionarPartida(marcada(7310, '2026-10-18T19:00:00Z', { mandante_id: 158, mandante_nome: 'São Paulo', visitante_id: 162, visitante_nome: 'Palmeiras', rodada: 32 })); // dom 16:00
}

const linhas = (titulo: string) => {
  const secao = screen.getByRole('region', { name: titulo });
  // Cada linha tem um nome acessível próprio (os ícones são texto aria-hidden).
  return within(secao).getAllByRole('link').map((l) => l.getAttribute('aria-label'));
};

describe('menu', () => {
  it('tem Jogos no lugar das telas de jogo, e Jogos fica marcado também dentro de um jogo', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/');
    const menu = await screen.findByRole('navigation');
    const itens = within(menu).getAllByRole('link').map((l) => l.getAttribute('aria-label'));
    expect(itens).toEqual(['Início', 'Jogos', 'Missões, só para membros', 'Ranking, só para membros', 'Loja de moedas, só para membros', 'Notícias', 'Campeonatos', 'Página do clube']);
    expect(within(menu).getByRole('link', { name: /Início/ })).toHaveAttribute('aria-current', 'page');

    await user.click(within(menu).getByRole('link', { name: /Jogos/ }));
    expect(local()).toBe('/jogos');
    expect(within(menu).getByRole('link', { name: /Jogos/ })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('link', { name: /Início/ })).not.toHaveAttribute('aria-current');
  });

  it('marca Jogos nas telas de um jogo', async () => {
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/ao-vivo');
    const menu = await screen.findByRole('navigation');
    expect(within(menu).getByRole('link', { name: /Jogos/ })).toHaveAttribute('aria-current', 'page');
  });

  it('mostra a bolinha de ao vivo em Jogos só com o clube em campo', async () => {
    temporada({ aoVivo: false });
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/jogos');
    await screen.findByRole('region', { name: 'Resultados' });
    expect(within(screen.getByRole('navigation')).getByRole('link', { name: 'Jogos' })).toBeInTheDocument();
  });

  it('com o clube em campo, Jogos ganha a bolinha de ao vivo', async () => {
    supabaseFalso.adicionarPartida(partidaDeTeste());
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/');
    const menu = await screen.findByRole('navigation');
    expect(await within(menu).findByRole('link', { name: 'Jogos, jogo ao vivo' })).toBeInTheDocument();
  });

  it('"Convidar amigos" no rodapé abre o convite', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Convidar amigos/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Jogos (W20)', () => {
  it('mostra o jogo ao vivo em destaque com o caminho para entrar', async () => {
    temporada();
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/jogos');

    expect(await screen.findByRole('heading', { name: 'Jogos do Palmeiras' })).toBeInTheDocument();
    const aoVivo = await screen.findByRole('region', { name: 'Jogo ao vivo' });
    expect(aoVivo).toHaveTextContent("AO VIVO · 67'");
    expect(aoVivo).toHaveTextContent('Palmeiras 1 × 0 Corinthians');
    await user.click(within(aoVivo).getByRole('link', { name: /Entrar no jogo/ }));
    expect(local()).toBe('/ao-vivo');
  });

  it('lista os próximos com a abertura do palpite: o primeiro só no apito final enquanto há jogo', async () => {
    temporada();
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/jogos');
    await screen.findByRole('region', { name: 'Próximos' });
    expect(linhas('Próximos')).toEqual([
      'Palmeiras × Flamengo, 14 OUT · Brasileirão Série A · rodada 31 · qua 21:30 · abre no apito final',
      'São Paulo × Palmeiras, 18 OUT · Brasileirão Série A · rodada 32 · dom 16:00 · abre qui',
    ]);
    expect(within(screen.getByRole('region', { name: 'Próximos' })).getAllByRole('link')[0]).toHaveAttribute('href', '/escalacao');
  });

  it('sem jogo em campo, o palpite do próximo já está aberto', async () => {
    temporada({ aoVivo: false });
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/jogos');
    await screen.findByRole('region', { name: 'Próximos' });
    expect(screen.queryByRole('region', { name: 'Jogo ao vivo' })).not.toBeInTheDocument();
    expect(linhas('Próximos')[0]).toContain('palpite aberto');
  });

  it('lista os resultados do mais recente para o mais antigo, com V/E/D do lado do clube', async () => {
    temporada();
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/jogos');
    await screen.findByRole('region', { name: 'Resultados' });
    expect(linhas('Resultados')).toEqual([
      'Vitória: Palmeiras 1 × 0 Bahia, 08 OUT · Brasileirão Série A · rodada 29',
      'Derrota: Flamengo 2 × 0 Palmeiras, 05 OUT · Brasileirão Série A · rodada 28',
      'Empate: Palmeiras 1 × 1 São Paulo, 01 OUT · Brasileirão Série A · rodada 27',
    ]);
  });

  it('avisa quando não há jogos', async () => {
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/jogos');
    expect(await screen.findByText('Nenhum jogo marcado por enquanto.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum resultado ainda.')).toBeInTheDocument();
  });

  it('com erro ao carregar, deixa tentar de novo', async () => {
    temporada();
    supabaseFalso.logar(perfilDeTeste());
    const original = supabaseFalso.cliente.from.getMockImplementation()!;
    supabaseFalso.cliente.from.mockImplementation((tabela: string) =>
      tabela === 'partidas' ? { select: () => ({ or: () => ({ order: async () => ({ data: null, error: { message: 'offline' } }) }) }) } : original(tabela),
    );
    const { user } = renderApp('/jogos');
    expect(await screen.findByText('Não deu para carregar os jogos agora. Verifique sua conexão.')).toBeInTheDocument();

    supabaseFalso.cliente.from.mockImplementation(original);
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('region', { name: 'Jogo ao vivo' })).toBeInTheDocument();
  });

  it('o resultado mostra a letra V/E/D na tela', async () => {
    temporada();
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/jogos');
    const resultados = await screen.findByRole('region', { name: 'Resultados' });
    expect(within(resultados).getAllByTitle(/Vitória|Empate|Derrota/).map((e) => e.textContent)).toEqual(['V', 'D', 'E']);
  });

  it('a tela é aberta para todos; as telas de jogo seguem só para membros', async () => {
    supabaseFalso.assinar(assinaturaDeTeste({ status: 'expirada' }));
    temporada();
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/jogos');
    await screen.findByRole('region', { name: 'Resultados' });
    expect(screen.queryByText('SÓ PARA MEMBROS')).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('region', { name: 'Resultados' })).getAllByRole('link')[0]);
    expect(await screen.findByText('SÓ PARA MEMBROS')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pós-jogo e notas' })).toBeInTheDocument();
  });
});
