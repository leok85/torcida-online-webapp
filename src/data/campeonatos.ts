// Tela de Campeonatos (W10): em quais competições o clube está na temporada e a situação em cada uma.
// Os jogos vêm do JogosDoClubeProvider; formato, fases e tabelas das tabelas competicoes e classificacao.
import type { ClassificacaoRow, CompeticaoRow, Partida } from '../lib/database.types';
import { supabase } from '../lib/supabase';

export type FaseDaCompeticao = { fase: string; nome: string; rodadas: number | null; inicio: string | null; fim: string | null };
export type Competicao = Omit<CompeticaoRow, 'fases'> & { fases: FaseDaCompeticao[] };
export type LinhaDaTabela = ClassificacaoRow;

/** Formato, fases e tabelas das competições dos jogos do clube. */
export async function dadosDosCampeonatos(ligaIds: number[]): Promise<{ competicoes: Competicao[]; tabelas: LinhaDaTabela[] }> {
  if (!ligaIds.length) return { competicoes: [], tabelas: [] };
  const [competicoes, tabelas] = await Promise.all([
    supabase.from('competicoes').select('*').in('liga_id', ligaIds),
    supabase.from('classificacao').select('*').in('liga_id', ligaIds).order('grupo').order('posicao'),
  ]);
  if (competicoes.error) throw competicoes.error;
  if (tabelas.error) throw tabelas.error;
  return { competicoes: competicoes.data as Competicao[], tabelas: tabelas.data };
}

/** Amistosos não são competição. */
export const ehAmistoso = (nome: string | null | undefined) => /friendl|amistos/i.test(nome ?? '');

export const ehFaseDeTabela = (fase: string | null | undefined) => /regular-season|league-phase|group/.test(fase ?? '');

// ---------- Ordem e nomes curtos das fases ----------

const ORDEM_FIXA: Record<string, number> = {
  'group-stage': 300,
  'league-phase': 300,
  'regular-season': 300,
  playoffs: 350,
  'knockout-round-playoffs': 350,
  'round-of-128': 400,
  'round-of-64': 410,
  'round-of-32': 420,
  'round-of-16': 430,
  quarterfinals: 440,
  semifinals: 450,
  'third-place': 455,
  final: 460,
};

/** Posição da fase na temporada: preliminares, fases numeradas, grupos, mata-mata e final. */
export function ordemDaFase(fase: string): number {
  if (ORDEM_FIXA[fase] !== undefined) return ORDEM_FIXA[fase];
  const preliminar = /^qualification-round-(\d+)$/.exec(fase);
  if (preliminar) return 100 + Number(preliminar[1]);
  const numerada = /^round-(\d+)$/.exec(fase) ?? /^(\d+)(st|nd|rd|th)-round$/.exec(fase);
  if (numerada) return 200 + Number(numerada[1]);
  return 390;
}

const CURTOS: Record<string, string> = {
  'round-of-128': '64 avos',
  'round-of-64': '32 avos',
  'round-of-32': '16 avos',
  'round-of-16': 'Oitavas',
  quarterfinals: 'Quartas',
  semifinals: 'Semifinal',
  final: 'Final',
  'third-place': '3º lugar',
  'group-stage': 'Fase de grupos',
  'league-phase': 'Fase de liga',
};

/** "Quartas", "Semifinal", "5ª fase": nome curto para o card. */
export const nomeCurtoDaFase = (fase: string, nome: string) => CURTOS[fase] ?? nome;

/** "nas quartas", "na semifinal", "na 5ª fase". */
const naFase = (fase: string, nome: string) => {
  const curto = nomeCurtoDaFase(fase, nome);
  return `${/s$/.test(curto) && curto !== '3º lugar' ? 'nas' : 'na'} ${curto.toLowerCase()}`;
};

/** Mata-mata que costuma vir depois de cada fase, para mostrar o caminho até a final antes do sorteio. */
const SEGUINTE: Record<string, string> = {
  'round-of-32': 'round-of-16',
  'round-of-16': 'quarterfinals',
  quarterfinals: 'semifinals',
  semifinals: 'final',
};
const NOMES_DO_MATA_MATA: Record<string, string> = {
  'round-of-16': 'Oitavas de final',
  quarterfinals: 'Quartas de final',
  semifinals: 'Semifinal',
  final: 'Final',
};

