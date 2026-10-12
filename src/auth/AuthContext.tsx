import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PostgrestError, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { ClubeRow, Pais, Perfil, PerfilUpdate } from '../lib/database.types';

/** O perfil com o clube e o país já resolvidos no catálogo (embed do PostgREST). */
export type PerfilCompleto = Perfil & {
  clube: Pick<ClubeRow, 'id' | 'nome' | 'nome_curto' | 'liga_id'> | null;
  pais_dados: Pick<Pais, 'nome' | 'bandeira'> | null;
  /** O clube de antes da troca de time (vira-casaca); null enquanto a troca não foi usada. */
  clube_anterior: Pick<ClubeRow, 'id' | 'nome'> | null;
};

// Duas chaves para clubes (time atual e anterior): o embed precisa dizer qual usar.
const COLUNAS_PERFIL =
  '*, clube:clubes!perfis_time_id_fkey(id, nome, nome_curto, liga_id), clube_anterior:clubes!perfis_time_anterior_id_fkey(id, nome), pais_dados:paises(nome, bandeira)';

type Auth = {
  /** Enquanto a sessão salva é lida ou o perfil do usuário logado é buscado. */
  carregando: boolean;
  sessao: Session | null;
  perfil: PerfilCompleto | null;
  /** Assinatura válida em qualquer origem (web, App Store ou Google Play), segundo `sou_assinante()`. */
  assinante: boolean;
  erroPerfil: boolean;
  recarregarPerfil: () => void;
  /** Relê `sou_assinante()` sem recarregar o perfil (ex.: esperando o webhook depois do pagamento). */
  atualizarAssinante: () => Promise<boolean>;
  atualizarPerfil: (campos: PerfilUpdate) => Promise<PostgrestError | null>;
  sair: () => Promise<void>;
};

type PerfilCarregado = { de: string; perfil: PerfilCompleto | null; assinante: boolean };

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [sessaoLida, setSessaoLida] = useState(false);
  const [carregado, setCarregado] = useState<PerfilCarregado | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    // Dispara INITIAL_SESSION na inscrição e depois cada login, logout e renovação de token.
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s);
      setSessaoLida(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = sessao?.user.id;

  useEffect(() => {
    if (!userId) return;
    let ativo = true;
    // Se a checagem da assinatura falhar, o torcedor entra como não assinante e vê o bloqueio com "Ver planos".
    Promise.all([
      supabase.from('perfis').select(COLUNAS_PERFIL).eq('id', userId).maybeSingle(),
      supabase.rpc('sou_assinante'),
    ]).then(([{ data }, { data: assinante }]) => {
      if (ativo) setCarregado({ de: userId, perfil: data, assinante: assinante === true });
    });
    return () => {
      ativo = false;
    };
  }, [userId, tentativa]);

  const recarregarPerfil = useCallback(() => {
    setCarregado(null);
    setTentativa((t) => t + 1);
  }, []);

  const atualizarAssinante = useCallback(async () => {
    if (!userId) return false;
    const { data } = await supabase.rpc('sou_assinante');
    const assinante = data === true;
    setCarregado((atual) => (atual?.de === userId ? { ...atual, assinante } : atual));
    return assinante;
  }, [userId]);

  const atualizarPerfil = useCallback(
    async (campos: PerfilUpdate) => {
      if (!userId) return null;
      const { data, error } = await supabase.from('perfis').update(campos).eq('id', userId).select(COLUNAS_PERFIL).single();
      if (data) setCarregado((atual) => ({ de: userId, perfil: data, assinante: atual?.de === userId && atual.assinante }));
      return error;
    },
    [userId],
  );

  const sair = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const value = useMemo<Auth>(() => {
    const perfilAtual = userId && carregado?.de === userId ? carregado : null;
    return {
      carregando: !sessaoLida || (!!userId && !perfilAtual),
      sessao,
      perfil: perfilAtual?.perfil ?? null,
      assinante: perfilAtual?.assinante ?? false,
      erroPerfil: !!perfilAtual && !perfilAtual.perfil,
      recarregarPerfil,
      atualizarAssinante,
      atualizarPerfil,
      sair,
    };
  }, [sessao, sessaoLida, userId, carregado, recarregarPerfil, atualizarAssinante, atualizarPerfil, sair]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
