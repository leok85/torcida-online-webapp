// Jogos dos clubes (tabela partidas, copiada da BSD pela Edge Function sincronizar-partidas).
import type { Gol, Partida } from '../lib/database.types';
import { supabase } from '../lib/supabase';

export type { Gol, Partida };

/** O jogo do clube em andamento ou, se não houver, o último que terminou. */
export async function partidaEmDestaque(clubeId: number): Promise<Partida | null> {
  const { data, error } = await supabase
    .from('partidas')
    .select('*')
    .or(`mandante_id.eq.${clubeId},visitante_id.eq.${clubeId}`)
    .in('status', ['ao_vivo', 'encerrada'])
    .order('inicio', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Partida | null;
}

const PERIODOS: Record<string, string> = { '1T': '1º T', INT: 'INTERVALO', '2T': '2º T', PRO: 'PRORROGAÇÃO', PEN: 'PÊNALTIS' };

/** Selo do card: "AO VIVO · 2º T" ou "ENCERRADO". */
export const seloDaPartida = (p: Partida) =>
  p.status === 'ao_vivo' ? (p.periodo ? `AO VIVO · ${PERIODOS[p.periodo]}` : 'AO VIVO') : 'ENCERRADO';

const DATA = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

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
