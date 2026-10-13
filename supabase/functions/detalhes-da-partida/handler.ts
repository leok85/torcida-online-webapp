// Estatísticas, lances e escalações de um jogo para a página do jogo (W02). Busca na BSD só quando alguém abre o
// jogo e o cache (tabela detalhes_partidas) passou do prazo; reservar_detalhes() garante um pedido por prazo mesmo
// com milhares de torcedores na página. Jogo encerrado há mais de 3 h vira "final" e não gasta mais cota.
// Fica separado do index.ts, que só existe no Deno, para os testes do Vitest chamarem direto.
import { CORS, json, jwtDe, lerCorpo } from '../_compartilhado/http.ts';

// ---------- BSD ----------

/** Contadores de um lado em /api/v2/events/{id}/stats/ (os que a página usa). */
export type LadoBsd = {
  ball_possession?: number | null;
  total_shots?: number | null;
  shots_on_target?: number | null;
  corner_kicks?: number | null;
  fouls?: number | null;
  offsides?: number | null;
  pass_accuracy_pct?: number | null;
};
export type EstatisticasBsd = { stats?: { home?: LadoBsd; away?: LadoBsd } | unknown[] | null };

export type IncidenteBsd = {
  type: string;
  minute?: number | null;
  added_time?: number | null;
  is_home?: boolean;
  player?: string | null;
  player_id?: number | null;
  assist?: string | null;
  goal_type?: string | null;
  card_type?: string | null;
  player_in?: string | null;
  player_out?: string | null;
  player_in_id?: number | null;
  player_out_id?: number | null;
};

type JogadorBsd = { id: number; name: string; short_name?: string | null; position?: string | null; jersey_number?: number | null; captain?: boolean };
type LadoEscalacaoBsd = { formation?: string | null; players?: JogadorBsd[] | null; substitutes?: JogadorBsd[] | null };
export type EscalacoesBsd = { lineup_status?: string; lineups?: { home?: LadoEscalacaoBsd | null; away?: LadoEscalacaoBsd | null } | null };

/** /api/v2/events/{id}/player-stats/: números de cada jogador, com a nota (rating) de 0 a 10. */
export type NotasBsd = { player_stats?: { player_id: number; rating?: number | null }[] | null };

export type Bsd = {
  estatisticas(id: number): Promise<EstatisticasBsd>;
  notas(id: number): Promise<NotasBsd>;
  incidentes(id: number): Promise<IncidenteBsd[]>;
  escalacoes(id: number): Promise<EscalacoesBsd>;
};

// ---------- formato salvo (o mesmo que o web app lê em src/data/jogo.ts) ----------

export type Numeros = {
  posse: number | null;
  finalizacoes: number | null;
  no_gol: number | null;
  escanteios: number | null;
  faltas: number | null;
  impedimentos: number | null;
  passes_certos: number | null;
};
export type Estatisticas = { mandante: Numeros; visitante: Numeros };

export type Lance =
  | { tipo: 'gol'; minuto: string; mandante: boolean; jogador: string; jogador_id: number | null; assistencia: string | null; contra: boolean; penalti: boolean }
  | { tipo: 'cartao'; minuto: string; mandante: boolean; jogador: string; jogador_id: number | null; cor: 'amarelo' | 'vermelho' }
  | { tipo: 'substituicao'; minuto: string; mandante: boolean; entrou: string; saiu: string; entrou_id: number | null; saiu_id: number | null };

export type Jogador = { id: number; nome: string; numero: number | null; posicao: 'G' | 'D' | 'M' | 'F' | null; capitao: boolean };
export type Escalacao = { formacao: string | null; titulares: Jogador[]; reservas: Jogador[] };
export type Escalacoes = { mandante: Escalacao; visitante: Escalacao };

/** Nota TO de cada jogador: { "<id>": 8.7 }. */
export type Notas = Record<string, number>;

export type Detalhes = { estatisticas: Estatisticas | null; lances: Lance[]; escalacoes: Escalacoes | null; notas: Notas };
export type DetalhesSalvos = Detalhes & { final: boolean };

export type PartidaResumo = { id: number; status: string; inicio: string };

