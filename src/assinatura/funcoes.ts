import { supabase } from '../lib/supabase';

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

/** Chama uma Edge Function e devolve o código de erro que ela mandou ({ erro: '...' }) ou 'falha_de_rede'. */
export async function chamarFuncao<T>(nome: string, corpo: object): Promise<Resultado<T>> {
  const { data, error } = await supabase.functions.invoke(nome, { body: corpo });
  if (!error) return { ok: true, dados: data as T };
  const resposta = (error as { context?: unknown }).context;
  if (resposta instanceof Response) {
    try {
      const { erro } = await resposta.json();
      if (typeof erro === 'string') return { ok: false, erro };
    } catch {
      // corpo sem JSON: cai no erro genérico
    }
  }
  return { ok: false, erro: 'falha_de_rede' };
}
