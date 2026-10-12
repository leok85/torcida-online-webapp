// Supabase falso em memória para os testes do Vitest. O setup.ts troca src/lib/supabase por este módulo
// em todos os testes, então nada aqui fala com a rede.
import { vi, type Mock } from 'vitest';
import { AuthApiError } from '@supabase/supabase-js';
import type { Session, User, UserIdentity } from '@supabase/supabase-js';
import type { Assinatura, FeedbackRow, Perfil } from '../lib/database.types';
import { inicioDaSemana } from '../data/semana';
import type { ClassificacaoRow, CompeticaoRow, Partida } from '../lib/database.types';
import { buscarCidadesDeTeste, clubesDoPais, comCatalogo, PAISES_DE_TESTE, jogosDoClubeDeTeste, resumoDoClubeDeTeste } from './catalogoDeTeste';

type Evento = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'USER_UPDATED';
type Ouvinte = (evento: Evento, sessao: Session | null) => void;
type Fn = (...args: any[]) => any;

export const EMAIL_PADRAO = 'rafa@example.com';
/** Código de 6 dígitos que o falso aceita na troca de e-mail. */
export const CODIGO_DE_TESTE = '123456';
/** Senha atual do torcedor de teste (para alterar a senha). */
export const SENHA_DE_TESTE = 'Senha#2026';

const erroDeAuth = (code: string, status: number) => new AuthApiError(code, status, code);

