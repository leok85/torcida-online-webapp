// Copia da BSD para a tabela partidas os jogos dos clubes do catálogo. Roda pelo pg_cron:
// - modo "ao_vivo" (a cada 2 min): placar e minuto de quem está em campo, e o resultado de quem acabou de terminar.
//   Só chama a BSD quando algum jogo salvo está na janela ao vivo (pelo horário de início); fora dela não gasta cota;
// - modo "agenda" (de hora em hora): resultados dos últimos dias e jogos marcados para os próximos.
// - modo "classificacao" (de hora em hora): tabela das competições que tiveram jogo nas últimas 6 h; com "todas"
//   (uma vez por dia), das ligas do catálogo e das copas em que jogam os clubes com torcedores. Guarda também o
//   formato e as fases de cada competição (tabela competicoes);
// - modo "temporada" (uma vez por dia): todos os jogos da temporada dos clubes que têm torcedores, para a tela de
//   Campeonatos (fases já disputadas de copas e estaduais).
// A conta grátis da BSD tem 7.500 pedidos por dia; por isso os gols (incidentes) só são buscados quando o placar muda.
// Fica separado do index.ts, que só existe no Deno, para os testes do Vitest chamarem direto.
import { json, lerCorpo } from '../_compartilhado/http.ts';

export type EventoBsd = {
  id: number;
  league_id: number | null;
  league_name?: string | null;
  round_number?: number | null;
  event_date: string;
  status: string;
  period?: string | null;
  current_minute?: number | null;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  // Só vêm na lista de eventos e no detalhe; a lista ao vivo não traz (aí vale o que já estava salvo).
  season_id?: number | null;
  stage?: string | null;
  stage_name?: string | null;
  group_name?: string | null;
  previous_leg_event_id?: number | null;
  penalty_shootout?: { home: number; away: number } | null;
};

export type IncidenteBsd = {
  type: string;
  minute?: number | null;
  added_time?: number | null;
  player?: string | null;
  is_home?: boolean;
  goal_type?: string | null;
};

export type Gol = { jogador: string; minuto: string; mandante: boolean; contra: boolean; penalti: boolean };

export type Partida = {
  id: number;
  liga_id: number | null;
  liga_nome: string;
  rodada: number | null;
  inicio: string;
  status: 'agendada' | 'ao_vivo' | 'encerrada' | 'adiada' | 'cancelada';
  periodo: '1T' | 'INT' | '2T' | 'PRO' | 'PEN' | null;
  minuto: number | null;
  mandante_id: number;
  mandante_nome: string;
  visitante_id: number;
  visitante_nome: string;
  gols_mandante: number | null;
  gols_visitante: number | null;
  gols: Gol[];
  temporada_id: number | null;
  fase: string | null;
  fase_nome: string | null;
  grupo: string | null;
  jogo_de_ida: number | null;
  penaltis_mandante: number | null;
  penaltis_visitante: number | null;
  atualizado_em: string;
};

export type PartidaSalva = Pick<
  Partida,
  'liga_nome' | 'gols_mandante' | 'gols_visitante' | 'gols' | 'temporada_id' | 'fase' | 'fase_nome' | 'grupo' | 'jogo_de_ida' | 'penaltis_mandante' | 'penaltis_visitante'
>;

export type LinhaDaTabelaBsd = {
  position: number;
  team_id: number;
  team_name?: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
  form?: string | null;
  zone?: { key?: string; label?: string; type?: string } | null;
};

export type FaseBsd = { stage: string; stage_name?: string | null; rounds?: number | null; start_date?: string | null; end_date?: string | null };

/** Resposta de /api/v2/leagues/{id}/standings/: tabela única ou grupos (conferências, chaves). */
export type ClassificacaoBsd = {
  standings?: LinhaDaTabelaBsd[] | null;
  groups?: Record<string, LinhaDaTabelaBsd[]> | null;
  season?: { id?: number; name?: string; start_date?: string | null; end_date?: string | null; stages?: FaseBsd[] | null } | null;
};

