import { describe, expect, it, vi } from 'vitest';
import { golsDe, MAX_INCIDENTES, periodoDe, sincronizar, type Banco, type Bsd, type EventoBsd, type IncidenteBsd, type Partida, type PartidaSalva } from './handler';

const AGORA = new Date('2026-10-11T21:00:00Z');

const evento = (campos: Partial<EventoBsd> = {}): EventoBsd => ({
  id: 7290,
  league_id: 9,
  round_number: 30,
  event_date: '2026-10-11T20:30:00+00:00',
  status: 'inprogress',
  period: '2nd_half',
  current_minute: 67,
  home_team_id: 162,
  home_team: 'Palmeiras',
  away_team_id: 167,
  away_team: 'Corinthians',
  home_score: 1,
  away_score: 0,
  ...campos,
});

const gol = (campos: Partial<IncidenteBsd> = {}): IncidenteBsd => ({ type: 'goal', minute: 16, player: 'A. Barboza', is_home: true, goal_type: 'regular', ...campos });

function montar({ aoVivo = [evento()] as EventoBsd[], agenda = [] as EventoBsd[], salvas = new Map<number, PartidaSalva>(), idsAoVivo = [] as number[], finais = new Map<number, EventoBsd>(), incidentes = [gol()] as IncidenteBsd[] } = {}) {
  const bsd = {
    aoVivo: vi.fn(async () => [...aoVivo]),
    eventos: vi.fn(async (_de: string, _ate: string) => [...agenda]),
    evento: vi.fn(async (id: number) => finais.get(id) ?? null),
    incidentes: vi.fn(async (_id: number) => incidentes),
    nomeDaLiga: vi.fn(async (_id: number) => 'Copa Libertadores'),
  } satisfies Bsd;
  const salvar = vi.fn(async (_p: Partida[]) => {});
  const banco: Banco = {
    catalogo: async () => ({
      clubes: new Map([[162, 'Palmeiras'], [167, 'Corinthians'], [160, 'Flamengo']]),
      ligas: new Map([[9, 'Brasileirão Série A']]),
    }),
    partidas: async (ids) => new Map([...salvas].filter(([id]) => ids.includes(id))),
    idsAoVivo: async () => idsAoVivo,
    salvar,
  };
  const salvasNaChamada = () => salvar.mock.calls.at(-1)?.[0] ?? [];
  return { bsd, banco, salvar, salvasNaChamada };
}

