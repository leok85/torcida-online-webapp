// Jogos dos clubes (tabela partidas, copiada da BSD pela Edge Function sincronizar-partidas).
import type { Gol, Partida } from '../lib/database.types';
import { supabase } from '../lib/supabase';

export type { Gol, Partida };

/** Todos os jogos salvos do clube, do mais antigo para o mais recente. */
export async function jogosDoClube(clubeId: number): Promise<Partida[]> {
  const { data, error } = await supabase
    .from('partidas')
    .select('*')
    .or(`mandante_id.eq.${clubeId},visitante_id.eq.${clubeId}`)
    .order('inicio', { ascending: true });
  if (error) throw error;
  return data as Partida[];
}

/** Janela em que um jogo marcado pode estar em campo: de 5 min antes do início até 3 h depois. */
const ANTES_DO_INICIO_MS = 5 * 60_000;
const DEPOIS_DO_INICIO_MS = 3 * 60 * 60_000;

/** Se vale consultar com frequência: há jogo ao vivo ou algum marcado dentro da janela, pelo horário. */
export function haJogoNaJanela(jogos: Partida[], agora = new Date()) {
  const t = agora.getTime();
  return jogos.some((p) => {
    if (p.status === 'ao_vivo') return true;
    if (p.status !== 'agendada') return false;
    const inicio = new Date(p.inicio).getTime();
    return inicio - ANTES_DO_INICIO_MS <= t && t <= inicio + DEPOIS_DO_INICIO_MS;
  });
}

/** O jogo ao vivo, o destaque do início (ao vivo ou último resultado), os próximos e os resultados (mais recente primeiro). */
export function separarJogos(jogos: Partida[]) {
  const aoVivo = jogos.find((p) => p.status === 'ao_vivo') ?? null;
  const resultados = jogos.filter((p) => p.status === 'encerrada').reverse();
  const proximos = jogos.filter((p) => p.status === 'agendada');
  return { aoVivo, destaque: aoVivo ?? resultados[0] ?? null, proximos, resultados };
}

/** V, E ou D do ponto de vista do clube. */
export function resultadoPara(p: Partida, clubeId: number): 'V' | 'E' | 'D' {
  const meus = p.mandante_id === clubeId ? p.gols_mandante : p.gols_visitante;
  const deles = p.mandante_id === clubeId ? p.gols_visitante : p.gols_mandante;
  if ((meus ?? 0) === (deles ?? 0)) return 'E';
  return (meus ?? 0) > (deles ?? 0) ? 'V' : 'D';
}

const PERIODOS: Record<string, string> = { '1T': '1º T', INT: 'INTERVALO', '2T': '2º T', PRO: 'PRORROGAÇÃO', PEN: 'PÊNALTIS' };

/** Selo do card: "AO VIVO · 2º T" ou "ENCERRADO · HÁ 3 H". */
export const seloDaPartida = (p: Partida, agora = new Date()) =>
  p.status === 'ao_vivo' ? (p.periodo ? `AO VIVO · ${PERIODOS[p.periodo]}` : 'AO VIVO') : `ENCERRADO · ${haQuanto(p.inicio, agora)}`;

const FUSO = 'America/Sao_Paulo';
const DIA_DA_SEMANA = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: FUSO });
const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO });
const DIA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: FUSO });
const MES = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: FUSO });

const semPonto = (texto: string) => texto.replace('.', '');

/** Dia e mês para a coluna de data das listas: { dia: '14', mes: 'OUT' }. */
export const diaEMes = (inicio: string) => ({ dia: DIA.format(new Date(inicio)), mes: semPonto(MES.format(new Date(inicio))).toUpperCase() });

/** "Brasileirão Série A · rodada 20 · dom 16:00": linha de um jogo marcado. */
export function infoDoProximo(p: Partida) {
  const data = new Date(p.inicio);
  const partes = [p.liga_nome];
  if (p.rodada) partes.push(`rodada ${p.rodada}`);
  partes.push(`${semPonto(DIA_DA_SEMANA.format(data))} ${HORA.format(data)}`);
  return partes.join(' · ');
}

/** "Brasileirão Série A · rodada 18": linha de um resultado. */
export const infoDoResultado = (p: Partida) => (p.rodada ? `${p.liga_nome} · rodada ${p.rodada}` : p.liga_nome);

