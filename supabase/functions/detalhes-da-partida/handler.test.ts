import { describe, expect, it, vi } from 'vitest';
import {
  detalhesDaPartida,
  escalacoesDe,
  estatisticasDe,
  lancesDe,
  notasDe,
  type Bsd,
  type Dependencias,
  type Detalhes,
  type DetalhesSalvos,
  type IncidenteBsd,
  type PartidaResumo,
} from './handler';

// Trechos reais de Palmeiras 4 x 1 Corinthians (BSD, evento 7290).
const INCIDENTES: IncidenteBsd[] = [
  { type: 'period', minute: 90 },
  { type: 'goal', minute: 90, added_time: 1, is_home: false, player: 'G. Henrique', player_id: 256, assist: 'Vitinho', goal_type: 'regular' },
  { type: 'substitution', minute: 83, is_home: true, player_in: 'B. Fuchs', player_out: 'G. Gómez', player_in_id: 35, player_out_id: 26 },
  { type: 'card', minute: 72, is_home: true, player: 'G. Gómez', player_id: 26, card_type: 'yellow' },
  { type: 'goal', minute: 46, is_home: true, player: 'M. Bidu', player_id: 257, goal_type: 'ownGoal' },
  { type: 'goal', minute: 45, added_time: 1, is_home: true, player: 'A. Giay', player_id: 3622, assist: 'J. Arias', goal_type: 'regular' },
  { type: 'injuryTime', minute: 45 },
  { type: 'goal', minute: 30, is_home: false, player: 'M. Depay', goal_type: 'missedPenalty' },
  { type: 'card', minute: 20, is_home: false, player: 'Raniele', player_id: 267, card_type: 'red' },
];

const ESTATISTICAS = {
  stats: {
    home: { ball_possession: 58, total_shots: 17, shots_on_target: 8, corner_kicks: 6, fouls: 11, offsides: 2, pass_accuracy_pct: 86.4 },
    away: { ball_possession: 42, total_shots: 7, shots_on_target: 2, corner_kicks: 3, fouls: 15, offsides: null, pass_accuracy_pct: 79.6 },
  },
};

const NOTAS = {
  player_stats: [
    { player_id: 3622, rating: 8.7 },
    { player_id: 3876, rating: 7.25 },
    // Não entrou: sem nota.
    { player_id: 40, rating: null },
  ],
};

const ESCALACOES = {
  lineup_status: 'confirmed',
  lineups: {
    home: {
      formation: '3-4-2-1',
      players: [{ id: 24, name: 'Carlos Miguel', short_name: 'C. Miguel', position: 'G', jersey_number: 1, captain: false }],
      substitutes: [{ id: 35, name: 'Bruno Fuchs', short_name: 'B. Fuchs', position: 'D', jersey_number: 3 }],
    },
    away: { formation: '4-1-3-2', players: [{ id: 253, name: 'Hugo Souza', short_name: 'H. Souza', position: 'G', jersey_number: 1 }], substitutes: [] },
  },
};