// ---------- Formatos de data ----------

const FUSO = 'America/Sao_Paulo';
const fmt = (opcoes: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { ...opcoes, timeZone: FUSO });
const SEMANA = fmt({ weekday: 'short' });
const DIA_MES = fmt({ day: '2-digit', month: '2-digit' });
const HORA = fmt({ hour: '2-digit', minute: '2-digit' });
const MES = fmt({ month: 'short' });
const ANO = fmt({ year: 'numeric' });
const semPonto = (t: string) => t.replace('.', '');

/** "dom 16:00". */
export const diaEHora = (inicio: string) => `${semPonto(SEMANA.format(new Date(inicio)))} ${HORA.format(new Date(inicio))}`;
/** "qua 14/10 21:30". */
export const dataCompleta = (inicio: string) =>
  `${semPonto(SEMANA.format(new Date(inicio)))} ${DIA_MES.format(new Date(inicio))} ${HORA.format(new Date(inicio))}`;
/** "dom 18/10". */
export const diaCurto = (inicio: string) => `${semPonto(SEMANA.format(new Date(inicio)))} ${DIA_MES.format(new Date(inicio))}`;
const mesEAno = (inicio: string) => `${semPonto(MES.format(new Date(inicio)))} ${ANO.format(new Date(inicio))}`;

// ---------- Montagem ----------

export type EtapaDoCaminho = {
  fase: string;
  nome: string;
  estado: 'concluida' | 'atual' | 'futura';
  jogos: Partida[];
  /** Na fase de grupos, a tabela do grupo do clube. */
  tabela: LinhaDaTabela[];
  /** Mata-mata decidido: o clube passou ('V') ou caiu ('D'). */
  resultado: 'V' | 'D' | null;
};

export type Campeonato = {
  ligaId: number;
  nome: string;
  formato: Competicao['formato'];
  rotuloFormato: string;
  encerrado: boolean;
  /** "3º", "Quartas", "Grupo F", "Campeão", "Eliminado". */
  destaque: string;
  /** "38 pts · rodada 19", "vs Fluminense", "2º · 11 pts", "nas quartas". */
  complemento: string;
  /** Linha de baixo do card: próximo jogo ou como terminou. */
  rodape: string | null;
  campeao: boolean;
  /** Pontos corridos: a tabela inteira; grupos: a tabela do grupo do clube. */
  tabela: LinhaDaTabela[];
  rodada: number | null;
  /** Pontos corridos: total de rodadas da temporada ("rodada 30 de 38"). */
  rodadas: number | null;
  proximos: Partida[];
  /** Últimos 5 jogos encerrados na competição, do mais recente para o mais antigo. */
  resultados: Partida[];
  caminho: EtapaDoCaminho[];
  /** Fase em disputa (mata-mata e grupos); o próximo jogo dela abre o palpite. */
  faseAtual: EtapaDoCaminho | null;
  proximo: Partida | null;
};

const adversario = (p: Partida, clubeId: number) => (p.mandante_id === clubeId ? p.visitante_nome : p.mandante_nome);
const confronto = (p: Partida) => `${p.mandante_nome} x ${p.visitante_nome}`;

/** Quem passou num mata-mata (ida e volta somadas; empate decidido nos pênaltis do último jogo). null se não acabou. */
export function resultadoDoConfronto(jogos: Partida[], clubeId: number): 'V' | 'D' | null {
  if (!jogos.length || jogos.some((p) => p.status !== 'encerrada')) return null;
  let pro = 0;
  let contra = 0;
  for (const p of jogos) {
    const emCasa = p.mandante_id === clubeId;
    pro += (emCasa ? p.gols_mandante : p.gols_visitante) ?? 0;
    contra += (emCasa ? p.gols_visitante : p.gols_mandante) ?? 0;
  }
  if (pro !== contra) return pro > contra ? 'V' : 'D';
  const ultimo = jogos[jogos.length - 1];
  if (ultimo.penaltis_mandante == null || ultimo.penaltis_visitante == null) return null;
  const emCasa = ultimo.mandante_id === clubeId;
  const meus = emCasa ? ultimo.penaltis_mandante : ultimo.penaltis_visitante;
  const deles = emCasa ? ultimo.penaltis_visitante : ultimo.penaltis_mandante;
  return meus > deles ? 'V' : 'D';
}