export type Dependencias = {
  usuarioDoToken(jwt: string): Promise<{ id: string } | null>;
  partida(id: number): Promise<PartidaResumo | null>;
  detalhes(id: number): Promise<DetalhesSalvos | null>;
  /** reservar_detalhes(): true para um único pedido por prazo. */
  reservar(id: number, segundos: number): Promise<boolean>;
  salvar(id: number, detalhes: Detalhes, final: boolean): Promise<void>;
  /** null quando a chave da BSD não está configurada: devolve só o que já estiver salvo. */
  bsd: Bsd | null;
  agora?: () => Date;
};

/** Prazo do cache: ao vivo muda a cada lance; encerrado ainda recebe correções da BSD por algumas horas. */
export const PRAZO_S = { ao_vivo: 90, encerrada: 600, agendada: 600 } as const;
/** Escalação confirmada sai ~1 h antes; antes disso, jogo marcado nem consulta a BSD. */
const ESCALACAO_ANTES_MS = 2 * 60 * 60_000;
/** Depois disso o jogo encerrado é "final": estatísticas e lances não mudam mais. */
const FINAL_DEPOIS_DO_INICIO_MS = 3 * 60 * 60_000;

const VAZIO: Detalhes = { estatisticas: null, lances: [], escalacoes: null, notas: {} };

const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function numerosDe(l: LadoBsd | undefined): Numeros {
  return {
    posse: numero(l?.ball_possession),
    finalizacoes: numero(l?.total_shots),
    no_gol: numero(l?.shots_on_target),
    escanteios: numero(l?.corner_kicks),
    faltas: numero(l?.fouls),
    impedimentos: numero(l?.offsides),
    passes_certos: numero(l?.pass_accuracy_pct) === null ? null : Math.round(l!.pass_accuracy_pct!),
  };
}

/** Estatísticas dos dois lados; null antes do jogo (a BSD manda lista vazia) ou sem nenhum número. */
export function estatisticasDe(bsd: EstatisticasBsd): Estatisticas | null {
  const s = bsd.stats;
  if (!s || Array.isArray(s) || (!('home' in s) && !('away' in s))) return null;
  const lados = s as { home?: LadoBsd; away?: LadoBsd };
  const e = { mandante: numerosDe(lados.home), visitante: numerosDe(lados.away) };
  const algum = [...Object.values(e.mandante), ...Object.values(e.visitante)].some((v) => v !== null);
  return algum ? e : null;
}

const minutoDe = (i: IncidenteBsd) => (i.added_time ? `${i.minute}+${i.added_time}` : String(i.minute ?? ''));
const ordemDe = (i: IncidenteBsd) => (i.minute ?? 0) * 100 + (i.added_time ?? 0);

/** Gols, cartões e substituições, do mais recente para o mais antigo. Pênalti perdido e marcações de período ficam de fora. */
export function lancesDe(incidentes: IncidenteBsd[]): Lance[] {
  const lances: (Lance & { ordem: number })[] = [];
  for (const i of incidentes) {
    const base = { minuto: minutoDe(i), mandante: !!i.is_home, ordem: ordemDe(i) };
    if (i.type === 'goal' && i.player && !(i.goal_type ?? '').toLowerCase().includes('miss')) {
      lances.push({
        ...base,
        tipo: 'gol',
        jogador: i.player,
        jogador_id: i.player_id ?? null,
        assistencia: i.assist ?? null,
        contra: i.goal_type === 'ownGoal',
        penalti: i.goal_type === 'penalty',
      });
    } else if (i.type === 'card' && i.player) {
      const cor = (i.card_type ?? '').toLowerCase().includes('red') ? 'vermelho' : 'amarelo';
      lances.push({ ...base, tipo: 'cartao', jogador: i.player, jogador_id: i.player_id ?? null, cor });
    } else if (i.type === 'substitution' && i.player_in && i.player_out) {
      lances.push({
        ...base,
        tipo: 'substituicao',
        entrou: i.player_in,
        saiu: i.player_out,
        entrou_id: i.player_in_id ?? null,
        saiu_id: i.player_out_id ?? null,
      });
    }
  }
  return lances.sort((a, b) => b.ordem - a.ordem).map(({ ordem: _ordem, ...lance }) => lance as Lance);
}

const POSICOES = ['G', 'D', 'M', 'F'];

