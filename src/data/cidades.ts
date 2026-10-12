// Cidades do catálogo (tabela cidades: por enquanto os municípios do Brasil, do IBGE).
import { supabase } from '../lib/supabase';

export type Cidade = { id: number; nome: string; regiao: string | null };

/** Países com cidades no catálogo; nos outros, a cidade é texto livre. */
export const PAISES_COM_CIDADES = ['BR'];

export const rotuloCidade = (c: Pick<Cidade, 'nome' | 'regiao'>) => (c.regiao ? `${c.nome}, ${c.regiao}` : c.nome);

/** Até 8 cidades do país que contêm o termo (sem diferenciar acentos), começando por quem começa com ele. */
export async function buscarCidades(termo: string, pais = 'BR'): Promise<Cidade[]> {
  const { data, error } = await supabase.rpc('buscar_cidades', { termo, pais });
  if (error) throw error;
  return data;
}