/** "Ida", "Volta" ou "Jogo único" dentro da fase de mata-mata. */
function perna(p: Partida, jogosDaFase: Partida[]) {
  if (p.jogo_de_ida) return 'Volta';
  return jogosDaFase.length > 1 ? 'Ida' : 'Jogo único';
}

function montarCampeonato(
  competicao: Competicao,
  jogosDaTemporada: Partida[],
  tabelas: LinhaDaTabela[],
  clubeId: number,
  agora: Date,
): Campeonato {
  const jogos = [...jogosDaTemporada].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const proximo = jogos.find((p) => p.status === 'agendada' || p.status === 'ao_vivo') ?? null;
  const encerradas = jogos.filter((p) => p.status === 'encerrada');
  const resultados = encerradas.slice(-5).reverse();
  const tabelaDaLiga = tabelas.filter((l) => l.liga_id === competicao.liga_id);
  const minhaLinha = (grupo?: string | null) =>
    tabelaDaLiga.find((l) => l.clube_id === clubeId && (grupo === undefined || l.grupo === (grupo ?? '')));
  const fimDaTemporada = competicao.fim ? new Date(`${competicao.fim}T23:59:59-03:00`) : null;

  if (competicao.formato === 'pontos_corridos') {
    const linha = minhaLinha('') ?? minhaLinha();
    const encerrado = !proximo && !!fimDaTemporada && fimDaTemporada < agora;
    const fase = competicao.fases.find((f) => f.fase === 'regular-season');
    const rodadas = fase?.rodadas ?? null;
    return {
      ligaId: competicao.liga_id,
      nome: competicao.nome,
      formato: competicao.formato,
      rotuloFormato: encerrado && encerradas.length
        ? `encerrado · ${mesEAno(encerradas[encerradas.length - 1].inicio)}`
        : rodadas && rodadas > 1 ? `pontos corridos · ${rodadas} rodadas` : 'pontos corridos',
      encerrado,
      destaque: linha ? `${linha.posicao}º` : '—',
      complemento: linha ? `${linha.pontos} pts · rodada ${linha.jogos}` : 'sem tabela ainda',
      rodape: proximo ? `${confronto(proximo)} · ${diaEHora(proximo.inicio)}` : linha && encerrado ? `Terminou em ${linha.posicao}º` : null,
      campeao: encerrado && linha?.posicao === 1,
      tabela: tabelaDaLiga.filter((l) => l.grupo === (linha?.grupo ?? '')),
      rodada: linha?.jogos ?? null,
      rodadas,
      proximos: jogos.filter((p) => p.status === 'agendada').slice(0, 3),
      resultados,
      caminho: [],
      faseAtual: null,
      proximo,
    };
  }

  // Mata-mata e grupos: fases da temporada (da BSD e dos jogos), a partir da primeira que o clube disputou.
  const fases = new Map<string, string>();
  for (const f of competicao.fases) fases.set(f.fase, f.nome);
  for (const p of jogos) if (p.fase && !fases.has(p.fase)) fases.set(p.fase, p.fase_nome ?? p.fase);
  let ordenadas = [...fases.keys()].filter((f) => f !== 'third-place').sort((a, b) => ordemDaFase(a) - ordemDaFase(b));
  // Antes do sorteio, a BSD ainda não lista as fases seguintes: completa o caminho até a final.
  for (let ultima = ordenadas[ordenadas.length - 1]; ultima && SEGUINTE[ultima] && !fases.has(SEGUINTE[ultima]); ultima = SEGUINTE[ultima]) {
    fases.set(SEGUINTE[ultima], NOMES_DO_MATA_MATA[SEGUINTE[ultima]]);
    ordenadas.push(SEGUINTE[ultima]);
  }
  const jogadas = jogos.map((p) => p.fase).filter((f): f is string => !!f);
  const primeira = jogadas.length ? Math.min(...jogadas.map(ordemDaFase)) : -Infinity;
  ordenadas = ordenadas.filter((f) => ordemDaFase(f) >= primeira);

  const faseCorrente = proximo?.fase ?? encerradas[encerradas.length - 1]?.fase ?? ordenadas[0] ?? null;
  const ordemCorrente = faseCorrente ? ordemDaFase(faseCorrente) : -Infinity;

  let caminho: EtapaDoCaminho[] = ordenadas.map((fase) => {
    const jogosDaFase = jogos.filter((p) => p.fase === fase);
    const grupo = jogosDaFase.find((p) => p.grupo)?.grupo ?? null;
    const tabela = ehFaseDeTabela(fase) ? tabelaDaLiga.filter((l) => (grupo ? l.grupo === grupo : true)) : [];
    const ordem = ordemDaFase(fase);
    return {
      fase,
      nome: fases.get(fase)!,
      estado: ordem < ordemCorrente ? 'concluida' : ordem === ordemCorrente ? 'atual' : 'futura',
      jogos: jogosDaFase,
      tabela,
      resultado: ehFaseDeTabela(fase) ? null : resultadoDoConfronto(jogosDaFase, clubeId),
    };
  });

  const atual = caminho.find((e) => e.estado === 'atual') ?? null;
  const caiu = !proximo && atual?.resultado === 'D';
  const venceuAFinal = atual?.fase === 'final' && atual.resultado === 'V';
  const encerrado = caiu || venceuAFinal || (!proximo && !!fimDaTemporada && fimDaTemporada < agora);
  if (encerrado) {
    // Depois de cair (ou do título), as fases seguintes não fazem parte do caminho do clube.
    caminho = caminho.filter((e) => e.estado !== 'futura').map((e) => ({ ...e, estado: 'concluida' as const }));
  }

  let destaque = '—';
  let complemento = '';
  let rodape: string | null = null;
  const ultimoJogo = atual?.jogos[atual.jogos.length - 1] ?? encerradas[encerradas.length - 1];

  if (venceuAFinal) {
    destaque = 'Campeão';
    complemento = ANO.format(new Date(ultimoJogo!.inicio));
    rodape = `Final contra o ${adversario(ultimoJogo!, clubeId)}`;
  } else if (caiu && atual) {
    destaque = atual.fase === 'final' ? 'Vice' : 'Eliminado';
    complemento = atual.fase === 'final' ? ANO.format(new Date(ultimoJogo!.inicio)) : naFase(atual.fase, atual.nome);
    rodape = `${atual.fase === 'final' ? 'Final contra o' : 'Eliminado pelo'} ${adversario(ultimoJogo!, clubeId)}`;
  } else if (atual && ehFaseDeTabela(atual.fase)) {
    const grupo = atual.jogos.find((p) => p.grupo)?.grupo ?? null;
    const linha = minhaLinha(grupo ?? undefined);
    destaque = grupo ?? nomeCurtoDaFase(atual.fase, atual.nome);
    complemento = linha ? `${linha.posicao}º · ${linha.pontos} pts` : '';
    rodape = proximo ? `${confronto(proximo)} · ${dataCompleta(proximo.inicio)}` : null;
  } else if (atual) {
    destaque = nomeCurtoDaFase(atual.fase, atual.nome);
    const referencia = proximo ?? ultimoJogo;
    complemento = referencia ? `vs ${adversario(referencia, clubeId)}` : 'aguardando sorteio';
    rodape = proximo ? `${perna(proximo, atual.jogos)} · ${dataCompleta(proximo.inicio)} · ${proximo.mandante_id === clubeId ? 'em casa' : 'fora'}` : null;
  }

  const idaEVolta = jogos.some((p) => p.jogo_de_ida);
  return {
    ligaId: competicao.liga_id,
    nome: competicao.nome,
    formato: competicao.formato,
    rotuloFormato: encerrado && ultimoJogo
      ? `encerrado · ${mesEAno(ultimoJogo.inicio)}`
      : competicao.formato === 'grupos_mata_mata' ? 'grupos + mata-mata' : idaEVolta ? 'mata-mata · ida e volta' : 'mata-mata',
    encerrado,
    destaque,
    complemento,
    rodape,
    campeao: venceuAFinal,
    tabela: atual?.tabela ?? [],
    rodada: null,
    rodadas: null,
    proximos: jogos.filter((p) => p.status === 'agendada').slice(0, 3),
    resultados,
    caminho,
    faseAtual: encerrado ? null : atual,
    proximo,
  };
}