describe('normalização da BSD', () => {
  it('estatísticas dos dois lados, com passes certos arredondados', () => {
    expect(estatisticasDe(ESTATISTICAS)).toEqual({
      mandante: { posse: 58, finalizacoes: 17, no_gol: 8, escanteios: 6, faltas: 11, impedimentos: 2, passes_certos: 86 },
      visitante: { posse: 42, finalizacoes: 7, no_gol: 2, escanteios: 3, faltas: 15, impedimentos: null, passes_certos: 80 },
    });
  });

  it('antes do jogo a BSD manda lista vazia: sem estatísticas', () => {
    expect(estatisticasDe({ stats: [] })).toBeNull();
    expect(estatisticasDe({ stats: { home: {}, away: {} } })).toBeNull();
  });

  it('lances do mais recente ao mais antigo, sem marcações de período nem pênalti perdido', () => {
    expect(lancesDe(INCIDENTES)).toEqual([
      { tipo: 'gol', minuto: '90+1', mandante: false, jogador: 'G. Henrique', jogador_id: 256, assistencia: 'Vitinho', contra: false, penalti: false },
      { tipo: 'substituicao', minuto: '83', mandante: true, entrou: 'B. Fuchs', saiu: 'G. Gómez', entrou_id: 35, saiu_id: 26 },
      { tipo: 'cartao', minuto: '72', mandante: true, jogador: 'G. Gómez', jogador_id: 26, cor: 'amarelo' },
      { tipo: 'gol', minuto: '46', mandante: true, jogador: 'M. Bidu', jogador_id: 257, assistencia: null, contra: true, penalti: false },
      { tipo: 'gol', minuto: '45+1', mandante: true, jogador: 'A. Giay', jogador_id: 3622, assistencia: 'J. Arias', contra: false, penalti: false },
      { tipo: 'cartao', minuto: '20', mandante: false, jogador: 'Raniele', jogador_id: 267, cor: 'vermelho' },
    ]);
  });

  it('nota TO de quem entrou em campo, com uma casa', () => {
    expect(notasDe(NOTAS)).toEqual({ '3622': 8.7, '3876': 7.3 });
    expect(notasDe({ player_stats: null })).toEqual({});
  });

  it('escalação só quando confirmada, com o nome curto', () => {
    expect(escalacoesDe(ESCALACOES)).toEqual({
      mandante: {
        formacao: '3-4-2-1',
        titulares: [{ id: 24, nome: 'C. Miguel', numero: 1, posicao: 'G', capitao: false }],
        reservas: [{ id: 35, nome: 'B. Fuchs', numero: 3, posicao: 'D', capitao: false }],
      },
      visitante: { formacao: '4-1-3-2', titulares: [{ id: 253, nome: 'H. Souza', numero: 1, posicao: 'G', capitao: false }], reservas: [] },
    });
    expect(escalacoesDe({ ...ESCALACOES, lineup_status: 'predicted' })).toBeNull();
    expect(escalacoesDe({ lineup_status: 'unavailable', lineups: null })).toBeNull();
  });
});

const AGORA = new Date('2026-10-11T22:00:00Z');

function dependencias(partida: PartidaResumo | null, salvo: DetalhesSalvos | null = null, { reserva = true } = {}) {
  let guardado = salvo;
  const bsd = {
    estatisticas: vi.fn(async () => ESTATISTICAS),
    incidentes: vi.fn(async () => INCIDENTES),
    escalacoes: vi.fn(async () => ESCALACOES),
    notas: vi.fn(async () => NOTAS),
  } satisfies Bsd;
  const deps = {
    usuarioDoToken: vi.fn(async (jwt: string) => (jwt === 'token-valido' ? { id: 'usuario-1' } : null)),
    partida: vi.fn(async () => partida),
    detalhes: vi.fn(async () => guardado),
    reservar: vi.fn(async () => reserva),
    salvar: vi.fn(async (_id: number, d: Detalhes, final: boolean) => {
      guardado = { ...d, final };
    }),
    bsd,
    agora: () => AGORA,
  } satisfies Dependencias;
  return { deps, bsd, guardado: () => guardado };
}

const pedido = (corpo: object, token = 'token-valido') =>
  new Request('http://supabase.test/functions/v1/detalhes-da-partida', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });

const aoVivo: PartidaResumo = { id: 7290, status: 'ao_vivo', inicio: '2026-10-11T20:30:00Z' };