export type Fase = { fase: string; nome: string; rodadas: number | null; inicio: string | null; fim: string | null };

export type Competicao = {
  liga_id: number;
  nome: string;
  temporada_id: number | null;
  temporada: string | null;
  inicio: string | null;
  fim: string | null;
  formato: 'pontos_corridos' | 'mata_mata' | 'grupos_mata_mata';
  fases: Fase[];
  atualizado_em: string;
};

export type LinhaDaClassificacao = {
  liga_id: number;
  grupo: string;
  clube_id: number;
  clube_nome: string | null;
  posicao: number;
  pontos: number;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  gols_pro: number;
  gols_contra: number;
  forma: string | null;
  zona: string | null;
  zona_tipo: string | null;
  atualizado_em: string;
};

/** O pedaço da API REST da BSD que a sincronização usa (todas as páginas já juntas). */
export type Bsd = {
  aoVivo(): Promise<EventoBsd[]>;
  eventos(de: string, ate: string): Promise<EventoBsd[]>;
  evento(id: number): Promise<EventoBsd | null>;
  incidentes(id: number): Promise<IncidenteBsd[]>;
  nomeDaLiga(id: number): Promise<string | null>;
  classificacao(ligaId: number): Promise<ClassificacaoBsd>;
  /** Jogos de um time a partir de uma data (YYYY-MM-DD). */
  eventosDoTime(timeId: number, de: string): Promise<EventoBsd[]>;
};

export type Banco = {
  /** Nomes dos clubes e das ligas do catálogo, pelos ids da BSD. */
  catalogo(): Promise<{ clubes: Map<number, string>; ligas: Map<number, string> }>;
  partidas(ids: number[]): Promise<Map<number, PartidaSalva>>;
  idsAoVivo(): Promise<number[]>;
  /** Se há jogo ao vivo salvo ou jogo marcado com início entre `de` e `ate`. */
  haJogoNaJanela(de: Date, ate: Date): Promise<boolean>;
  salvar(partidas: Partida[]): Promise<void>;
  /** Ligas (do catálogo) com jogo encerrado ou em campo que começou a partir de `desde`. */
  ligasComJogoDesde(desde: Date): Promise<number[]>;
  /** Troca a classificação inteira da liga pela nova. */
  salvarClassificacao(ligaId: number, linhas: LinhaDaClassificacao[]): Promise<void>;
  salvarCompeticao(competicao: Competicao): Promise<void>;
  /** Clubes escolhidos por algum torcedor (com onboarding concluído). */
  clubesComTorcedores(): Promise<number[]>;
  /** Competições (fora amistosos) em que esses clubes jogaram ou vão jogar a partir de `desde`. */
  competicoesDosClubes(clubes: number[], desde: Date): Promise<number[]>;
};

export type Dependencias = {
  /** null quando a chave da BSD (BSD_API_KEY) não está configurada. */
  bsd: Bsd | null;
  banco: Banco;
  /** Segredo que o pg_cron manda no cabeçalho x-segredo. */
  segredo: string | undefined;
  agora?: () => Date;
};

/** Teto de pedidos de incidentes por rodada, para não estourar a cota diária da BSD num dia cheio. */
export const MAX_INCIDENTES = 20;

/** Janela ao vivo: a BSD lista o jogo 5 min antes do início; 3 h depois cobre prorrogação, pênaltis e atrasos. */
export const ANTES_DO_INICIO_MS = 5 * 60_000;
export const DEPOIS_DO_INICIO_MS = 3 * 60 * 60_000;

// Todos os status da BSD (enum do /api/v2/events/). "unresolved" e desconhecidos não são gravados.
const STATUS: Record<string, Partida['status']> = {
  notstarted: 'agendada',
  delayed: 'agendada',
  inprogress: 'ao_vivo',
  '1st_half': 'ao_vivo',
  halftime: 'ao_vivo',
  '2nd_half': 'ao_vivo',
  extratime: 'ao_vivo',
  penalties: 'ao_vivo',
  finished: 'encerrada',
  aet: 'encerrada',
  postponed: 'adiada',
  cancelled: 'cancelada',
};

