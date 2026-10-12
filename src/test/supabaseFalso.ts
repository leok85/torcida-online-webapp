// Supabase falso em memória para os testes do Vitest. O setup.ts troca src/lib/supabase por este módulo
// em todos os testes, então nada aqui fala com a rede.
import { vi, type Mock } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';
import type { Assinatura, Perfil } from '../lib/database.types';
import { buscarCidadesDeTeste, clubesDoPais, comCatalogo, PAISES_DE_TESTE } from './catalogoDeTeste';

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
    time_id: 162, // Palmeiras
    nascimento: null,
    cidade: null,
    cidade_id: null,
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

/** Assinatura anual do web app, válida até 2027. Sobrescreva status, origem ou datas para outros cenários. */
export function assinaturaDeTeste(campos: Partial<Assinatura> = {}): Assinatura {
  return {
    id: 'assinatura-1',
    usuario_id: 'usuario-1',
    origem: 'web',
    id_externo: 'sub_teste',
    plano: 'anual',
    status: 'ativa',
    expira_em: '2027-10-11T12:00:00Z',
    criado_em: '2026-10-11T12:00:00Z',
    atualizado_em: '2026-10-11T12:00:00Z',
    ...campos,
  };
}

/** Mesma regra da função sou_assinante() da migration. */
const daAcesso = (a: Assinatura) => ['ativa', 'atrasada', 'cancelada'].includes(a.status) && !!a.expira_em && new Date(a.expira_em) > new Date();

function sessaoPara(perfil: Perfil, email: string): Session {
  const user = { id: perfil.id, email, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: perfil.criado_em } as User;
  return { access_token: 'token-de-teste', refresh_token: 'refresh-de-teste', expires_in: 3600, token_type: 'bearer', user };
}

const ok = (data: unknown) => ({ data, error: null });

function criar() {
  let sessao: Session | null = null;
  const perfis = new Map<string, Perfil>();
  const assinaturas: Assinatura[] = [];
  // RLS: o torcedor só enxerga as próprias assinaturas.
  const minhas = () => assinaturas.filter((a) => a.usuario_id === sessao?.user.id);
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
      maybeSingle: async () => ok(id && perfis.has(id) ? comCatalogo(perfis.get(id)!) : null),
      single: async () => {
        const atual = id ? perfis.get(id) : undefined;
        if (!atual) return { data: null, error: { code: 'PGRST116', message: 'Nenhuma linha' } };
        if (!campos) return ok(comCatalogo(atual));
        if (campos.apelido && apelidoEmUso(campos.apelido, atual.id)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        const novo = { ...atual, ...campos };
        perfis.set(atual.id, novo);
        return ok(comCatalogo(novo));
      },
    };
    return consulta;
  }

  // Imita select().order().limit().maybeSingle(), a consulta de Minha assinatura.
  function consultaAssinaturas() {
    const consulta = {
      select: () => consulta,
      order: () => consulta,
      limit: () => consulta,
      maybeSingle: async () => ok([...minhas()].sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0] ?? null),
    };
    return consulta;
  }

  // Imita select().order() de paises e select().eq('pais', ...).order() de clubes; a lista já sai na ordem do banco.
  function consultaCatalogo(tabela: 'paises' | 'clubes') {
    let pais = '';
    const consulta = {
      select: () => consulta,
      order: () => consulta,
      eq: (_coluna: string, valor: string) => ((pais = valor), consulta),
      then: (resolver: (r: unknown) => unknown, rejeitar?: (e: unknown) => unknown) =>
        Promise.resolve(ok(tabela === 'paises' ? PAISES_DE_TESTE : clubesDoPais(pais))).then(resolver, rejeitar),
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
  const invoke = vi.fn<Fn>();
  // Mesmo contrato das Edge Functions (supabase/functions); erro vem como { context: Response } com { erro }.
  async function invocarPadrao(nome: string, { body }: { body: { acao?: string } }) {
    if (!sessao) return { data: null, error: { context: new Response(JSON.stringify({ erro: 'sem_sessao' }), { status: 401 }) } };
    if (nome === 'criar-checkout') return ok({ clientSecret: 'cs_test_secret_teste' });
    if (nome === 'gerenciar-assinatura') {
      if (body.acao === 'portal') return ok({ url: 'https://billing.stripe.com/p/session/teste' });
      const web = minhas().find((a) => a.origem === 'web' && ['ativa', 'cancelada', 'atrasada'].includes(a.status));
      if (!web) return { data: null, error: { context: new Response(JSON.stringify({ erro: 'sem_assinatura_web' }), { status: 404 }) } };
      web.status = body.acao === 'cancelar' ? 'cancelada' : 'ativa';
      return ok({ status: web.status, expira_em: web.expira_em });
    }
    return { data: null, error: { context: new Response(JSON.stringify({ erro: 'funcao_desconhecida' }), { status: 404 }) } };
  }
  const setManterConectado = vi.fn<Fn>();
  const provedoresAtivos = vi.fn<Fn>();

  function resetar() {
    sessao = null;
    perfis.clear();
    ouvintes.clear();
    for (const [k, impl] of Object.entries(padroes)) auth[k as keyof typeof padroes].mockReset().mockImplementation(impl);
    assinaturas.length = 0;
    rpc.mockReset().mockImplementation(async (fn: string, args?: { apelido?: string; termo?: string; pais?: string; limite?: number }) => {
      if (fn === 'sou_assinante') return ok(minhas().some(daAcesso));
      if (fn === 'buscar_cidades') return ok(buscarCidadesDeTeste(args!.termo!, args!.pais, args!.limite));
      return ok(!apelidoEmUso(args!.apelido!, sessao?.user.id));
    });
    from.mockReset().mockImplementation((tabela: string) =>
      tabela === 'assinaturas' ? consultaAssinaturas() : tabela === 'paises' || tabela === 'clubes' ? consultaCatalogo(tabela) : consultaPerfis(),
    );
    invoke.mockReset().mockImplementation(invocarPadrao);
    setManterConectado.mockReset();
    provedoresAtivos.mockReset().mockResolvedValue({});
  }
  resetar();

  return {
    cliente: { auth, rpc, from, functions: { invoke } },
    setManterConectado,
    provedoresAtivos,
    resetar,
    /** Coloca um torcedor no "banco" sem logar (ex.: dono de um apelido já usado). */
    adicionarPerfil: (perfil: Perfil) => perfis.set(perfil.id, perfil),
    perfil: (id: string) => perfis.get(id),
    /** Grava uma assinatura como o webhook faria. Chame antes de logar para o app já carregar como assinante. */
    assinar: (assinatura: Assinatura = assinaturaDeTeste()) => assinaturas.push(assinatura),
    assinaturas: () => assinaturas,
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
