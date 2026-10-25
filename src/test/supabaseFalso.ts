// Supabase falso em memória para os testes do Vitest. O setup.ts troca src/lib/supabase por este módulo
// em todos os testes, então nada aqui fala com a rede.
import { barrarRestritoDeTeste, minhasRestricoesDeTeste, type RestricaoDeTeste } from './restricoesDeTeste';
import { estadoDoXp, extratoDeTeste, meuXpDeTeste, minhaPresencaDeTeste, missoesDeTeste, rankingDeTeste, registrarPresencaDeTeste } from './xpDeTeste';
import { curtirFotoDeTeste, denunciarFotoDeTeste, estadoDasFotos, fotosDoJogoDeTeste, registrarFotoDeTeste } from './fotosDeTeste';
import { estadoDasNoticias, rpcDeNoticias } from './noticiasDeTeste';
import {
  elencosDaPartida,
  elencosDeTeste,
  enviarPalpiteDeTeste,
  maisVotadaDeTeste,
  meuPalpiteDeTeste,
  placaresDaTorcidaDeTeste,
  type PalpiteDeTeste,
} from './palpitesDeTeste';
import type { JogadorDoElenco } from '../data/tiposDoPalpite';
import { vi, type Mock } from 'vitest';
import { AuthApiError } from '@supabase/supabase-js';
import type { Session, User, UserIdentity } from '@supabase/supabase-js';
import type { Assinatura, FeedbackRow, Perfil } from '../lib/database.types';
import { inicioDaSemana } from '../data/semana';
import type { ClassificacaoRow, CompeticaoRow, Partida } from '../lib/database.types';
import { aplicarConviteDeTeste, convidadosDe, convidarAmigosDeTeste, convitesHoje, donoDoConvite, LIMITE_DE_CONVITES, type ConviteEmailDeTeste } from './convitesDeTeste';
import { enviarNotasDeTeste, inserirMensagemDeTeste, notasDaTorcidaDeTeste, SEM_DETALHES, type MensagemDeTeste, type NotaDeTeste } from './jogoDeTeste';
import type { Detalhes } from '../data/tiposDoJogo';
import { buscarCidadesDeTeste, clubesDoPais, CLUBES_DE_TESTE, comCatalogo, PAISES_DE_TESTE, jogosDoClubeDeTeste, maioresTorcidasDeTeste, resumoDoClubeDeTeste } from './catalogoDeTeste';

