import type { Database } from '../lib/database.types';
import { supabase } from '../lib/supabase';

export type LinhaDaTorcida = Database['public']['Functions']['maiores_torcidas']['Returns'][number];
export type EscopoDaTorcida = LinhaDaTorcida['escopo'];

/** Maiores torcidas do app, no mundo e no país do meu clube; o meu clube vem junto mesmo fora do top. */
export async function buscarMaioresTorcidas(limite = 6): Promise<LinhaDaTorcida[]> {
  const { data, error } = await supabase.rpc('maiores_torcidas', { p_limite: limite });
  if (error) throw error;
  return data ?? [];
}

const COMPACTO = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/** "1.234" até 10 mil; depois "48,2 mil", "1,2 mi" (com espaço não separável, para não quebrar a linha). */
export const torcidaEmTexto = (n: number) => (n < 10_000 ? n.toLocaleString('pt-BR') : COMPACTO.format(n));
