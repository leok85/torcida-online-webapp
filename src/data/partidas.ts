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

/** Selo do card: "AO VIVO · 2º T" ou "ENCERRADO". */
export const seloDaPartida = (p: Partida) =>
  p.status === 'ao_vivo' ? (p.periodo ? `AO VIVO · ${PERIODOS[p.periodo]}` : 'AO VIVO') : 'ENCERRADO';

const FUSO = 'America/Sao_Paulo';
const DATA = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: FUSO });
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

/** "Brasileirão Série A · rodada 30 · 67'" ao vivo; com a data ("sáb., 11/10") depois do jogo. */
export function infoDaPartida(p: Partida) {
  const partes = [p.liga_nome];
  if (p.rodada) partes.push(`rodada ${p.rodada}`);
  if (p.status === 'ao_vivo') {
    if (p.minuto != null && p.periodo !== 'INT') partes.push(`${p.minuto}'`);
  } else {
    partes.push(DATA.format(new Date(p.inicio)));
  }
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