/**
 * Competições do clube na temporada: a liga principal primeiro, depois as que ainda estão em disputa (pelo próximo
 * jogo) e por fim as encerradas. Jogos de outra temporada e amistosos ficam de fora.
 */
export function montarCampeonatos(
  jogos: Partida[],
  competicoes: Competicao[],
  tabelas: LinhaDaTabela[],
  clubeId: number,
  ligaPrincipal: number | null,
  agora = new Date(),
): Campeonato[] {
  const campeonatos = competicoes
    .map((c) => {
      const daTemporada = jogos.filter(
        (p) => p.liga_id === c.liga_id && !ehAmistoso(p.liga_nome) && (!c.temporada_id || !p.temporada_id || p.temporada_id === c.temporada_id),
      );
      if (!daTemporada.length && c.liga_id !== ligaPrincipal) return null;
      return montarCampeonato(c, daTemporada, tabelas, clubeId, agora);
    })
    .filter((c): c is Campeonato => !!c);
  const peso = (c: Campeonato) => (c.ligaId === ligaPrincipal ? 0 : c.encerrado ? 2 : 1);
  return campeonatos.sort((a, b) => peso(a) - peso(b) || (a.proximo?.inicio ?? '9').localeCompare(b.proximo?.inicio ?? '9'));
}

