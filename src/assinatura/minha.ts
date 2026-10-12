// A assinatura do torcedor logado e o resumo de cobrança do Stripe: Minha assinatura, Planos e Pagamento.
import { useEffect, useState } from 'react';
import type { Assinatura } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { chamarFuncao } from './funcoes';

/** O que a ação "resumo" de gerenciar-assinatura devolve (dados de cobrança do Stripe). */
export type ResumoDaCobranca = {
  email: string | null;
  plano: { valor: number; moeda: string; intervalo: 'ano' | 'mes' } | null;
  pagamento: { tipo: 'cartao'; bandeira: string; final: string; expira: string } | { tipo: 'pix' } | { tipo: 'outro'; nome: string } | null;
  cobrancas: { data: string; descricao: string; valor: number; moeda: string; recibo: string | null }[];
};

/** A mais recente do torcedor, de qualquer origem (web, App Store ou Google Play). */
export async function buscarAssinatura(): Promise<Assinatura | null> {
  const { data, error } = await supabase.from('assinaturas').select('*').order('criado_em', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function buscarResumo(): Promise<ResumoDaCobranca> {
  const r = await chamarFuncao<ResumoDaCobranca>('gerenciar-assinatura', { acao: 'resumo' });
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
}

/** Dá acesso: ativa, atrasada ou cancelada ainda no prazo, ou aguardando o primeiro pagamento. */
export const emAndamento = (a: Assinatura | null) =>
  !!a && (a.status === 'pendente' || (['ativa', 'atrasada', 'cancelada'].includes(a.status) && !!a.expira_em && new Date(a.expira_em) > new Date()));

/** Assinatura do web app que dá para mexer aqui (trocar plano ou cartão): não é da loja nem está esperando o 1º pagamento. */
export const doWebEmAndamento = (a: Assinatura | null) => !!a && a.origem === 'web' && a.status !== 'pendente' && emAndamento(a);

/** A assinatura de quem já é membro (undefined enquanto carrega; null para quem não é). */
export function useAssinaturaDoMembro(assinante: boolean) {
  const [assinatura, setAssinatura] = useState<Assinatura | null | undefined>(assinante ? undefined : null);
  useEffect(() => {
    if (!assinante) return setAssinatura(null);
    let ativo = true;
    buscarAssinatura().then(
      (a) => ativo && setAssinatura(a),
      () => ativo && setAssinatura(null),
    );
    return () => {
      ativo = false;
    };
  }, [assinante]);
  return assinatura;
}