/** Período a partir do period da BSD; na disputa de pênaltis, o status manda (o period fica em extra_time). */
export function periodoDe(period: string | null | undefined, status?: string): Partida['periodo'] {
  if (status === 'penalties') return 'PEN';
  const p = (period || status || '').toLowerCase();
  if (p === '1st_half') return '1T';
  if (p === 'halftime') return 'INT';
  if (p === '2nd_half') return '2T';
  if (p.includes('extra')) return 'PRO';
  if (p.includes('penalt')) return 'PEN';
  return null;
}

// ---------- Fases, grupos, zonas e formato das competições ----------

const FASES: Record<string, string> = {
  'regular-season': 'Temporada regular',
  'league-phase': 'Fase de liga',
  'group-stage': 'Fase de grupos',
  'round-of-128': '64 avos de final',
  'round-of-64': '32 avos de final',
  'round-of-32': '16 avos de final',
  'round-of-16': 'Oitavas de final',
  quarterfinals: 'Quartas de final',
  semifinals: 'Semifinal',
  final: 'Final',
  'third-place': 'Disputa de 3º lugar',
  playoffs: 'Playoffs',
  'knockout-round-playoffs': 'Playoffs',
};

/** Nome da fase em português; desconhecida fica com o nome da BSD. */
export function nomeDaFase(fase: string | null | undefined, nomeBsd?: string | null): string | null {
  if (!fase) return nomeBsd ?? null;
  if (FASES[fase]) return FASES[fase];
  const preliminar = /^qualification-round-(\d+)$/.exec(fase);
  if (preliminar) return `${preliminar[1]}ª fase preliminar`;
  const rodada = /^(\d+)(st|nd|rd|th)-round$/.exec(fase) ?? /^round-(\d+)$/.exec(fase);
  if (rodada) return `${rodada[1]}ª fase`;
  return nomeBsd ?? fase;
}

/** "Group F" → "Grupo F". */
export const nomeDoGrupo = (grupo: string | null | undefined) => (grupo ? grupo.replace(/^Group\b/i, 'Grupo') : null);

/** Fases de tabela (todos contra todos dentro da fase). */
export const ehFaseDeTabela = (fase: string) => /regular-season|league-phase|group/.test(fase);

/** Pontos corridos, mata-mata ou grupos + mata-mata, pelas fases da temporada. */
export function formatoDaCompeticao(fases: string[]): Competicao['formato'] {
  const tabela = fases.some(ehFaseDeTabela);
  const mataMata = fases.some((f) => !ehFaseDeTabela(f) && !/playoff/.test(f));
  if (tabela && mataMata) return 'grupos_mata_mata';
  if (mataMata) return 'mata_mata';
  return 'pontos_corridos';
}

const ZONAS: [RegExp, string][] = [
  [/^relegation/i, 'Rebaixamento'],
  [/^promotion/i, 'Acesso'],
  [/^playoffs?$/i, 'Classificação'],
  [/sudamericana/i, 'Sul-Americana'],
  [/libertadores/i, 'Libertadores'],
  [/champions league/i, 'Champions League'],
  [/europa league/i, 'Europa League'],
  [/conference league/i, 'Conference League'],
];

/** Zona da tabela em português, quando conhecida; senão o rótulo da BSD. */
export function nomeDaZona(rotulo: string | null | undefined): string | null {
  if (!rotulo) return null;
  return ZONAS.find(([padrao]) => padrao.test(rotulo))?.[1] ?? rotulo;
}

/** Amistosos não são competição: ficam fora da tela de Campeonatos e da classificação. */
export const ehAmistoso = (nome: string | null | undefined) => /friendl|amistos/i.test(nome ?? '');