// ---------- tabela completa (W10) ----------

/** Quantas linhas a tabela da liga mostra no card; o resto fica em "Ver tabela completa". */
export const LINHAS_DO_RESUMO = 8;

/**
 * As linhas em volta do clube: ele e os vizinhos de cima e de baixo, para quem briga contra a queda ver o fim da tabela.
 * A janela encosta no topo ou no fim; sem o clube na tabela, as primeiras posições.
 */
export function resumoDaTabela(linhas: LinhaDaTabela[], clubeId: number, limite = LINHAS_DO_RESUMO): LinhaDaTabela[] {
  const indice = linhas.findIndex((l) => l.clube_id === clubeId);
  if (indice < 0) return linhas.slice(0, limite);
  const inicio = Math.max(0, Math.min(indice - Math.floor((limite - 1) / 2), linhas.length - limite));
  return linhas.slice(inicio, inicio + limite);
}

/** Últimos 5 da tabela: a forma da BSD (W, D, L) em V, E, D. */
export const formaDaLinha = (forma: string | null): ('V' | 'E' | 'D')[] =>
  [...(forma ?? '')].map((r) => ({ W: 'V', D: 'E', L: 'D' })[r.toUpperCase()] as 'V' | 'E' | 'D' | undefined).filter((r): r is 'V' | 'E' | 'D' => !!r);

/** Aproveitamento: pontos sobre os pontos possíveis, em %. */
export const aproveitamento = (l: Pick<LinhaDaTabela, 'pontos' | 'jogos'>) => (l.jogos ? Math.round((l.pontos / (l.jogos * 3)) * 100) : 0);

/** "atualizada ter 13/10 às 06:40": quando a classificação foi gravada pela última vez. */
export function atualizacaoDaTabela(linhas: LinhaDaTabela[]) {
  const ultima = linhas.map((l) => l.atualizado_em).sort().at(-1);
  if (!ultima) return null;
  return `atualizada ${diaCurto(ultima)} às ${HORA.format(new Date(ultima))}`;
}
