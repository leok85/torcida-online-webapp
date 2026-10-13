// Janela do palpite (W03), sem dependências: a tela, os falsos do Supabase e o e2e usam a mesma regra de
// situacao_do_palpite() da migration.
import type { Partida } from '../lib/database.types';

/** O palpite fecha 15 min antes do início. */
export const FECHA_ANTES_MS = 15 * 60_000;
/** Um jogo marcado que passou 3 h do horário sem virar ao vivo não segura o próximo. */
const JOGO_PARADO_MS = 3 * 60 * 60_000;

export type SituacaoDoPalpite = 'aberto' | 'nao_abriu' | 'fechado';

/** Abre quando o jogo anterior do clube termina e fecha 15 min antes do início. */
export function situacaoDoPalpite(partida: Partida, jogosDoClube: Partida[], agora = new Date()): SituacaoDoPalpite {
  const t = agora.getTime();
  const inicio = new Date(partida.inicio).getTime();
  if (partida.status !== 'agendada' || t >= inicio - FECHA_ANTES_MS) return 'fechado';
  const anteriorEmAberto = jogosDoClube.some((a) => {
    if (a.id === partida.id || new Date(a.inicio).getTime() >= inicio) return false;
    return a.status === 'ao_vivo' || (a.status === 'agendada' && new Date(a.inicio).getTime() + JOGO_PARADO_MS > t);
  });
  return anteriorEmAberto ? 'nao_abriu' : 'aberto';
}

/** O jogo do clube cujo palpite está na vez: o próximo marcado que não passou da janela. */
export function jogoDoPalpite(jogos: Partida[], agora = new Date()) {
  return jogos.find((p) => p.status === 'agendada' && new Date(p.inicio).getTime() + JOGO_PARADO_MS > agora.getTime()) ?? null;
}