type Evento = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'USER_UPDATED';
type Ouvinte = (evento: Evento, sessao: Session | null) => void;
type Fn = (...args: any[]) => any;
type CanalFalso = {
  ouvintes: { tipo: string; filtro: { filter?: string }; cb: Fn }[];
  on: Fn;
  subscribe: Fn;
  track: Fn;
  presenceState: Fn;
};

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
    time_anterior_id: null,
    time_trocado_em: null,
    convidado_por: null,
    convite_contou_em: null,
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
  // Minha assinatura: e-mail de cobrança (null = o da conta), código pendente e cartão recusado na troca de plano.
  let emailDeCobranca: string | null = null;
  let codigoDeCobranca: string | null = null;
  let recusarTroca = false;
  // Convidar amigos: convites por e-mail e o e-mail de cada conta (para "Seus convidados").
  const convitesEmail: ConviteEmailDeTeste[] = [];
  // Página do jogo: detalhes da BSD por jogo, mensagens do chat e os canais de tempo real abertos.
  const detalhesDasPartidas = new Map<number, Detalhes>();
  const mensagensChat: MensagemDeTeste[] = [];
  const notasJogadores: NotaDeTeste[] = [];
  const palpites: PalpiteDeTeste[] = [];
  const lembretes: { partida_id: number; usuario_id: string }[] = [];
  let fotosDaTorcida = estadoDasFotos();
  let xp = estadoDoXp();
  let noticias = estadoDasNoticias();
  const restricoes: RestricaoDeTeste[] = [];
  /** Trigger barrar_restrito: erro no formato do PostgREST, ou null. */
  const barrado = (publicar: boolean) => {
    const e = barrarRestritoDeTeste(restricoes, sessao?.user.id, publicar);
    return e && { data: null, error: e };
  };
  let elencos = elencosDeTeste();
  const canais = new Set<CanalFalso>();
  let tempoRealFora = false;
  let online = 1;
  const emailsDasContas = new Map<string, string>();
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
        // Troca de time: livre no onboarding; depois dele, uma única vez, com o país do clube novo.
        const trocouTime = campos.time_id !== undefined && campos.time_id !== atual.time_id && !!atual.onboarding_concluido_em;
        if (trocouTime && atual.time_trocado_em) {
          return { data: null, error: { code: 'P0001', message: 'A troca de time já foi usada', hint: 'troca_usada' } };
        }
        // Trigger perfis_antes_de_atualizar: o convite conta quando o convidado conclui o onboarding.
        const contou = !atual.onboarding_concluido_em && !!campos.onboarding_concluido_em && !!atual.convidado_por;
        const novo = {
          ...atual,
          ...campos,
          convidado_por: atual.convidado_por,
          convite_contou_em: contou ? new Date().toISOString() : atual.convite_contou_em,
          time_anterior_id: atual.time_anterior_id,
          time_trocado_em: atual.time_trocado_em,
          ...(trocouApelido && { apelido_alterado_em: new Date().toISOString(), apelido_anterior: atual.apelido }),
          ...(trocouTime && {
            time_anterior_id: atual.time_id,
            time_trocado_em: new Date().toISOString(),
            pais: CLUBES_DE_TESTE.find((c) => c.id === campos!.time_id)?.pais ?? atual.pais,
          }),
        };
        perfis.set(atual.id, novo);
        return ok(comCatalogo(novo));
      },
    };
    return consulta;
  }

  // Imita insert().select().single() e select().order() de feedbacks, com as regras do trigger
  // feedbacks_antes_de_inserir: +50 XP nos 2 primeiros envios da semana, até 10 por dia, e-mail só com resposta.
  /** lembretes_palpite: RLS, cada um lê, cria e apaga só os próprios. */
  function consultaLembretes() {
    const meus = (partida: number) => lembretes.filter((l) => l.usuario_id === sessao?.user.id && l.partida_id === partida);
    const negado = { data: null, error: { code: '42501', message: 'permission denied' } };
    return {
      select: () => ({ eq: async (_coluna: string, partida: number) => ok(meus(partida).map((l) => ({ partida_id: l.partida_id }))) }),
      insert: async ({ partida_id }: { partida_id: number }) => {
        if (!sessao) return negado;
        if (meus(partida_id).length) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        lembretes.push({ partida_id, usuario_id: sessao.user.id });
        return ok(null);
      },
      delete: () => ({
        eq: async (_coluna: string, partida: number) => {
          for (const l of meus(partida)) lembretes.splice(lembretes.indexOf(l), 1);
          return ok(null);
        },
      }),
    };
  }

  function consultaFeedbacks() {
    let novo: Partial<FeedbackRow> | null = null;
    const meus = () => feedbacks.filter((f) => f.usuario_id === sessao?.user.id).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    const consulta = {
      insert: (linha: Partial<FeedbackRow>) => ((novo = linha), consulta),
      select: () => consulta,
      order: async () => ok(meus()),
      single: async () => {
        if (!sessao || !novo) return { data: null, error: { code: '42501', message: 'permission denied' } };
        const restrito = barrado(false);
        if (restrito) return restrito;
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
    let id = 0;
    const consulta = {
      select: () => consulta,
      eq: (_coluna: string, valor: number) => ((id = valor), consulta),
      // Cópia, como uma resposta nova do servidor (o teste muda o placar no objeto salvo).
      maybeSingle: async () => {
        const p = sessao ? partidas.find((x) => x.id === id) : undefined;
        return ok(p ? { ...p } : null);
      },
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

  // RLS de mensagens_chat: membros leem o chat da própria torcida.
  const podeLerChat = (m: MensagemDeTeste) => {
    const eu = sessao && perfis.get(sessao.user.id);
    return !!eu && eu.time_id === m.clube_id && minhas().some(daAcesso);
  };

  /** O Realtime entrega a mensagem nova a quem escuta o jogo e pode lê-la. */
  function emitirMensagem(m: MensagemDeTeste) {
    if (tempoRealFora || !podeLerChat(m)) return;
    for (const canal of canais)
      for (const h of canal.ouvintes)
        if (h.tipo === 'postgres_changes' && h.filtro.filter === `partida_id=eq.${m.partida_id}`) h.cb({ new: m });
  }

  // Imita select().eq().order().limit(), select().eq().gt().order() e insert().select().single() de mensagens_chat.
  function consultaChat() {
    let partidaId = 0;
    let autorId: string | null = null;
    let soContagem = false;
    let depoisDe = 0;
    let limite = Infinity;
    let decrescente = false;
    let novo: { partida_id?: number; texto?: unknown } | null = null;
    const consulta = {
      select: (_colunas?: string, opcoes?: { head?: boolean }) => ((soContagem = !!opcoes?.head), consulta),
      insert: (linha: { partida_id: number; texto: unknown }) => ((novo = linha), consulta),
      eq: (coluna: string, valor: number | string) => (coluna === 'autor_id' ? (autorId = String(valor)) : (partidaId = Number(valor)), consulta),
      gt: (_coluna: string, valor: number) => ((depoisDe = valor), consulta),
      order: (_coluna: string, opcoes?: { ascending?: boolean }) => ((decrescente = opcoes?.ascending === false), consulta),
      limit: (n: number) => ((limite = n), consulta),
      single: async () => {
        const restrito = barrado(true);
        if (restrito) return restrito;
        const eu = sessao ? perfis.get(sessao.user.id) : undefined;
        const r = inserirMensagemDeTeste(mensagensChat, eu, minhas().some(daAcesso), partidas.find((p) => p.id === novo?.partida_id), novo?.texto);
        if ('hint' in r) return { data: null, error: { code: r.code, message: r.hint || 'check', hint: r.hint } };
        emitirMensagem(r);
        return ok(r);
      },
      then: (resolver: (r: unknown) => unknown, rejeitar?: (e: unknown) => unknown) => {
        const linhas = mensagensChat.filter((m) => m.partida_id === partidaId && m.id > depoisDe && podeLerChat(m) && (!autorId || m.autor_id === autorId));
        if (soContagem) return Promise.resolve({ data: null, error: null, count: linhas.length }).then(resolver, rejeitar);
        const ordenadas = decrescente ? [...linhas].reverse() : linhas;
        return Promise.resolve({ ...ok(ordenadas.slice(0, limite)), count: linhas.length }).then(resolver, rejeitar);
      },
    };
    return consulta;
  }

  /** Canal do Realtime: postgres_changes e presença ("N online"). */
  function criarCanal(): CanalFalso {
    const canal: CanalFalso = {
      ouvintes: [],
      on: (tipo: string, filtro: { filter?: string }, cb: Fn) => (canal.ouvintes.push({ tipo, filtro, cb }), canal),
      subscribe: (cb?: (status: string) => void) => {
        canais.add(canal);
        queueMicrotask(() => {
          cb?.(tempoRealFora ? 'CHANNEL_ERROR' : 'SUBSCRIBED');
          if (!tempoRealFora) canal.ouvintes.filter((h) => h.tipo === 'presence').forEach((h) => h.cb());
        });
        return canal;
      },
      track: async () => 'ok',
      presenceState: () => Object.fromEntries(Array.from({ length: online }, (_, i) => [`torcedor-${i}`, [{}]])),
    };
    return canal;
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
  const channel = vi.fn<Fn>();
  const removeChannel = vi.fn<Fn>();
  // Mesmo contrato das Edge Functions (supabase/functions); erro vem como { context: Response } com { erro }.
  async function invocarPadrao(nome: string, { body }: { body: { acao?: string } }) {
    if (!sessao) return { data: null, error: { context: new Response(JSON.stringify({ erro: 'sem_sessao' }), { status: 401 }) } };
    if (nome === 'criar-checkout') return ok({ clientSecret: 'cs_test_secret_teste' });
    if (nome === 'detalhes-da-partida') {
      const id = (body as { partida?: number }).partida!;
      if (!partidas.some((p) => p.id === id)) return { data: null, error: { context: new Response(JSON.stringify({ erro: 'partida_nao_encontrada' }), { status: 404 }) } };
      return ok(detalhesDasPartidas.get(id) ?? SEM_DETALHES);
    }
    if (nome === 'elenco-da-partida') {
      const partida = partidas.find((p) => p.id === (body as { partida?: number }).partida);
      if (!partida) return { data: null, error: { context: new Response(JSON.stringify({ erro: 'partida_nao_encontrada' }), { status: 404 }) } };
      return ok(elencosDaPartida(elencos, partida));
    }
    if (nome === 'convidar-amigos') {
      const r = convidarAmigosDeTeste(convitesEmail, { id: sessao.user.id, email: sessao.user.email }, body as object);
      return r.status === 200 ? ok(r.corpo) : { data: null, error: { context: new Response(JSON.stringify(r.corpo), { status: r.status }) } };
    }
    if (nome === 'excluir-conta') {
      const exclui_em = new Date(Date.now() + 30 * DIA_MS).toISOString();
      const perfil = perfis.get(sessao.user.id);
      if (perfil) perfis.set(perfil.id, { ...perfil, exclusao_agendada_para: exclui_em });
      return ok({ ok: true, exclui_em });
    }
    if (nome === 'gerenciar-assinatura') {
      const erro = (status: number, codigo: string) => ({ data: null, error: { context: new Response(JSON.stringify({ erro: codigo }), { status }) } });
      const pedido = body as { acao?: string; email?: string; codigo?: string; plano?: string; sessao?: string };
      if (pedido.acao === 'resumo') {
        // Quem assinou pelo web app tem o cartão e a primeira cobrança no Stripe; os outros, nada.
        const doWeb = minhas().find((a) => a.origem === 'web');
        if (!doWeb) return ok({ email: null, plano: null, pagamento: null, cobrancas: [] });
        const anual = doWeb.plano === 'anual';
        return ok({
          email: emailDeCobranca ?? sessao.user.email,
          plano: { valor: anual ? 149 : 14.9, moeda: 'BRL', intervalo: anual ? 'ano' : 'mes' },
          pagamento: { tipo: 'cartao', bandeira: 'Visa', final: '4242', expira: '08/2029' },
          cobrancas: [{ data: doWeb.criado_em, descricao: `Plano ${doWeb.plano} · cartão •••• 4242`, valor: anual ? 149 : 14.9, moeda: 'BRL', recibo: null }],
        });
      }
      // E-mail de cobrança: o código que "chega" no e-mail novo é sempre CODIGO_DE_TESTE.
      if (pedido.acao === 'email-da-conta') {
        emailDeCobranca = null;
        return ok({ email: sessao.user.email });
      }
      if (pedido.acao === 'codigo-email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pedido.email?.trim() ?? '')) return erro(400, 'email_invalido');
        codigoDeCobranca = pedido.email!.trim().toLowerCase();
        return ok({ ok: true });
      }
      if (pedido.acao === 'confirmar-email') {
        if (!codigoDeCobranca) return erro(410, 'codigo_expirado');
        if (pedido.codigo !== CODIGO_DE_TESTE) return erro(400, 'codigo_invalido');
        emailDeCobranca = codigoDeCobranca;
        codigoDeCobranca = null;
        return ok({ email: emailDeCobranca });
      }
      const web = minhas().find((a) => a.origem === 'web' && ['ativa', 'cancelada', 'atrasada'].includes(a.status));
      if (!web) return erro(404, 'sem_assinatura_web');
      if (pedido.acao === 'cancelar' || pedido.acao === 'reativar') {
        web.status = pedido.acao === 'cancelar' ? 'cancelada' : 'ativa';
        return ok({ status: web.status, expira_em: web.expira_em });
      }
      if (pedido.acao === 'previa-troca' || pedido.acao === 'trocar-plano') {
        if (web.status !== 'ativa') return erro(409, 'assinatura_nao_ativa');
        if (pedido.plano === web.plano) return erro(409, 'mesmo_plano');
        const anual = pedido.plano === 'anual';
        if (pedido.acao === 'previa-troca') {
          // Mensal → anual: R$ 149,00 menos R$ 7,45 que sobraram do mês. Anual → mensal: o crédito cobre o mês.
          return ok(
            anual
              ? { plano: 'anual', valor: 149, credito: 7.45, total: 141.55, moeda: 'BRL', renova_em: '2027-10-12T12:00:00.000Z' }
              : { plano: 'mensal', valor: 14.9, credito: 74.5, total: 0, moeda: 'BRL', renova_em: '2026-11-12T12:00:00.000Z' },
          );
        }
        if (recusarTroca) return erro(402, 'recusado');
        web.plano = anual ? 'anual' : 'mensal';
        return ok({ plano: web.plano, status: web.status, expira_em: web.expira_em });
      }
      if (pedido.acao === 'sessao-cartao') return ok({ clientSecret: 'cs_setup_secret_teste' });
      if (pedido.acao === 'definir-cartao') {
        if (!pedido.sessao?.startsWith('cs_')) return erro(400, 'sessao_invalida');
        if (web.status === 'atrasada') web.status = 'ativa';
        return ok({ status: web.status });
      }
      return erro(400, 'acao_invalida');
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
      createSignedUrls: vi.fn(async (caminhos: string[]) =>
        ok(caminhos.map((c) => ({ path: c, signedUrl: `https://supabase.test/storage/v1/object/sign/${bucket}/${c}?token=teste`, error: null }))),
      ),
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
    emailDeCobranca = null;
    codigoDeCobranca = null;
    recusarTroca = false;
    convitesEmail.length = 0;
    detalhesDasPartidas.clear();
    mensagensChat.length = 0;
    notasJogadores.length = 0;
    palpites.length = 0;
    lembretes.length = 0;
    fotosDaTorcida = estadoDasFotos();
    xp = estadoDoXp();
    noticias = estadoDasNoticias();
    restricoes.length = 0;
    elencos = elencosDeTeste();
    canais.clear();
    tempoRealFora = false;
    online = 1;
    channel.mockReset().mockImplementation(criarCanal);
    removeChannel.mockReset().mockImplementation(async (canal: CanalFalso) => (canais.delete(canal), 'ok'));
    emailsDasContas.clear();
    rpc.mockReset().mockImplementation(async (fn: string, args?: { apelido?: string; termo?: string; pais?: string; limite?: number; clube?: number; sessao?: string; codigo?: string }) => {
      if (fn === 'minhas_restricoes') return ok(minhasRestricoesDeTeste(restricoes, sessao?.user.id));
      // barrar_restrito: palpite, notas, joinha (só ao dar), denúncia e foto (esta também com silêncio).
      const daJoinha = fn === 'curtir_foto' && !fotosDaTorcida.joinhas.some((j) => j.usuario_id === sessao?.user.id && j.foto_id === (args as unknown as { p_foto: string }).p_foto);
      if (['enviar_palpite', 'enviar_notas', 'denunciar_foto', 'registrar_foto'].includes(fn) || daJoinha) {
        const restrito = barrado(fn === 'registrar_foto');
        if (restrito) return restrito;
      }
      const daNoticia = rpcDeNoticias(fn, (args ?? {}) as object, {
        estado: noticias,
        xp,
        perfis: perfis.values(),
        eu: sessao ? perfis.get(sessao.user.id) : undefined,
        restrito: (publicar) => barrarRestritoDeTeste(restricoes, sessao?.user.id, publicar),
      });
      if (daNoticia) return 'erro' in daNoticia ? { data: null, error: daNoticia.erro } : ok(daNoticia.dados);
      if (fn === 'enviar_notas' || fn === 'notas_da_torcida') {
        const a = args as unknown as { p_partida: number; p_notas?: unknown };
        const eu = sessao ? perfis.get(sessao.user.id) : undefined;
        const assinante = minhas().some(daAcesso);
        if (fn === 'notas_da_torcida') return ok(notasDaTorcidaDeTeste(notasJogadores, eu, assinante, a.p_partida));
        const partida = partidas.find((p) => p.id === a.p_partida);
        const r = enviarNotasDeTeste(notasJogadores, eu, assinante, partida, detalhesDasPartidas.get(a.p_partida), a.p_notas);
        return typeof r === 'number' ? ok(r) : { data: null, error: { code: r.code, message: r.hint, hint: r.hint } };
      }
      if (fn === 'registrar_foto' || fn === 'fotos_do_jogo' || fn === 'curtir_foto' || fn === 'denunciar_foto') {
        const eu = sessao ? perfis.get(sessao.user.id) : undefined;
        const assinante = minhas().some(daAcesso);
        const a = args as unknown as { p_partida: number; p_caminho: string; p_etiqueta: string; p_legenda?: string; p_foto: string };
        if (fn === 'fotos_do_jogo') return ok(fotosDoJogoDeTeste(fotosDaTorcida, eu, assinante, a.p_partida));
        const r =
          fn === 'registrar_foto'
            ? registrarFotoDeTeste(fotosDaTorcida, eu, assinante, partidas, a)
            : fn === 'curtir_foto'
              ? curtirFotoDeTeste(fotosDaTorcida, eu, assinante, partidas, a.p_foto)
              : denunciarFotoDeTeste(fotosDaTorcida, eu, assinante, partidas, a.p_foto);
        return r && typeof r === 'object' ? { data: null, error: { code: r.code, message: r.hint, hint: r.hint } } : ok(r);
      }
      if (fn === 'palpites_da_torcida') {
        const eu = sessao ? perfis.get(sessao.user.id) : undefined;
        return ok(placaresDaTorcidaDeTeste(palpites, eu, minhas().some(daAcesso), partidas, (args as unknown as { p_partida: number }).p_partida));
      }
      if (fn === 'escalacao_mais_votada') {
        const eu = sessao ? perfis.get(sessao.user.id) : undefined;
        return ok(maisVotadaDeTeste(palpites, eu, minhas().some(daAcesso), partidas, elencos, (args as unknown as { p_partida: number }).p_partida));
      }
      if (fn === 'enviar_palpite' || fn === 'meu_palpite') {
        const a = args as unknown as { p_partida: number };
        if (fn === 'meu_palpite') return ok(meuPalpiteDeTeste(palpites, sessao?.user.id, a.p_partida));
        const eu = sessao ? perfis.get(sessao.user.id) : undefined;
        const r = enviarPalpiteDeTeste(palpites, eu, minhas().some(daAcesso), partidas, elencos, args as object);
        return r ? { data: null, error: { code: r.code, message: r.hint, hint: r.hint } } : ok(null);
      }
      if (['registrar_presenca', 'meu_xp', 'minha_presenca', 'meu_extrato', 'minhas_missoes', 'ranking_xp'].includes(fn)) {
        const eu = sessao ? perfis.get(sessao.user.id) : undefined;
        const a = (args ?? {}) as { p_limite?: number; p_periodo?: string; p_clube?: number | null };
        if (fn === 'registrar_presenca') return ok(registrarPresencaDeTeste(xp, eu));
        if (fn === 'meu_xp') return ok(meuXpDeTeste(xp, eu));
        if (fn === 'minha_presenca') return ok(minhaPresencaDeTeste(xp, eu));
        if (fn === 'meu_extrato') return ok(extratoDeTeste(xp, eu, a.p_limite));
        if (fn === 'minhas_missoes') return ok(missoesDeTeste(xp, eu));
        return ok(rankingDeTeste(xp, perfis.values(), eu, a));
      }
      if (fn === 'convite_de') {
        const dono = donoDoConvite(perfis.values(), args!.codigo);
        return ok(dono ? [{ apelido: dono.apelido, clube: CLUBES_DE_TESTE.find((c) => c.id === dono.time_id)?.nome ?? null }] : []);
      }
      if (fn === 'meu_convidador') {
        const meu = sessao && perfis.get(sessao.user.id)?.convidado_por;
        return ok((meu && perfis.get(meu)?.apelido) ?? null);
      }
      if (fn === 'aplicar_convite') {
        const r = aplicarConviteDeTeste(perfis, sessao!.user.id, args!.codigo);
        return 'hint' in r ? { data: null, error: { code: 'P0001', message: r.hint, hint: r.hint } } : ok(r.apelido);
      }
      if (fn === 'meus_convidados') return ok(convidadosDe(perfis.values(), convitesEmail, (id) => emailsDasContas.get(id), sessao!.user.id));
      if (fn === 'convites_restantes') return ok(Math.max(0, LIMITE_DE_CONVITES - convitesHoje(convitesEmail, sessao!.user.id)));
      if (fn === 'sou_assinante') return ok(minhas().some(daAcesso));
      if (fn === 'buscar_cidades') return ok(buscarCidadesDeTeste(args!.termo!, args!.pais, args!.limite));
      if (fn === 'resumo_do_clube') return ok(resumoDoClubeDeTeste([...perfis.values()], args!.clube!));
      if (fn === 'maiores_torcidas') return ok(maioresTorcidasDeTeste([...perfis.values()], sessao?.user.id, (args as { p_limite?: number })?.p_limite));
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
      tabela === 'xp_regras'
        ? { select: async () => ok(xp.regras) }
        : tabela === 'mensagens_chat'
        ? consultaChat()
        : tabela === 'feedbacks'
        ? consultaFeedbacks()
        : tabela === 'lembretes_palpite'
        ? consultaLembretes()
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
    cliente: { auth, rpc, from, storage, functions: { invoke }, channel, removeChannel },
    setManterConectado,
    provedoresAtivos,
    resetar,
    /** Coloca um torcedor no "banco" sem logar (ex.: dono de um apelido já usado). */
    adicionarPerfil: (perfil: Perfil, email?: string) => {
      perfis.set(perfil.id, perfil);
      if (email) emailsDasContas.set(perfil.id, email);
    },
    /** O que a função detalhes-da-partida devolve para o jogo (padrão: nada ainda). */
    definirDetalhes: (id: number, detalhes: Detalhes) => detalhesDasPartidas.set(id, detalhes),
    /** Notas dos jogadores gravadas (de todos os torcedores); empurre linhas para simular os votos da torcida. */
    notasDosJogadores: () => notasJogadores,
    /** Escalações e palpites gravados (de todos os torcedores). */
    palpites: () => palpites,
    /** Pedidos de "Me avise" do próximo palpite (de todos os torcedores). */
    lembretes: () => lembretes,
    /** Silêncios e suspensões aplicados pela equipe (de todos os torcedores). */
    restricoes: () => restricoes,
    /** XP: lançamentos (empurre com lancarXp), missões e regras (de todos os torcedores). */
    xp: () => xp,
    /** Notícias, leituras, curtidas e comentários (de todos os torcedores); empurre com noticiaDeTeste(). */
    noticias: () => noticias,
    /** Fotos da torcida gravadas, joinhas e denúncias (de todos os torcedores). */
    fotosDaTorcida: () => fotosDaTorcida,
    /** Elenco de um clube, como a função elenco-da-partida devolveria (padrão: Palmeiras e Corinthians). */
    definirElenco: (clubeId: number, jogadores: JogadorDoElenco[]) => elencos.set(clubeId, jogadores),
    elenco: (clubeId: number) => elencos.get(clubeId) ?? [],
    /** Mensagens do chat gravadas (de todas as torcidas). */
    mensagensDoChat: () => mensagensChat,
    /** Outro torcedor escreve no chat: grava e entrega pelo tempo real a quem pode ler. */
    mensagemDaTorcida(campos: Partial<MensagemDeTeste> & { texto: string }) {
      const m: MensagemDeTeste = {
        id: (mensagensChat.at(-1)?.id ?? 0) + 1,
        partida_id: 7290,
        clube_id: 162,
        autor_id: 'usuario-9',
        autor_apelido: 'Bia.T',
        autor_foto: null,
        criado_em: new Date().toISOString(),
        ...campos,
      };
      mensagensChat.push(m);
      emitirMensagem(m);
      return m;
    },
    /** O canal do Realtime não conecta (CHANNEL_ERROR): o app passa a buscar as novas de tempos em tempos. */
    derrubarTempoReal: () => (tempoRealFora = true),
    /** Quantos torcedores a presença do canal mostra. */
    definirOnline: (n: number) => (online = n),
    /** Convites por e-mail gravados pela função convidar-amigos (de todos os torcedores). */
    convitesEmail: () => convitesEmail,
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
    /** O banco recusa o cartão na próxima troca de plano. */
    recusarTrocaDePlano: () => (recusarTroca = true),
    /** E-mail que recebe os avisos de cobrança no Stripe (null = o da conta). */
    emailDeCobranca: () => emailDeCobranca,
    /** Cria a sessão; antes do render vira a sessão salva, depois dispara SIGNED_IN como o Supabase. */
    logar(perfil: Perfil, email = EMAIL_PADRAO) {
      perfis.set(perfil.id, perfil);
      emailsDasContas.set(perfil.id, email);
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