/** Competição a partir da resposta de standings da BSD (season.stages). */
export function competicaoDe(ligaId: number, nome: string, bsd: ClassificacaoBsd, agora: Date): Competicao | null {
  const temporada = bsd.season;
  if (!temporada) return null;
  const fases = (temporada.stages ?? []).map((f) => ({
    fase: f.stage,
    nome: nomeDaFase(f.stage, f.stage_name) ?? f.stage,
    rodadas: f.rounds ?? null,
    inicio: f.start_date ?? null,
    fim: f.end_date ?? null,
  }));
  return {
    liga_id: ligaId,
    nome,
    temporada_id: temporada.id ?? null,
    temporada: temporada.name ?? null,
    inicio: temporada.start_date ?? null,
    fim: temporada.end_date ?? null,
    formato: formatoDaCompeticao(fases.map((f) => f.fase)),
    fases,
    atualizado_em: agora.toISOString(),
  };
}

/** Gols na ordem do jogo. Gol contra conta para o lado que o incidente indica (is_home), como no placar. */
export function golsDe(incidentes: IncidenteBsd[]): Gol[] {
  return incidentes
    .filter((i) => i.type === 'goal' && i.player && !(i.goal_type ?? '').toLowerCase().includes('miss'))
    .map((i) => ({
      jogador: i.player!,
      minuto: i.added_time ? `${i.minute}+${i.added_time}` : String(i.minute ?? ''),
      mandante: !!i.is_home,
      contra: i.goal_type === 'ownGoal',
      penalti: i.goal_type === 'penalty',
      ordem: (i.minute ?? 0) * 100 + (i.added_time ?? 0),
    }))
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ ordem: _ordem, ...gol }) => gol);
}

/** Linhas da tabela da BSD no formato da tabela classificacao. */
export function linhasDaClassificacao(ligaId: number, bsd: ClassificacaoBsd, agora: Date, nomes = new Map<number, string>()): LinhaDaClassificacao[] {
  const grupos: [string, LinhaDaTabelaBsd[]][] =
    bsd.groups && Object.keys(bsd.groups).length ? Object.entries(bsd.groups).map(([g, l]) => [nomeDoGrupo(g)!, l]) : [['', bsd.standings ?? []]];
  return grupos.flatMap(([grupo, linhas]) =>
    linhas.map((l) => ({
      liga_id: ligaId,
      grupo,
      clube_id: l.team_id,
      clube_nome: nomes.get(l.team_id) ?? l.team_name ?? null,
      posicao: l.position,
      pontos: l.pts,
      jogos: l.played,
      vitorias: l.won,
      empates: l.drawn,
      derrotas: l.lost,
      gols_pro: l.gf,
      gols_contra: l.ga,
      forma: l.form ?? null,
      zona: nomeDaZona(l.zone?.label),
      zona_tipo: l.zone?.type ?? null,
      atualizado_em: agora.toISOString(),
    })),
  );
}

/** Jogos que terminaram nas últimas 6 h mexeram na tabela da liga. */
const JANELA_DA_CLASSIFICACAO_MS = 6 * 60 * 60_000;

/** Quanto da temporada a tela de Campeonatos olha para trás (estaduais começam em janeiro, europeus em agosto). */
const DIAS_DA_TEMPORADA = 330;

async function sincronizarClassificacao(bsd: Bsd, banco: Banco, todas: boolean, agora: Date): Promise<Response> {
  const { ligas, clubes } = await banco.catalogo();
  let ids: number[];
  if (todas) {
    const copas = await banco.competicoesDosClubes(await banco.clubesComTorcedores(), somarDias(agora, -DIAS_DA_TEMPORADA));
    ids = [...new Set([...ligas.keys(), ...copas])];
  } else {
    ids = await banco.ligasComJogoDesde(new Date(agora.getTime() - JANELA_DA_CLASSIFICACAO_MS));
  }
  let linhas = 0;
  const falhas: number[] = [];
  for (const id of ids) {
    try {
      const tabela = await bsd.classificacao(id);
      const nome = ligas.get(id) ?? (await bsd.nomeDaLiga(id).catch(() => null)) ?? 'Competição';
      const competicao = competicaoDe(id, nome, tabela, agora);
      if (competicao) await banco.salvarCompeticao(competicao);
      const novas = linhasDaClassificacao(id, tabela, agora, clubes);
      // Liga sem tabela (fora de temporada, ou mata-mata puro) não apaga a última que temos.
      if (!novas.length) continue;
      await banco.salvarClassificacao(id, novas);
      linhas += novas.length;
    } catch {
      falhas.push(id);
    }
  }
  return json(200, { ok: true, modo: 'classificacao', ligas: ids.length, linhas, falhas });
}

