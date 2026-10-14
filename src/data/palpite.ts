// Escalação ideal e palpite (W03). As regras ficam no banco (situacao_do_palpite, enviar_palpite); aqui, o que a
// tela precisa para mostrar e o mesmo cálculo da janela, para não oferecer o que o banco vai recusar.
import { chamarFuncao } from '../assinatura/funcoes';
import { supabase } from '../lib/supabase';
import type { Elencos, JogadorDoElenco, MaisVotada, Palpite, PlacarDaTorcida } from './tiposDoPalpite';

export type { Autor, Elencos, JogadorDoElenco, MaisVotada, Palpite, PlacarDaTorcida } from './tiposDoPalpite';
export { FECHA_ANTES_MS, jogoDoPalpite, situacaoDoPalpite, type SituacaoDoPalpite } from './janelaDoPalpite';

export async function buscarElencos(partida: number): Promise<Elencos | null> {
  const r = await chamarFuncao<Elencos>('elenco-da-partida', { partida });
  return r.ok ? r.dados : null;
}

/** O meu palpite do jogo; null quando não mandei; undefined quando não deu para buscar. */
export async function buscarMeuPalpite(partida: number): Promise<Palpite | null | undefined> {
  const { data, error } = await supabase.rpc('meu_palpite', { p_partida: partida });
  if (error) return undefined;
  return ((data ?? []) as Palpite[])[0] ?? null;
}

export type ErroDoPalpite =
  | 'palpite_fechado'
  | 'palpite_nao_abriu'
  | 'so_membros'
  | 'outro_clube'
  | 'escalacao_invalida'
  | 'jogador_lesionado'
  | 'autor_invalido'
  | 'falha';

export const MENSAGEM_DO_PALPITE: Record<ErroDoPalpite, string> = {
  palpite_fechado: 'O palpite deste jogo já fechou.',
  palpite_nao_abriu: 'O palpite abre quando o jogo anterior terminar.',
  so_membros: 'Escalação e palpite são para membros.',
  outro_clube: 'O palpite é da torcida dos times em campo.',
  escalacao_invalida: 'Algum jogador saiu do elenco. Recarregue a página e confira a escalação.',
  jogador_lesionado: 'Um jogador da sua escalação se lesionou. Troque ele e confirme de novo.',
  autor_invalido: 'Confira quem marca: um dos jogadores não está no elenco ou se lesionou.',
  falha: 'Não deu para enviar agora. Tente de novo.',
};

export async function enviarPalpite(partida: number, p: Palpite): Promise<{ ok: true } | { ok: false; erro: ErroDoPalpite }> {
  const { error } = await supabase.rpc('enviar_palpite', {
    p_partida: partida,
    p_formacao: p.formacao,
    p_escalacao: p.escalacao,
    p_gols_mandante: p.gols_mandante,
    p_gols_visitante: p.gols_visitante,
    p_autores: p.autores,
  });
  if (!error) return { ok: true };
  const hint = (error as { hint?: string }).hint;
  return { ok: false, erro: hint && hint in MENSAGEM_DO_PALPITE ? (hint as ErroDoPalpite) : 'falha' };
}

/** Lesionado não pode ser escalado nem marcar no palpite. */
export const lesionado = (j: Pick<JogadorDoElenco, 'disponibilidade'>) => j.disponibilidade === 'injured';

/** A escalação mais votada pela torcida do meu clube; null quando não deu para buscar. */
export async function buscarMaisVotada(partida: number): Promise<MaisVotada | null> {
  const { data, error } = await supabase.rpc('escalacao_mais_votada', { p_partida: partida });
  if (error) return null;
  return ((data ?? []) as MaisVotada[])[0] ?? { votantes: 0, formacao: null, jogadores: [] };
}

/** Os placares mais palpitados pela torcida do meu clube (vazio sem palpites suficientes); null quando não deu. */
export async function buscarPalpitesDaTorcida(partida: number): Promise<PlacarDaTorcida[] | null> {
  const { data, error } = await supabase.rpc('palpites_da_torcida', { p_partida: partida });
  return error ? null : ((data ?? []) as PlacarDaTorcida[]);
}

/** Se pedi aviso quando o palpite do jogo abrir. */
export async function temLembrete(partida: number): Promise<boolean> {
  const { data } = await supabase.from('lembretes_palpite').select('partida_id').eq('partida_id', partida);
  return !!data?.length;
}

/** Pede (ou cancela) o aviso de quando o palpite do jogo abrir. */
export async function lembrarPalpite(partida: number, lembrar: boolean): Promise<boolean> {
  const { error } = lembrar
    ? await supabase.from('lembretes_palpite').insert({ partida_id: partida })
    : await supabase.from('lembretes_palpite').delete().eq('partida_id', partida);
  return !error;
}

const POSICAO = { G: 'goleiro', D: 'defensor', M: 'meia', F: 'atacante' } as const;
const FORA = { injured: 'lesionado', suspended: 'suspenso', doubtful: 'dúvida' } as const;

/** "defensor", "atacante · lesionado · volta 31/10". */
export function descricaoDoJogador(j: { posicao: keyof typeof POSICAO | null; disponibilidade: string; volta?: string | null }) {
  const fora = FORA[j.disponibilidade as keyof typeof FORA];
  const volta = fora && j.volta && /^\d{4}-\d{2}-\d{2}/.test(j.volta) ? `volta ${j.volta.slice(8, 10)}/${j.volta.slice(5, 7)}` : null;
  return [j.posicao ? POSICAO[j.posicao] : null, fora, volta].filter(Boolean).join(' · ');
}
