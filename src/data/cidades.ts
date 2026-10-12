// Cidades do catálogo (tabela cidades: por enquanto os municípios do Brasil, do IBGE).
import { supabase } from '../lib/supabase';

export type Cidade = { id: number; nome: string; regiao: string | null };

/** Países com cidades no catálogo; nos outros, a cidade é texto livre. */
export const PAISES_COM_CIDADES = ['BR'];

export const rotuloCidade = (c: Pick<Cidade, 'nome' | 'regiao'>) => (c.regiao ? `${c.nome}, ${c.regiao}` : c.nome);

/** Nome minúsculo e sem acentos, como o nome_busca do banco. */
export const semAcento = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Cidades do país que contêm o termo (sem diferenciar acentos), começando por quem começa com ele (máx. 20). */
export async function buscarCidades(termo: string, pais = 'BR', limite = 8): Promise<Cidade[]> {
  const { data, error } = await supabase.rpc('buscar_cidades', { termo, pais, limite });
  if (error) throw error;
  return data;
}
