import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PostgrestError, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Perfil, PerfilUpdate } from '../lib/database.types';

type Auth = {
  /** Enquanto a sessão salva é lida ou o perfil do usuário logado é buscado. */
  carregando: boolean;
  sessao: Session | null;
  perfil: Perfil | null;
  erroPerfil: boolean;
  recarregarPerfil: () => void;
  atualizarPerfil: (campos: PerfilUpdate) => Promise<PostgrestError | null>;
  sair: () => Promise<void>;
};

type PerfilCarregado = { de: string; perfil: Perfil | null };

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
    supabase
      .from('perfis')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (ativo) setCarregado({ de: userId, perfil: data });
      });
    return () => {
      ativo = false;
    };
  }, [userId, tentativa]);

  const recarregarPerfil = useCallback(() => {
    setCarregado(null);
    setTentativa((t) => t + 1);
  }, []);

  const atualizarPerfil = useCallback(
    async (campos: PerfilUpdate) => {
      if (!userId) return null;
      const { data, error } = await supabase.from('perfis').update(campos).eq('id', userId).select().single();
      if (data) setCarregado({ de: userId, perfil: data });
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
      erroPerfil: !!perfilAtual && !perfilAtual.perfil,
      recarregarPerfil,
      atualizarPerfil,
      sair,
    };
  }, [sessao, sessaoLida, userId, carregado, recarregarPerfil, atualizarPerfil, sair]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