function jogadoresDe(lista: JogadorBsd[] | null | undefined): Jogador[] {
  return (lista ?? []).map((j) => ({
    id: j.id,
    nome: j.short_name || j.name,
    numero: j.jersey_number ?? null,
    posicao: POSICOES.includes(j.position ?? '') ? (j.position as Jogador['posicao']) : null,
    capitao: !!j.captain,
  }));
}

/** Só a escalação confirmada pelo clube: a prevista pela IA da BSD não entra na página. */
export function escalacoesDe(bsd: EscalacoesBsd): Escalacoes | null {
  const l = bsd.lineups;
  if (bsd.lineup_status !== 'confirmed' || !l?.home?.players?.length || !l.away?.players?.length) return null;
  const lado = (s: LadoEscalacaoBsd): Escalacao => ({ formacao: s.formation ?? null, titulares: jogadoresDe(s.players), reservas: jogadoresDe(s.substitutes) });
  return { mandante: lado(l.home), visitante: lado(l.away) };
}

/** Nota de quem entrou em campo, com uma casa; quem não jogou vem sem nota e fica de fora. */
export function notasDe(bsd: NotasBsd): Notas {
  const notas: Notas = {};
  for (const j of bsd.player_stats ?? []) {
    if (typeof j.rating === 'number' && Number.isFinite(j.rating)) notas[String(j.player_id)] = Math.round(j.rating * 10) / 10;
  }
  return notas;
}

// ---------- handler ----------

export async function detalhesDaPartida(req: Request, deps: Dependencias): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { erro: 'metodo_nao_permitido' });

  const jwt = jwtDe(req);
  if (!jwt || !(await deps.usuarioDoToken(jwt))) return json(401, { erro: 'sem_sessao' });

  const { partida: id } = await lerCorpo(req);
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return json(400, { erro: 'partida_invalida' });
  const partida = await deps.partida(id);
  if (!partida) return json(404, { erro: 'partida_nao_encontrada' });

  const salvo = await deps.detalhes(id);
  const atual: Detalhes = salvo ? { estatisticas: salvo.estatisticas, lances: salvo.lances, escalacoes: salvo.escalacoes, notas: salvo.notas ?? {} } : VAZIO;
  const agora = (deps.agora?.() ?? new Date()).getTime();
  const inicio = new Date(partida.inicio).getTime();

  const status = partida.status as keyof typeof PRAZO_S;
  if (!(status in PRAZO_S) || salvo?.final || !deps.bsd) return json(200, atual);
  // Jogo marcado: só a escalação, e só perto do início.
  if (status === 'agendada' && (inicio - agora > ESCALACAO_ANTES_MS || atual.escalacoes)) return json(200, atual);
  if (!(await deps.reservar(id, PRAZO_S[status]))) return json(200, atual);

  const bsd = deps.bsd;
  const comJogo = status !== 'agendada';
  const [estatisticas, incidentes, escalacoes, notas] = await Promise.allSettled([
    comJogo ? bsd.estatisticas(id) : Promise.reject(),
    comJogo ? bsd.incidentes(id) : Promise.reject(),
    // Escalação confirmada não muda: depois de salva, não é pedida de novo.
    atual.escalacoes ? Promise.reject() : bsd.escalacoes(id),
    comJogo ? bsd.notas(id) : Promise.reject(),
  ]);
  // Falha numa parte mantém o que já estava salvo dela.
  const novo: Detalhes = {
    estatisticas: estatisticas.status === 'fulfilled' ? (estatisticasDe(estatisticas.value) ?? atual.estatisticas) : atual.estatisticas,
    lances: incidentes.status === 'fulfilled' ? lancesDe(incidentes.value) : atual.lances,
    escalacoes: escalacoes.status === 'fulfilled' ? (escalacoesDe(escalacoes.value) ?? atual.escalacoes) : atual.escalacoes,
    notas: notas.status === 'fulfilled' && Object.keys(notasDe(notas.value)).length ? notasDe(notas.value) : atual.notas,
  };
  const final = status === 'encerrada' && agora - inicio > FINAL_DEPOIS_DO_INICIO_MS && estatisticas.status === 'fulfilled' && incidentes.status === 'fulfilled' && notas.status === 'fulfilled';
  await deps.salvar(id, novo, final);
  return json(200, novo);
}