const dia = (data: Date) => data.toISOString().slice(0, 10);
const somarDias = (data: Date, dias: number) => new Date(data.getTime() + dias * 86_400_000);
const limitar = (valor: unknown, padrao: number, maximo: number) =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 ? Math.min(valor, maximo) : padrao;

export async function sincronizar(req: Request, deps: Dependencias): Promise<Response> {
  if (req.method !== 'POST') return json(405, { erro: 'metodo_nao_permitido' });
  if (!deps.segredo) return json(500, { erro: 'sem_segredo_configurado' });
  if (req.headers.get('x-segredo') !== deps.segredo) return json(401, { erro: 'nao_autorizado' });
  const { bsd, banco } = deps;
  if (!bsd) return json(503, { erro: 'sem_chave_bsd' });

  const corpo = await lerCorpo(req);
  const agora = deps.agora?.() ?? new Date();
  if (corpo.modo === 'classificacao') return sincronizarClassificacao(bsd, banco, corpo.todas === true, agora);
  if (corpo.modo === 'temporada') return sincronizarTemporada(bsd, banco, agora);
  const modo = corpo.modo === 'agenda' ? 'agenda' : 'ao_vivo';

  let eventos: EventoBsd[];
  try {
    if (modo === 'agenda') {
      const de = dia(somarDias(agora, -limitar(corpo.dias_antes, 2, 60)));
      const ate = dia(somarDias(agora, limitar(corpo.dias_depois, 7, 30)));
      eventos = await bsd.eventos(de, ate);
    } else {
      const janela = await banco.haJogoNaJanela(new Date(agora.getTime() - DEPOIS_DO_INICIO_MS), new Date(agora.getTime() + ANTES_DO_INICIO_MS));
      if (!janela) return json(200, { ok: true, modo, salvas: 0, incidentes: 0, sem_jogo_na_janela: true });
      eventos = await bsd.aoVivo();
      // Quem estava ao vivo e saiu da lista terminou (ou foi interrompido): busca o estado final.
      const vistos = new Set(eventos.map((e) => e.id));
      for (const id of await banco.idsAoVivo()) {
        if (vistos.has(id)) continue;
        const evento = await bsd.evento(id);
        if (evento) eventos.push(evento);
      }
    }
  } catch {
    return json(502, { erro: 'falha_na_bsd' });
  }

  const { salvas, incidentes } = await salvarEventos(eventos, bsd, banco, agora);
  return json(200, { ok: true, modo, salvas, incidentes });
}

/** Modo "temporada": a temporada inteira dos clubes que têm torcedores. */
async function sincronizarTemporada(bsd: Bsd, banco: Banco, agora: Date): Promise<Response> {
  const clubes = await banco.clubesComTorcedores();
  const de = dia(somarDias(agora, -DIAS_DA_TEMPORADA));
  const porId = new Map<number, EventoBsd>();
  const falhas: number[] = [];
  for (const clube of clubes) {
    try {
      for (const e of await bsd.eventosDoTime(clube, de)) porId.set(e.id, e);
    } catch {
      falhas.push(clube);
    }
  }
  const { salvas, incidentes } = await salvarEventos([...porId.values()], bsd, banco, agora);
  return json(200, { ok: true, modo: 'temporada', clubes: clubes.length, salvas, incidentes, falhas });
}