describe('detalhes-da-partida', () => {
  it('jogo ao vivo: busca na BSD, salva e devolve estatísticas, lances e escalações', async () => {
    const { deps, guardado } = dependencias(aoVivo);
    const resposta = await detalhesDaPartida(pedido({ partida: 7290 }), deps);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.estatisticas.mandante.posse).toBe(58);
    expect(corpo.lances).toHaveLength(6);
    expect(corpo.escalacoes.mandante.formacao).toBe('3-4-2-1');
    expect(corpo.notas).toEqual({ '3622': 8.7, '3876': 7.3 });
    expect(deps.reservar).toHaveBeenCalledWith(7290, 90);
    expect(guardado()?.final).toBe(false);
  });

  it('com o cache dentro do prazo (reserva negada), devolve o salvo sem chamar a BSD', async () => {
    const salvo = { estatisticas: null, lances: [], escalacoes: null, notas: {}, final: false };
    const { deps, bsd } = dependencias(aoVivo, salvo, { reserva: false });
    const resposta = await detalhesDaPartida(pedido({ partida: 7290 }), deps);
    expect(await resposta.json()).toEqual({ estatisticas: null, lances: [], escalacoes: null, notas: {} });
    expect(bsd.estatisticas).not.toHaveBeenCalled();
  });

  it('escalação já salva não é pedida de novo', async () => {
    const salvo = { estatisticas: null, lances: [], escalacoes: escalacoesDe(ESCALACOES), notas: {}, final: false };
    const { deps, bsd } = dependencias(aoVivo, salvo);
    await detalhesDaPartida(pedido({ partida: 7290 }), deps);
    expect(bsd.escalacoes).not.toHaveBeenCalled();
    expect(bsd.incidentes).toHaveBeenCalled();
  });

  it('se uma parte falha na BSD, mantém o que já estava salvo dela', async () => {
    const lances = lancesDe(INCIDENTES.slice(0, 2));
    const { deps, bsd } = dependencias(aoVivo, { estatisticas: null, lances, escalacoes: null, notas: { '3622': 8 }, final: false });
    bsd.incidentes.mockRejectedValue(new Error('BSD 500'));
    bsd.notas.mockRejectedValue(new Error('BSD 500'));
    const corpo = await (await detalhesDaPartida(pedido({ partida: 7290 }), deps)).json();
    expect(corpo.lances).toEqual(lances);
    expect(corpo.notas).toEqual({ '3622': 8 });
    expect(corpo.estatisticas.mandante.finalizacoes).toBe(17);
  });

  it('jogo encerrado há mais de 3 h vira final; depois disso nem reserva', async () => {
    const encerrada = { id: 7279, status: 'encerrada', inicio: '2026-10-09T00:30:00Z' };
    const { deps, guardado } = dependencias(encerrada);
    await detalhesDaPartida(pedido({ partida: 7279 }), deps);
    expect(deps.reservar).toHaveBeenCalledWith(7279, 600);
    expect(guardado()?.final).toBe(true);

    deps.reservar.mockClear();
    await detalhesDaPartida(pedido({ partida: 7279 }), deps);
    expect(deps.reservar).not.toHaveBeenCalled();
  });

  it('jogo marcado longe do início não gasta cota; perto do início busca só a escalação', async () => {
    const longe = dependencias({ id: 1, status: 'agendada', inicio: '2026-10-12T22:00:00Z' });
    expect(await (await detalhesDaPartida(pedido({ partida: 1 }), longe.deps)).json()).toEqual({ estatisticas: null, lances: [], escalacoes: null, notas: {} });
    expect(longe.deps.reservar).not.toHaveBeenCalled();

    const perto = dependencias({ id: 2, status: 'agendada', inicio: '2026-10-11T23:00:00Z' });
    const corpo = await (await detalhesDaPartida(pedido({ partida: 2 }), perto.deps)).json();
    expect(corpo.escalacoes.visitante.formacao).toBe('4-1-3-2');
    expect(perto.bsd.estatisticas).not.toHaveBeenCalled();
    expect(perto.bsd.notas).not.toHaveBeenCalled();
  });

  it('sem sessão, partida inválida ou inexistente', async () => {
    const { deps } = dependencias(null);
    expect((await detalhesDaPartida(pedido({ partida: 7290 }, 'outro'), deps)).status).toBe(401);
    expect((await detalhesDaPartida(pedido({ partida: '7290' }), deps)).status).toBe(400);
    expect((await detalhesDaPartida(pedido({ partida: 7290 }), deps)).status).toBe(404);
  });

  it('jogo adiado ou cancelado não consulta a BSD', async () => {
    const { deps } = dependencias({ id: 3, status: 'adiada', inicio: '2026-10-11T20:30:00Z' });
    await detalhesDaPartida(pedido({ partida: 3 }), deps);
    expect(deps.reservar).not.toHaveBeenCalled();
  });
});
