import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  if (aoVivo) supabaseFalso.adicionarPartida(partidaDeTeste()); // Palmeiras 1 x 0 Corinthians, 67'
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
    renderApp('/jogo/7290');
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

    // Espera a tela carregada: o título do skeleton é outro elemento e sai quando os jogos chegam.
    const aoVivo = await screen.findByRole('region', { name: 'Jogo ao vivo' });
    expect(screen.getByRole('heading', { name: 'Jogos do Palmeiras' })).toBeInTheDocument();
    expect(aoVivo).toHaveTextContent("AO VIVO · 67'");
    expect(aoVivo).toHaveTextContent('Palmeiras 1 x 0 Corinthians');
    await user.click(within(aoVivo).getByRole('link', { name: /Entrar no jogo/ }));
    expect(local()).toBe('/jogo/7290');
  });

  it('lista os próximos com a abertura do palpite: o primeiro só no apito final enquanto há jogo', async () => {
    temporada();
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/jogos');
    await screen.findByRole('region', { name: 'Próximos' });
    expect(linhas('Próximos')).toEqual([
      'Palmeiras x Flamengo, 14 OUT · Brasileirão Série A · rodada 31 · qua 21:30 · abre no apito final',
      'São Paulo x Palmeiras, 18 OUT · Brasileirão Série A · rodada 32 · dom 16:00 · abre qui',
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
      'Vitória: Palmeiras 1 x 0 Bahia, 08 OUT · Brasileirão Série A · rodada 29',
      'Derrota: Flamengo 2 x 0 Palmeiras, 05 OUT · Brasileirão Série A · rodada 28',
      'Empate: Palmeiras 1 x 1 São Paulo, 01 OUT · Brasileirão Série A · rodada 27',
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

  it('sem jogo em campo, o último jogo fica em destaque com o caminho para as notas', async () => {
    temporada({ aoVivo: false });
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/jogos');
    const ultimo = await screen.findByRole('region', { name: 'Último jogo' });
    expect(ultimo).toHaveTextContent('ÚLTIMO JOGO');
    expect(ultimo).toHaveTextContent('Palmeiras 1 x 0 Bahia');
    expect(ultimo).toHaveTextContent('VITÓRIA');
    expect(ultimo).toHaveTextContent('Brasileirão Série A · rodada 29');
    await user.click(within(ultimo).getByRole('link', { name: /Notas e resumo/ }));
    expect(local()).toBe('/jogo/7279/notas');
  });

  it('com jogo em campo, não mostra o último jogo', async () => {
    temporada();
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/jogos');
    await screen.findByRole('region', { name: 'Jogo ao vivo' });
    expect(screen.queryByRole('region', { name: 'Último jogo' })).not.toBeInTheDocument();
  });

  it('filtra por campeonato; o campeonato sem jogos na lista avisa', async () => {
    temporada();
    supabaseFalso.adicionarPartida(marcada(7400, '2026-10-21T00:30:00Z', { liga_id: 32, liga_nome: 'Copa Libertadores', rodada: null, visitante_id: 166, visitante_nome: 'Bahia' }));
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/jogos');
    const filtro = await screen.findByRole('group', { name: 'Campeonato' });
    expect(within(filtro).getAllByRole('button').map((b) => b.textContent)).toEqual(['Todas', 'Brasileirão Série A', 'Copa Libertadores']);
    expect(within(filtro).getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(filtro).getByRole('button', { name: 'Copa Libertadores' }));
    expect(within(filtro).getByRole('button', { name: 'Copa Libertadores' })).toHaveAttribute('aria-pressed', 'true');
    // O palpite segue a ordem de todos os jogos: este é o terceiro marcado.
    expect(linhas('Próximos')).toEqual(['Palmeiras x Bahia, 20 OUT · Copa Libertadores · ter 21:30 · abre seg']);
    expect(within(screen.getByRole('region', { name: 'Resultados' })).getByText('Nenhum jogo de Copa Libertadores aqui.')).toBeInTheDocument();

    await user.click(within(filtro).getByRole('button', { name: 'Todas' }));
    expect(linhas('Próximos')).toHaveLength(3);
  });
});

describe('Jogos (W20) · temporada', () => {
  afterEach(() => vi.useRealTimers());

  it('mostra a temporada mês a mês, com o resumo e a linha de hoje antes do que vem', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-13T15:00:00Z'), shouldAdvanceTime: true });
    temporada();
    supabaseFalso.adicionarPartida(encerrada(7200, '2026-09-20T19:00:00Z', { visitante_id: 166, visitante_nome: 'Bahia', rodada: 25, gols_mandante: 3, gols_visitante: 0 }));
    // De outra temporada: fica de fora.
    supabaseFalso.adicionarPartida(encerrada(7000, '2025-11-20T19:00:00Z', { visitante_id: 166, visitante_nome: 'Bahia', rodada: 35, gols_mandante: 0, gols_visitante: 0 }));
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/jogos');
    await user.click(await screen.findByRole('button', { name: 'Temporada 2026' }));
    expect(screen.getByRole('button', { name: 'Temporada 2026' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('region', { name: 'Próximos' })).not.toBeInTheDocument();

    const temporadaCard = screen.getByRole('region', { name: 'Temporada 2026' });
    expect(temporadaCard).toHaveTextContent('7 jogos · 4 disputados · 2V 1E 1D');
    expect(within(temporadaCard).getByRole('group', { name: 'Setembro' })).toHaveTextContent('1 jogo');
    const outubro = within(temporadaCard).getByRole('group', { name: 'Outubro' });
    expect(outubro).toHaveTextContent('6 jogos');
    expect(within(outubro).getAllByRole('link').map((l) => l.getAttribute('aria-label'))).toEqual([
      'Palmeiras 1 x 1 São Paulo, 01 qui · Brasileirão Série A · rodada 27 · Empate',
      'Flamengo 2 x 0 Palmeiras, 05 seg · Brasileirão Série A · rodada 28 · Derrota',
      'Palmeiras 1 x 0 Bahia, 08 qui · Brasileirão Série A · rodada 29 · Vitória',
      'Palmeiras 1 x 0 Corinthians, 11 dom · Brasileirão Série A · rodada 30 · Ao vivo',
      'Palmeiras × Flamengo, 14 qua · Brasileirão Série A · rodada 31 · qua 21:30',
      'São Paulo × Palmeiras, 18 dom · Brasileirão Série A · rodada 32 · dom 16:00',
    ]);
    // A linha de hoje fica logo antes do primeiro jogo que não terminou.
    const hoje = within(outubro).getByText('HOJE · 13 OUT');
    expect(hoje.closest('li')).toHaveTextContent('Palmeiras 1 x 0 Corinthians');

    await user.click(within(outubro).getByRole('link', { name: /Ao vivo$/ }));
    expect(local()).toBe('/jogo/7290');
  });

  it('com filtro, a temporada mostra só o campeonato; sem jogos, avisa', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-13T15:00:00Z'), shouldAdvanceTime: true });
    temporada();
    supabaseFalso.adicionarPartida(encerrada(7000, '2025-11-20T19:00:00Z', { liga_id: 32, liga_nome: 'Copa Libertadores', gols_mandante: 0, gols_visitante: 0 }));
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/jogos');
    await user.click(await screen.findByRole('button', { name: 'Temporada 2026' }));
    await user.click(screen.getByRole('button', { name: 'Copa Libertadores' }));
    expect(screen.getByText('Nenhum jogo de Copa Libertadores em 2026.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Temporada 2026' })).toHaveTextContent('0 jogos · 0 disputados · 0V 0E 0D');
  });
});