/** Converte e grava os eventos dos clubes do catálogo; devolve quantos jogos e pedidos de gols. */
async function salvarEventos(eventos: EventoBsd[], bsd: Bsd, banco: Banco, agora: Date) {
  const { clubes, ligas } = await banco.catalogo();
  // Do mais recente para o mais antigo: com o teto de incidentes, os gols que aparecem no card vêm primeiro.
  const doCatalogo = eventos
    .filter((e) => Object.hasOwn(STATUS, e.status) && (clubes.has(e.home_team_id) || clubes.has(e.away_team_id)))
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
  const salvas = await banco.partidas(doCatalogo.map((e) => e.id));
  const nomesDeLiga = new Map(ligas);
  let incidentesPedidos = 0;
  const partidas: Partida[] = [];

  for (const e of doCatalogo) {
    const status = STATUS[e.status];
    const salva = salvas.get(e.id);

    let ligaNome = e.league_id != null ? nomesDeLiga.get(e.league_id) : undefined;
    ligaNome ??= e.league_name ?? salva?.liga_nome;
    if (!ligaNome && e.league_id != null) {
      ligaNome = (await bsd.nomeDaLiga(e.league_id).catch(() => null)) ?? undefined;
      if (ligaNome) nomesDeLiga.set(e.league_id, ligaNome);
    }

    // Os gols só são buscados de novo quando o placar mudou desde a última cópia.
    const totalDeGols = (e.home_score ?? 0) + (e.away_score ?? 0);
    let gols = salva?.gols ?? [];
    const placarMudou = !salva || salva.gols_mandante !== e.home_score || salva.gols_visitante !== e.away_score || gols.length !== totalDeGols;
    if ((status === 'ao_vivo' || status === 'encerrada') && totalDeGols > 0 && placarMudou && incidentesPedidos < MAX_INCIDENTES) {
      incidentesPedidos++;
      gols = await bsd.incidentes(e.id).then(golsDe, () => gols);
    }
    if (totalDeGols === 0) gols = [];

    partidas.push({
      id: e.id,
      liga_id: e.league_id,
      liga_nome: ligaNome ?? 'Futebol',
      rodada: e.round_number ?? null,
      inicio: e.event_date,
      status,
      periodo: status === 'ao_vivo' ? periodoDe(e.period, e.status) : null,
      minuto: status === 'ao_vivo' ? (e.current_minute ?? null) : null,
      mandante_id: e.home_team_id,
      mandante_nome: clubes.get(e.home_team_id) ?? e.home_team,
      visitante_id: e.away_team_id,
      visitante_nome: clubes.get(e.away_team_id) ?? e.away_team,
      gols_mandante: e.home_score,
      gols_visitante: e.away_score,
      gols,
      // A lista ao vivo não traz fase, grupo e temporada: mantém o que já estava salvo.
      temporada_id: e.season_id ?? salva?.temporada_id ?? null,
      fase: e.stage ?? salva?.fase ?? null,
      fase_nome: e.stage !== undefined ? nomeDaFase(e.stage, e.stage_name) : (salva?.fase_nome ?? null),
      grupo: e.group_name !== undefined ? nomeDoGrupo(e.group_name) : (salva?.grupo ?? null),
      jogo_de_ida: e.previous_leg_event_id !== undefined ? e.previous_leg_event_id : (salva?.jogo_de_ida ?? null),
      penaltis_mandante: e.penalty_shootout !== undefined ? (e.penalty_shootout?.home ?? null) : (salva?.penaltis_mandante ?? null),
      penaltis_visitante: e.penalty_shootout !== undefined ? (e.penalty_shootout?.away ?? null) : (salva?.penaltis_visitante ?? null),
      atualizado_em: agora.toISOString(),
    });
  }

  if (partidas.length) await banco.salvar(partidas);
  return { salvas: partidas.length, incidentes: incidentesPedidos };
}