/**
 * Quando abre o palpite de cada próximo jogo: só depois que o anterior termina. Com jogo em campo, o primeiro
 * "abre no apito final"; sem jogo, o primeiro está aberto; os seguintes abrem no dia depois do jogo anterior.
 */
export function aberturaDoPalpite(proximos: Partida[], indice: number, haJogoAoVivo: boolean) {
  if (indice === 0) return haJogoAoVivo ? 'abre no apito final' : 'palpite aberto';
  const diaSeguinte = new Date(new Date(proximos[indice - 1].inicio).getTime() + 86_400_000);
  return `abre ${semPonto(DIA_DA_SEMANA.format(diaSeguinte))}`;
}

/** "Brasileirão Série A · rodada 30 · 67'" ao vivo; sem o minuto depois do jogo (o selo já diz há quanto tempo). */
export function infoDaPartida(p: Partida) {
  const partes = [p.liga_nome];
  if (p.rodada) partes.push(`rodada ${p.rodada}`);
  if (p.status === 'ao_vivo' && p.minuto != null && p.periodo !== 'INT') partes.push(`${p.minuto}'`);
  return partes.join(' · ');
}

/** Gols agrupados por jogador, na ordem do jogo: ["A. Giay 45+1', 51' (pên.)", "M. Bidu 46' (contra)"]. */
export function autoresDosGols(gols: Gol[]) {
  const porJogador = new Map<string, string[]>();
  for (const g of gols) {
    const chave = `${g.jogador}|${g.contra ? 'contra' : ''}`;
    const minuto = `${g.minuto}'${g.penalti ? ' (pên.)' : ''}`;
    porJogador.set(chave, [...(porJogador.get(chave) ?? []), minuto]);
  }
  return [...porJogador]
    .map(([chave, minutos]) => {
      const [jogador, contra] = chave.split('|');
      return `${jogador} ${minutos.join(', ')}${contra ? ' (contra)' : ''}`;
    });
}

// ---------- Momentos do card do início (W01) ----------

export type Momento =
  | { tipo: 'ao_vivo'; jogo: Partida; proximo: Partida | null }
  | { tipo: 'encerrado'; jogo: Partida; proximo: Partida | null }
  | { tipo: 'vespera'; jogo: Partida; ultimo: Partida | null };

const DIA_ISO = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: FUSO });
/** Dias de calendário (em Brasília) de `de` até `ate`. */
const diasEntre = (de: Date, ate: Date) => (Date.parse(DIA_ISO.format(ate)) - Date.parse(DIA_ISO.format(de))) / 86_400_000;

/**
 * Qual momento o card mostra: o jogo ao vivo; senão o último resultado, até a véspera do próximo jogo; a partir
 * da véspera (dia anterior, em Brasília), o próximo jogo com a contagem regressiva.
 */
export function momentoDoInicio(jogos: Partida[], agora = new Date()): Momento | null {
  const { aoVivo, resultados } = separarJogos(jogos);
  // Um jogo marcado que já passou da janela sem virar ao vivo não é mais "próximo".
  const proximo = jogos.find((p) => p.status === 'agendada' && new Date(p.inicio).getTime() + DEPOIS_DO_INICIO_MS > agora.getTime()) ?? null;
  const ultimo = resultados[0] ?? null;
  if (aoVivo) return { tipo: 'ao_vivo', jogo: aoVivo, proximo };
  if (proximo && (!ultimo || diasEntre(agora, new Date(proximo.inicio)) <= 1)) return { tipo: 'vespera', jogo: proximo, ultimo };
  if (ultimo) return { tipo: 'encerrado', jogo: ultimo, proximo };
  return null;
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** "1d 02h", "05h 12min", "12 min" até o apito inicial; "em instantes" quando a hora já chegou. */
export function contagemRegressiva(inicio: string, agora = new Date()) {
  const minutos = Math.floor((new Date(inicio).getTime() - agora.getTime()) / 60_000);
  if (minutos <= 0) return 'em instantes';
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  if (dias > 0) return `${dias}d ${doisDigitos(horas)}h`;
  if (horas > 0) return `${doisDigitos(horas)}h ${doisDigitos(minutos % 60)}min`;
  return `${minutos} min`;
}

/** Duração típica de um jogo, para estimar o apito final a partir do início. */
const DURACAO_DO_JOGO_MS = 115 * 60_000;

/** "HÁ 3 H", "HÁ 2 D", "HÁ 40 MIN" desde o fim estimado do jogo. */
export function haQuanto(inicio: string, agora = new Date()) {
  const minutos = Math.max(0, Math.floor((agora.getTime() - new Date(inicio).getTime() - DURACAO_DO_JOGO_MS) / 60_000));
  if (minutos < 60) return minutos < 5 ? 'AGORA' : `HÁ ${minutos} MIN`;
  if (minutos < 1440) return `HÁ ${Math.floor(minutos / 60)} H`;
  return `HÁ ${Math.floor(minutos / 1440)} D`;
}

const DIA_MES = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO });

