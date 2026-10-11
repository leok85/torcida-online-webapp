// Catálogo de futebol: tabelas paises, ligas e clubes do Supabase, alimentadas com os dados da BSD.
import type { Pais } from '../lib/database.types';
import { supabase } from '../lib/supabase';

export type { Pais };

export type Clube = {
  id: number;
  nome: string;
  nome_curto: string | null;
  pais: string;
  liga: { nome: string; divisao: number } | null;
};

/** Países com clubes no catálogo, na ordem de destaque e depois alfabética. */
export async function listarPaises(): Promise<Pais[]> {
  const { data, error } = await supabase.from('paises').select('codigo, nome, bandeira, ordem').order('ordem').order('nome');
  if (error) throw error;
  return data;
}

/** Clubes de um país, da primeira divisão para baixo e em ordem alfabética dentro de cada liga. */
export async function listarClubes(pais: string): Promise<Clube[]> {
  const { data, error } = await supabase
    .from('clubes')
    .select('id, nome, nome_curto, pais, liga:ligas(nome, divisao)')
    .eq('pais', pais)
    .order('nome');
  if (error) throw error;
  return [...data].sort((a, b) => (a.liga?.divisao ?? 99) - (b.liga?.divisao ?? 99) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