const pedido = (corpo: object = { modo: 'ao_vivo' }, segredo = 'segredo-cron') =>
  new Request('http://supabase.test/functions/v1/sincronizar-partidas', {
    method: 'POST',
    headers: { 'x-segredo': segredo, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });

const rodar = (m: ReturnType<typeof montar>, req = pedido()) =>
  sincronizar(req, { bsd: m.bsd, banco: m.banco, segredo: 'segredo-cron', agora: () => AGORA });

describe('sincronizar-partidas', () => {
  it('copia o jogo ao vivo com placar, período, minuto, liga do catálogo e gols', async () => {
    const m = montar();
    const resposta = await rodar(m);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true, modo: 'ao_vivo', salvas: 1, incidentes: 1 });
    expect(m.salvasNaChamada()).toEqual([
      {
        id: 7290,
        liga_id: 9,
        liga_nome: 'Brasileirão Série A',
        rodada: 30,
        inicio: '2026-10-11T20:30:00+00:00',
        status: 'ao_vivo',
        periodo: '2T',
        minuto: 67,
        mandante_id: 162,
        mandante_nome: 'Palmeiras',
        visitante_id: 167,
        visitante_nome: 'Corinthians',
        gols_mandante: 1,
        gols_visitante: 0,
        gols: [{ jogador: 'A. Barboza', minuto: '16', mandante: true, contra: false, penalti: false }],
        atualizado_em: AGORA.toISOString(),
      },
    ]);
  });

  it('ignora jogos sem nenhum clube do catálogo', async () => {
    const m = montar({ aoVivo: [evento({ id: 1, home_team_id: 2391, away_team_id: 2390 })] });
    await rodar(m);
    expect(m.salvar).not.toHaveBeenCalled();
    expect(m.bsd.incidentes).not.toHaveBeenCalled();
  });

  it('não pede os gols de novo quando o placar não mudou', async () => {
    const salva: PartidaSalva = { liga_nome: 'Brasileirão Série A', gols_mandante: 1, gols_visitante: 0, gols: [{ jogador: 'A. Barboza', minuto: '16', mandante: true, contra: false, penalti: false }] };
    const m = montar({ salvas: new Map([[7290, salva]]) });
    await rodar(m);
    expect(m.bsd.incidentes).not.toHaveBeenCalled();
    expect(m.salvasNaChamada()[0].gols).toEqual(salva.gols);
  });

  it('busca o resultado final de quem estava ao vivo e saiu da lista', async () => {
    const final = evento({ status: 'finished', period: 'FT', current_minute: 90, home_score: 4, away_score: 1 });
    const m = montar({ aoVivo: [], idsAoVivo: [7290], finais: new Map([[7290, final]]) });
    await rodar(m);
    expect(m.bsd.evento).toHaveBeenCalledWith(7290);
    expect(m.salvasNaChamada()[0]).toMatchObject({ status: 'encerrada', periodo: null, minuto: null, gols_mandante: 4, gols_visitante: 1 });
  });

  it('no modo agenda pede os últimos 2 dias e os próximos 7, ou a janela pedida', async () => {
    const m = montar({ agenda: [evento({ status: 'notstarted', home_score: null, away_score: null, current_minute: null, period: '' })] });
    await rodar(m, pedido({ modo: 'agenda' }));
    expect(m.bsd.eventos).toHaveBeenCalledWith('2026-10-09', '2026-10-18');
    expect(m.salvasNaChamada()[0]).toMatchObject({ status: 'agendada', gols: [], periodo: null });
    expect(m.bsd.incidentes).not.toHaveBeenCalled();

    await rodar(m, pedido({ modo: 'agenda', dias_antes: 30, dias_depois: 0 }));
    expect(m.bsd.eventos).toHaveBeenLastCalledWith('2026-09-11', '2026-10-11');
  });

  it('usa o nome da BSD para liga e adversário fora do catálogo', async () => {
    const m = montar({ aoVivo: [evento({ league_id: 384, away_team_id: 5001, away_team: 'Club Olimpia', home_score: 0, away_score: 0 })] });
    await rodar(m);
    expect(m.bsd.nomeDaLiga).toHaveBeenCalledWith(384);
    expect(m.salvasNaChamada()[0]).toMatchObject({ liga_nome: 'Copa Libertadores', visitante_nome: 'Club Olimpia', gols: [] });
  });

  it('limita os pedidos de gols por rodada para poupar a cota da BSD', async () => {
    const muitos = Array.from({ length: MAX_INCIDENTES + 5 }, (_, i) => evento({ id: 1000 + i }));
    const m = montar({ aoVivo: muitos });
    const corpo = await (await rodar(m)).json();
    expect(m.bsd.incidentes).toHaveBeenCalledTimes(MAX_INCIDENTES);
    expect(corpo).toMatchObject({ salvas: MAX_INCIDENTES + 5, incidentes: MAX_INCIDENTES });
  });

  it('recusa quem não manda o segredo do cron', async () => {
    const m = montar();
    const resposta = await rodar(m, pedido({}, 'outro'));
    expect(resposta.status).toBe(401);
    expect(m.bsd.aoVivo).not.toHaveBeenCalled();
  });

  it('avisa quando falta a chave da BSD ou o segredo', async () => {
    const m = montar();
    expect((await sincronizar(pedido(), { bsd: null, banco: m.banco, segredo: 'segredo-cron' })).status).toBe(503);
    expect((await sincronizar(pedido(), { bsd: m.bsd, banco: m.banco, segredo: undefined })).status).toBe(500);
  });

  it('responde 502 sem salvar nada quando a BSD falha', async () => {
    const m = montar();
    m.bsd.aoVivo.mockRejectedValueOnce(new Error('BSD 429'));
    const resposta = await rodar(m);
    expect(resposta.status).toBe(502);
    expect(m.salvar).not.toHaveBeenCalled();
  });
});

describe('golsDe', () => {
  it('põe os gols na ordem do jogo, com acréscimos, gol contra e pênalti', () => {
    const gols = golsDe([
      { type: 'period', minute: 90 },
      gol({ minute: 90, added_time: 1, player: 'G. Henrique', is_home: false }),
      gol({ minute: 51, player: 'A. Giay', goal_type: 'penalty' }),
      gol({ minute: 46, player: 'M. Bidu', goal_type: 'ownGoal' }),
      { type: 'card', minute: 40, player: 'Raniele', is_home: false },
      gol({ minute: 45, added_time: 1, player: 'A. Giay' }),
    ]);
    expect(gols).toEqual([
      { jogador: 'A. Giay', minuto: '45+1', mandante: true, contra: false, penalti: false },
      { jogador: 'M. Bidu', minuto: '46', mandante: true, contra: true, penalti: false },
      { jogador: 'A. Giay', minuto: '51', mandante: true, contra: false, penalti: true },
      { jogador: 'G. Henrique', minuto: '90+1', mandante: false, contra: false, penalti: false },
    ]);
  });

  it('ignora pênalti perdido', () => {
    expect(golsDe([gol({ goal_type: 'missedPenalty' })])).toEqual([]);
  });
});

describe('periodoDe', () => {
  it.each([
    ['1st_half', '1T'],
    ['halftime', 'INT'],
    ['2nd_half', '2T'],
    ['extra_time_1st', 'PRO'],
    ['penalties', 'PEN'],
    ['FT', null],
    [null, null],
  ])('%s → %s', (bsd, esperado) => expect(periodoDe(bsd)).toBe(esperado));
});