/** "Copa do Brasil · qua 14/10 21:30": linha do próximo jogo na véspera. */
export function infoDaVespera(p: Partida) {
  const data = new Date(p.inicio);
  const partes = [p.liga_nome];
  if (p.rodada) partes.push(`rodada ${p.rodada}`);
  partes.push(`${semPonto(DIA_DA_SEMANA.format(data))} ${DIA_MES.format(data)} ${HORA.format(data)}`);
  return partes.join(' · ');
}

// ---------- Filtros e temporada da tela Jogos (W20) ----------

/** Os campeonatos dos jogos do clube, do que tem mais jogos para o que tem menos, para o filtro. */
export function campeonatosDosJogos(jogos: Partida[]) {
  const contagem = new Map<string, number>();
  for (const p of jogos) contagem.set(p.liga_nome, (contagem.get(p.liga_nome) ?? 0) + 1);
  return [...contagem].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([nome]) => nome);
}

const ANO = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', timeZone: FUSO });
const NOME_DO_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: FUSO });

/** Ano da data em Brasília. */
export const anoDe = (data: Date) => Number(ANO.format(data));

export type JogoDaTemporada = {
  partida: Partida;
  /** "14" e "qua" */
  dia: string;
  semana: string;
  /** "AO VIVO", "V"/"E"/"D" ou "qua 21:30". */
  situacao: string;
  /** Primeiro jogo ainda não terminado: a linha "HOJE" vem antes dele. */
  hoje: boolean;
};

export type MesDaTemporada = { nome: string; jogos: JogoDaTemporada[] };

/**
 * A temporada do clube no ano de `agora`, mês a mês, com o resumo "N jogos · X disputados · VV EE DD".
 * Vem filtrada pelo campeonato (null = todos).
 */
export function temporadaDoClube(jogos: Partida[], clubeId: number, campeonato: string | null, agora = new Date()) {
  const ano = anoDe(agora);
  const doAno = jogos.filter((p) => anoDe(new Date(p.inicio)) === ano && (!campeonato || p.liga_nome === campeonato));
  const conta = { V: 0, E: 0, D: 0 };
  const meses: MesDaTemporada[] = [];
  let marcouHoje = false;
  for (const p of doAno) {
    const data = new Date(p.inicio);
    let situacao: string;
    if (p.status === 'encerrada') {
      const r = resultadoPara(p, clubeId);
      conta[r]++;
      situacao = r;
    } else situacao = p.status === 'ao_vivo' ? 'AO VIVO' : `${semPonto(DIA_DA_SEMANA.format(data))} ${HORA.format(data)}`;
    const hoje = p.status !== 'encerrada' && !marcouHoje;
    if (hoje) marcouHoje = true;
    const mes = NOME_DO_MES.format(data);
    const nome = mes.charAt(0).toUpperCase() + mes.slice(1);
    if (meses.at(-1)?.nome !== nome) meses.push({ nome, jogos: [] });
    meses.at(-1)!.jogos.push({ partida: p, dia: DIA.format(data), semana: semPonto(DIA_DA_SEMANA.format(data)), situacao, hoje });
  }
  const disputados = conta.V + conta.E + conta.D;
  const resumo = `${doAno.length} ${doAno.length === 1 ? 'jogo' : 'jogos'} · ${disputados} disputados · ${conta.V}V ${conta.E}E ${conta.D}D`;
  return { ano, meses, resumo };
}
