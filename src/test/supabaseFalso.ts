// Supabase falso em memória para os testes do Vitest. O setup.ts troca src/lib/supabase por este módulo
// em todos os testes, então nada aqui fala com a rede.
import { vi, type Mock } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';
import type { Perfil } from '../lib/database.types';

type Evento = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'USER_UPDATED';
type Ouvinte = (evento: Evento, sessao: Session | null) => void;
type Fn = (...args: any[]) => any;

export const EMAIL_PADRAO = 'rafa@example.com';

/** Torcedor com onboarding concluído. Sobrescreva só o que importa para o teste. */
export function perfilDeTeste(campos: Partial<Perfil> = {}): Perfil {
  return {
    id: 'usuario-1',
    nome: 'Rafael Andrade',
    apelido: 'Rafa_9',
    pais: 'BR',
    time_id: 'clube-b',
    nascimento: null,
    cidade: null,
    quer_avisos: true,
    quer_novidades: false,
    termos_aceitos_em: '2026-10-01T12:00:00Z',
    onboarding_concluido_em: '2026-10-01T12:05:00Z',
    criado_em: '2026-10-01T12:00:00Z',
    atualizado_em: '2026-10-01T12:05:00Z',
    ...campos,
  };
}

/** Recém-cadastrado: e-mail confirmado, mas ainda sem país, clube e onboarding. */
export const perfilNovo = (campos: Partial<Perfil> = {}) =>
  perfilDeTeste({ pais: null, time_id: null, onboarding_concluido_em: null, ...campos });

function sessaoPara(perfil: Perfil, email: string): Session {
  const user = { id: perfil.id, email, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: perfil.criado_em } as User;
  return { access_token: 'token-de-teste', refresh_token: 'refresh-de-teste', expires_in: 3600, token_type: 'bearer', user };
}

const ok = (data: unknown) => ({ data, error: null });

function criar() {
  let sessao: Session | null = null;
  const perfis = new Map<string, Perfil>();
  const ouvintes = new Set<Ouvinte>();
  const emitir = (evento: Evento) => ouvintes.forEach((o) => o(evento, sessao));

  const apelidoEmUso = (apelido: string, excetoId?: string) =>
    [...perfis.values()].some((p) => p.id !== excetoId && p.apelido?.toLowerCase() === apelido.trim().toLowerCase());

  // Imita só as chamadas que o app faz: select().eq().maybeSingle() e update().eq().select().single().
  function consultaPerfis() {
    let campos: Partial<Perfil> | null = null;
    let id: string | undefined;
    const consulta = {
      select: () => consulta,
      update: (c: Partial<Perfil>) => ((campos = c), consulta),
      eq: (_coluna: string, valor: string) => ((id = valor), consulta),
      maybeSingle: async () => ok((id && perfis.get(id)) ?? null),
      single: async () => {
        const atual = id ? perfis.get(id) : undefined;
        if (!atual) return { data: null, error: { code: 'PGRST116', message: 'Nenhuma linha' } };
        if (!campos) return ok(atual);
        if (campos.apelido && apelidoEmUso(campos.apelido, atual.id)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        const novo = { ...atual, ...campos };
        perfis.set(atual.id, novo);
        return ok(novo);
      },
    };
    return consulta;
  }

  const padroes = {
    onAuthStateChange: (cb: Ouvinte) => {
      ouvintes.add(cb);
      queueMicrotask(() => cb('INITIAL_SESSION', sessao));
      return { data: { subscription: { unsubscribe: () => ouvintes.delete(cb) } } };
    },
    signInWithPassword: async () => ok({ user: null, session: null }),
    signUp: async () => ok({ user: null, session: null }),
    verifyOtp: async () => ok({ user: null, session: null }),
    resend: async () => ok({}),
    resetPasswordForEmail: async () => ok({}),
    updateUser: async () => ok({ user: sessao?.user ?? null }),
    signOut: async () => {
      sessao = null;
      emitir('SIGNED_OUT');
      return { error: null };
    },
    signInWithOAuth: async () => ok({ provider: 'google', url: '' }),
  } satisfies Record<string, Fn>;

  const auth = Object.fromEntries(Object.keys(padroes).map((k) => [k, vi.fn()])) as { [K in keyof typeof padroes]: Mock<Fn> };
  const rpc = vi.fn<Fn>();
  const from = vi.fn<Fn>();
  const setManterConectado = vi.fn<Fn>();
  const provedoresAtivos = vi.fn<Fn>();

  function resetar() {
    sessao = null;
    perfis.clear();
    ouvintes.clear();
    for (const [k, impl] of Object.entries(padroes)) auth[k as keyof typeof padroes].mockReset().mockImplementation(impl);
    rpc.mockReset().mockImplementation(async (_fn: string, args: { apelido: string }) => ok(!apelidoEmUso(args.apelido, sessao?.user.id)));
    from.mockReset().mockImplementation(() => consultaPerfis());
    setManterConectado.mockReset();
    provedoresAtivos.mockReset().mockResolvedValue({});
  }
  resetar();

  return {
    cliente: { auth, rpc, from },
    setManterConectado,
    provedoresAtivos,
    resetar,
    /** Coloca um torcedor no "banco" sem logar (ex.: dono de um apelido já usado). */
    adicionarPerfil: (perfil: Perfil) => perfis.set(perfil.id, perfil),
    perfil: (id: string) => perfis.get(id),
    /** Cria a sessão; antes do render vira a sessão salva, depois dispara SIGNED_IN como o Supabase. */
    logar(perfil: Perfil, email = EMAIL_PADRAO) {
      perfis.set(perfil.id, perfil);
      sessao = sessaoPara(perfil, email);
      emitir('SIGNED_IN');
      return sessao;
    },
  };
}

export const supabaseFalso = criar();

/** Formato do módulo src/lib/supabase, usado no vi.mock do setup. */
export const moduloSupabaseFalso = {
  supabase: supabaseFalso.cliente,
  setManterConectado: supabaseFalso.setManterConectado,
  provedoresAtivos: supabaseFalso.provedoresAtivos,
};