/** Torcedor com onboarding concluído. Sobrescreva só o que importa para o teste. */
export function perfilDeTeste(campos: Partial<Perfil> = {}): Perfil {
  return {
    id: 'usuario-1',
    nome: 'Rafael Andrade',
    apelido: 'Rafa_9',
    apelido_alterado_em: null,
    apelido_anterior: null,
    // Com senha (trigger ao_trocar_senha); null = entra só pelo Google ou pela Apple.
    senha_alterada_em: '2026-06-10T12:00:00Z',
    foto: null,
    exclusao_agendada_para: null,
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

/** Identidade do Supabase Auth (forma de entrar) para os testes de Dados da conta. */
export function identidadeDeTeste(provider: 'email' | 'google' | 'apple', email = EMAIL_PADRAO): UserIdentity {
  return {
    id: `${provider}-1`,
    identity_id: `identidade-${provider}`,
    user_id: 'usuario-1',
    provider,
    identity_data: { email },
    created_at: '2026-10-01T12:00:00Z',
    last_sign_in_at: '2026-10-01T12:00:00Z',
    updated_at: '2026-10-01T12:00:00Z',
  };
}

export type AparelhoDeTeste = { id: string; user_agent: string | null; criado_em: string; usado_em: string; atual: boolean };

export const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
export const EDGE_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0';
export const APP_IPHONE = 'TorcidaOnline/1.0 CFNetwork/1568 Darwin/24.0 (iPhone)';

const DIA_MS = 86_400_000;

function criar() {
  let sessao: Session | null = null;
  const perfis = new Map<string, Perfil>();
  const assinaturas: Assinatura[] = [];
  const partidas: Partida[] = [];
  const competicoes: CompeticaoRow[] = [];
  const tabelas: ClassificacaoRow[] = [];
  // Dados da conta: formas de entrar, senha, sessões abertas e fotos no Storage.
  let identidades: UserIdentity[] = [];
  let aparelhos: AparelhoDeTeste[] = [];
  const fotos = new Set<string>();
  const feedbacks: FeedbackRow[] = [];
  // Troca de e-mail pendente (updateUser({ email })) e quantos códigos faltam: 2 com a troca segura.
  let trocaDeEmail: { novo: string; faltam: Set<string> } | null = null;
  let trocaSegura = false;
  // RLS: o torcedor só enxerga as próprias assinaturas.
  const minhas = () => assinaturas.filter((a) => a.usuario_id === sessao?.user.id);
  const ouvintes = new Set<Ouvinte>();
  const emitir = (evento: Evento) => ouvintes.forEach((o) => o(evento, sessao));

  const apelidoEmUso = (apelido: string, excetoId?: string) =>
    [...perfis.values()].some((p) => p.id !== excetoId && p.apelido?.toLowerCase() === apelido.trim().toLowerCase());
  // Mesma regra de apelido_reservado(): o apelido anterior de outro torcedor fica reservado por 30 dias.
  const apelidoReservado = (apelido: string, excetoId?: string) =>
    [...perfis.values()].some(
      (p) =>
        p.id !== excetoId &&
        p.apelido_anterior?.toLowerCase() === apelido.trim().toLowerCase() &&
        !!p.apelido_alterado_em &&
        Date.now() - new Date(p.apelido_alterado_em).getTime() < 30 * DIA_MS,
    );
  const temSenha = () => !!(sessao && perfis.get(sessao.user.id)?.senha_alterada_em);

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
        if (campos.apelido && apelidoReservado(campos.apelido, atual.id)) {
          return { data: null, error: { code: 'P0001', message: 'Apelido reservado por outro torcedor', hint: 'apelido_reservado' } };
        }
        // Mesma regra do trigger perfis_antes_de_atualizar: uma troca de apelido a cada 30 dias.
        const trocouApelido = campos.apelido !== undefined && campos.apelido !== atual.apelido && atual.apelido !== null;
        if (trocouApelido && atual.apelido_alterado_em && Date.now() - new Date(atual.apelido_alterado_em).getTime() < 30 * DIA_MS) {
          return { data: null, error: { code: 'P0001', message: 'Apelido trocado há menos de 30 dias', hint: 'apelido_recente' } };
        }
        const novo = { ...atual, ...campos, ...(trocouApelido && { apelido_alterado_em: new Date().toISOString(), apelido_anterior: atual.apelido }) };
        perfis.set(atual.id, novo);
        return ok(comCatalogo(novo));
      },
    };
    return consulta;
  }

  // Imita insert().select().single() e select().order() de feedbacks, com as regras do trigger
  // feedbacks_antes_de_inserir: +50 XP nos 2 primeiros envios da semana, até 10 por dia, e-mail só com resposta.
  function consultaFeedbacks() {
    let novo: Partial<FeedbackRow> | null = null;
    const meus = () => feedbacks.filter((f) => f.usuario_id === sessao?.user.id).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    const consulta = {
      insert: (linha: Partial<FeedbackRow>) => ((novo = linha), consulta),
      select: () => consulta,
      order: async () => ok(meus()),
      single: async () => {
        if (!sessao || !novo) return { data: null, error: { code: '42501', message: 'permission denied' } };
        const agora = new Date();
        const doDia = meus().filter((f) => agora.getTime() - new Date(f.criado_em).getTime() < DIA_MS).length;
        if (doDia >= 10) return { data: null, error: { code: 'P0001', message: 'Muitos envios hoje', hint: 'limite_diario' } };
        const comXp = meus().filter((f) => f.xp > 0 && new Date(f.criado_em) >= inicioDaSemana(agora)).length;
        const linha: FeedbackRow = {
          id: `feedback-${feedbacks.length + 1}`,
          usuario_id: sessao.user.id,
          tipo: novo.tipo!,
          area: novo.area!,
          texto: novo.texto!.trim(),
          anexo: novo.anexo ?? null,
          dados_navegador: novo.dados_navegador ?? null,
          pode_responder: !!novo.pode_responder,
          email: novo.pode_responder ? (sessao.user.email ?? null) : null,
          estado: 'recebido',
          resposta: null,
          xp: comXp < 2 ? 50 : 0,
          criado_em: agora.toISOString(),
          atualizado_em: agora.toISOString(),
        };
        feedbacks.push(linha);
        return ok(linha);
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

  // Imita select().or('mandante_id.eq.X,visitante_id.eq.X').order('inicio') de jogosDoClube.
  function consultaPartidas() {
    let clubeId = 0;
    const consulta = {
      select: () => consulta,
      or: (filtro: string) => ((clubeId = Number(/mandante_id\.eq\.(\d+)/.exec(filtro)?.[1])), consulta),
      order: async () => ok(sessao ? jogosDoClubeDeTeste(partidas, clubeId) : []),
    };
    return consulta;
  }

  // Imita select().in('liga_id', ids) de competicoes e select().in().order().order() de classificacao.
  function consultaPorLiga<T extends { liga_id: number }>(linhas: T[]) {
    let ids: number[] = [];
    const consulta = {
      select: () => consulta,
      in: (_coluna: string, valores: number[]) => ((ids = valores), consulta),
      order: () => consulta,
      then: (resolver: (r: unknown) => unknown, rejeitar?: (e: unknown) => unknown) =>
        Promise.resolve(ok(sessao ? linhas.filter((l) => ids.includes(l.liga_id)) : [])).then(resolver, rejeitar),
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
    verifyOtp: async (p: { email?: string; token?: string; type?: string }) => {
      if (p.type !== 'email_change') return ok({ user: null, session: null });
      if (!trocaDeEmail || !sessao || p.token !== CODIGO_DE_TESTE || !trocaDeEmail.faltam.has(p.email!)) {
        return { data: { user: null, session: null }, error: erroDeAuth('otp_expired', 403) };
      }
      trocaDeEmail.faltam.delete(p.email!);
      if (trocaDeEmail.faltam.size === 0) {
        sessao = { ...sessao, user: { ...sessao.user, email: trocaDeEmail.novo } };
        trocaDeEmail = null;
        emitir('USER_UPDATED');
      }
      return ok({ user: sessao.user, session: sessao });
    },
    resend: async () => ok({}),
    resetPasswordForEmail: async () => ok({}),
    updateUser: async (attrs: { email?: string; password?: string; current_password?: string } = {}) => {
      if (attrs.email && sessao) {
        trocaDeEmail = { novo: attrs.email, faltam: new Set(trocaSegura ? [attrs.email, sessao.user.email!] : [attrs.email]) };
      }
      if (attrs.password) {
        // Como a opção "exigir a senha atual" do Supabase: só confere quando ela vem (a recuperação não manda).
        if (attrs.current_password !== undefined && attrs.current_password !== SENHA_DE_TESTE) return { data: { user: null }, error: erroDeAuth('current_password_mismatch', 422) };
        // Trigger ao_trocar_senha: a data da senha vai para o perfil.
        const perfil = sessao && perfis.get(sessao.user.id);
        if (perfil) perfis.set(perfil.id, { ...perfil, senha_alterada_em: new Date().toISOString() });
      }
      return ok({ user: sessao?.user ?? null });
    },
    reauthenticate: async () => ok({ user: null, session: null }),
    signOut: async ({ scope }: { scope?: 'global' | 'local' | 'others' } = {}) => {
      aparelhos = aparelhos.filter((a) => a.atual);
      if (scope === 'others') return { error: null };
      sessao = null;
      emitir('SIGNED_OUT');
      return { error: null };
    },
    signInWithOAuth: async () => ok({ provider: 'google', url: '' }),
    getUserIdentities: async () => ok({ identities: identidades }),
    linkIdentity: async ({ provider }: { provider: string }) => ok({ provider, url: `https://auth.example.com/${provider}` }),
    unlinkIdentity: async (identidade: UserIdentity) => {
      if (identidades.length + (temSenha() && !identidades.some((i) => i.provider === 'email') ? 1 : 0) <= 1) {
        return { data: null, error: erroDeAuth('single_identity_not_deletable', 422) };
      }
      identidades = identidades.filter((i) => i.identity_id !== identidade.identity_id);
      return ok({});
    },
  } satisfies Record<string, Fn>;

  const auth = Object.fromEntries(Object.keys(padroes).map((k) => [k, vi.fn()])) as { [K in keyof typeof padroes]: Mock<Fn> };
  const rpc = vi.fn<Fn>();
  const from = vi.fn<Fn>();
  const invoke = vi.fn<Fn>();
  // Mesmo contrato das Edge Functions (supabase/functions); erro vem como { context: Response } com { erro }.
  async function invocarPadrao(nome: string, { body }: { body: { acao?: string } }) {
    if (!sessao) return { data: null, error: { context: new Response(JSON.stringify({ erro: 'sem_sessao' }), { status: 401 }) } };
    if (nome === 'criar-checkout') return ok({ clientSecret: 'cs_test_secret_teste' });
    if (nome === 'excluir-conta') {
      const exclui_em = new Date(Date.now() + 30 * DIA_MS).toISOString();
      const perfil = perfis.get(sessao.user.id);
      if (perfil) perfis.set(perfil.id, { ...perfil, exclusao_agendada_para: exclui_em });
      return ok({ ok: true, exclui_em });
    }
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
  const storage = {
    from: vi.fn((bucket: string) => ({
      upload: vi.fn(async (caminho: string) => (fotos.add(caminho), ok({ path: caminho }))),
      remove: vi.fn(async (caminhos: string[]) => (caminhos.forEach((c) => fotos.delete(c)), ok([]))),
      getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://supabase.test/storage/v1/object/public/${bucket}/${caminho}` } }),
    })),
  };

  function resetar() {
    sessao = null;
    perfis.clear();
    ouvintes.clear();
    for (const [k, impl] of Object.entries(padroes)) auth[k as keyof typeof padroes].mockReset().mockImplementation(impl);
    assinaturas.length = 0;
    partidas.length = 0;
    competicoes.length = 0;
    tabelas.length = 0;
    identidades = [identidadeDeTeste('email')];
    aparelhos = [{ id: 'sessao-atual', user_agent: CHROME_MAC, criado_em: '2026-10-01T12:00:00Z', usado_em: new Date().toISOString(), atual: true }];
    fotos.clear();
    feedbacks.length = 0;
    trocaDeEmail = null;
    trocaSegura = false;
    rpc.mockReset().mockImplementation(async (fn: string, args?: { apelido?: string; termo?: string; pais?: string; limite?: number; clube?: number; sessao?: string }) => {
      if (fn === 'sou_assinante') return ok(minhas().some(daAcesso));
      if (fn === 'buscar_cidades') return ok(buscarCidadesDeTeste(args!.termo!, args!.pais, args!.limite));
      if (fn === 'resumo_do_clube') return ok(resumoDoClubeDeTeste([...perfis.values()], args!.clube!));
      if (fn === 'meus_aparelhos') return ok(aparelhos);
      if (fn === 'encerrar_aparelho') {
        const antes = aparelhos.length;
        aparelhos = aparelhos.filter((a) => a.atual || a.id !== args!.sessao);
        return ok(aparelhos.length < antes);
      }
      if (fn === 'manter_minha_conta') {
        const perfil = sessao && perfis.get(sessao.user.id);
        if (perfil) perfis.set(perfil.id, { ...perfil, exclusao_agendada_para: null });
        return ok(null);
      }
      return ok(!apelidoEmUso(args!.apelido!, sessao?.user.id) && !apelidoReservado(args!.apelido!, sessao?.user.id));
    });
    from.mockReset().mockImplementation((tabela: string) =>
      tabela === 'feedbacks'
        ? consultaFeedbacks()
        : tabela === 'assinaturas'
        ? consultaAssinaturas()
        : tabela === 'partidas'
          ? consultaPartidas()
          : tabela === 'competicoes'
            ? consultaPorLiga(competicoes)
            : tabela === 'classificacao'
              ? consultaPorLiga(tabelas)
              : tabela === 'paises' || tabela === 'clubes' ? consultaCatalogo(tabela) : consultaPerfis(),
    );
    invoke.mockReset().mockImplementation(invocarPadrao);
    setManterConectado.mockReset();
    provedoresAtivos.mockReset().mockResolvedValue({});
  }
  resetar();

  return {
    cliente: { auth, rpc, from, storage, functions: { invoke } },
    setManterConectado,
    provedoresAtivos,
    resetar,
    /** Coloca um torcedor no "banco" sem logar (ex.: dono de um apelido já usado). */
    adicionarPerfil: (perfil: Perfil) => perfis.set(perfil.id, perfil),
    perfil: (id: string) => perfis.get(id),
    /** Grava uma assinatura como o webhook faria. Chame antes de logar para o app já carregar como assinante. */
    assinar: (assinatura: Assinatura = assinaturaDeTeste()) => assinaturas.push(assinatura),
    assinaturas: () => assinaturas,
    /** Grava um jogo como a sincronização com a BSD faria; altere o objeto para simular o placar mudando. */
    adicionarPartida: (partida: Partida) => (partidas.push(partida), partida),
    /** Formato/fases (competicoes) e linhas de classificação, como a sincronização com a BSD gravaria. */
    adicionarCompeticoes: (novas: CompeticaoRow[], linhas: ClassificacaoRow[] = []) => {
      competicoes.push(...novas);
      tabelas.push(...linhas);
    },
    /** Contas ligadas (getUserIdentities). Padrão: só e-mail. Quem não tem senha: perfil com senha_alterada_em null. */
    definirFormasDeEntrar: (novas: UserIdentity[]) => (identidades = novas),
    /** Sessões abertas (meus_aparelhos). Padrão: só este navegador. */
    definirAparelhos: (novos: AparelhoDeTeste[]) => (aparelhos = novos),
    aparelhos: () => aparelhos,
    fotos: () => [...fotos],
    /** Feedbacks gravados (de todos os torcedores); empurre linhas para simular envios antigos e respostas da equipe. */
    feedbacks: () => feedbacks,
    /** Liga a "troca segura de e-mail" do Supabase: o e-mail atual também precisa confirmar com código. */
    ligarTrocaSegura: () => (trocaSegura = true),
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
