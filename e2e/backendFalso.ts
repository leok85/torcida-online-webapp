// Supabase falso para o Playwright: intercepta /auth/v1 e /rest/v1 no navegador e guarda tudo em memória.
// Reproduz as regras do servidor que o app depende (supabase/migrations): perfil criado no cadastro, apelido único,
// datas de aceite e onboarding definidas pelo servidor. Os "e-mails" ficam em `emails` para o teste ler o código.
import { estadoDoXp, extratoDeTeste, meuXpDeTeste, minhaPresencaDeTeste, missoesDeTeste, rankingDeTeste, registrarPresencaDeTeste } from '../src/test/xpDeTeste';
import { curtirFotoDeTeste, denunciarFotoDeTeste, estadoDasFotos, fotosDoJogoDeTeste, registrarFotoDeTeste } from '../src/test/fotosDeTeste';
import {
  elencosDaPartida,
  elencosDeTeste,
  enviarPalpiteDeTeste,
  maisVotadaDeTeste,
  meuPalpiteDeTeste,
  placaresDaTorcidaDeTeste,
  type PalpiteDeTeste,
} from '../src/test/palpitesDeTeste';
import type { BrowserContext, Route } from '@playwright/test';
import type { ClassificacaoRow, CompeticaoRow, FeedbackRow, Partida } from '../src/lib/database.types';
import { inicioDaSemana } from '../src/data/semana';
import { aplicarConviteDeTeste, convidadosDe, convidarAmigosDeTeste, convitesHoje, donoDoConvite, LIMITE_DE_CONVITES, type ConviteEmailDeTeste } from '../src/test/convitesDeTeste';
import { enviarNotasDeTeste, inserirMensagemDeTeste, notasDaTorcidaDeTeste, SEM_DETALHES, type MensagemDeTeste, type NotaDeTeste } from '../src/test/jogoDeTeste';
import type { Detalhes } from '../src/data/tiposDoJogo';
import { buscarCidadesDeTeste, clubesDoPais, CLUBES_DE_TESTE, comCatalogo, PAISES_DE_TESTE, jogosDoClubeDeTeste, resumoDoClubeDeTeste } from '../src/test/catalogoDeTeste';

type Perfil = {
  id: string;
  nome: string;
  apelido: string | null;
  pais: string | null;
  time_id: number | null;
  nascimento: string | null;
  cidade: string | null;
  cidade_id: number | null;
  quer_avisos: boolean;
  quer_novidades: boolean;
  termos_aceitos_em: string | null;
  onboarding_concluido_em: string | null;
  foto: string | null;
  apelido_alterado_em: string | null;
  apelido_anterior: string | null;
  senha_alterada_em: string | null;
  exclusao_agendada_para: string | null;
  time_anterior_id: number | null;
  time_trocado_em: string | null;
  convidado_por: string | null;
  convite_contou_em: string | null;
  criado_em: string;
  atualizado_em: string;
};

type Assinatura = {
  id: string;
  usuario_id: string;
  origem: 'web' | 'apple' | 'google';
  id_externo: string;
  plano: 'mensal' | 'anual';
  status: 'pendente' | 'ativa' | 'atrasada' | 'cancelada' | 'expirada';
  expira_em: string | null;
  criado_em: string;
  atualizado_em: string;
};

type Usuario = { id: string; email: string; senha: string; confirmado: boolean; metadata: Record<string, unknown>; criado_em: string };
type Email = { para: string; tipo: 'signup' | 'recovery' | 'email_change'; codigo: string };

const APELIDO_VALIDO = /^[A-Za-z0-9._]{3,20}$/;
const COLUNAS_EDITAVEIS = ['nome', 'apelido', 'pais', 'time_id', 'nascimento', 'cidade', 'cidade_id', 'quer_avisos', 'quer_novidades', 'termos_aceitos_em', 'onboarding_concluido_em', 'foto'];
const DIA_MS = 86_400_000;

/** O storage-js manda Blob como multipart/form-data: tira dele a parte do arquivo (a que tem Content-Type). */
function arquivoDoMultipart(corpo: Buffer, tipo: string) {
  const fronteira = /boundary=(.+)$/.exec(tipo)?.[1];
  if (!fronteira) return { corpo, tipo };
  const sep = Buffer.from(`--${fronteira}`);
  let inicio = corpo.indexOf(sep);
  while (inicio !== -1) {
    const proximo = corpo.indexOf(sep, inicio + sep.length);
    if (proximo === -1) break;
    const parte = corpo.subarray(inicio + sep.length + 2, proximo - 2);
    const fimDosCabecalhos = parte.indexOf('\r\n\r\n');
    const cabecalhos = parte.subarray(0, fimDosCabecalhos).toString();
    const tipoDoArquivo = /content-type:\s*(\S+)/i.exec(cabecalhos)?.[1];
    if (tipoDoArquivo) return { corpo: Buffer.from(parte.subarray(fimDosCabecalhos + 4)), tipo: tipoDoArquivo };
    inicio = proximo;
  }
  return null;
}

const base64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const agora = () => new Date().toISOString();

export class BackendFalso {
  readonly usuarios = new Map<string, Usuario>();
  readonly perfis = new Map<string, Perfil>();
  /** Convites mandados pela função convidar-amigos (o e-mail não sai: o teste lê daqui). */
  readonly convitesEmail: ConviteEmailDeTeste[] = [];
  /** Minha assinatura: e-mail de cobrança trocado e o código pendente de cada torcedor. */
  readonly emailDeCobranca = new Map<string, string>();
  readonly codigosDeCobranca = new Map<string, { email: string; codigo: string }>();
  readonly emails: Email[] = [];
  readonly assinaturas: Assinatura[] = [];
  /** Jogos como a sincronização com a BSD gravaria (tabela partidas). */
  readonly partidas: Partida[] = [];
  /** O que a função detalhes-da-partida devolve por jogo (padrão: nada ainda). */
  readonly detalhes = new Map<number, Detalhes>();
  /** Mensagens do chat (tabela mensagens_chat), de todas as torcidas. */
  readonly mensagensChat: MensagemDeTeste[] = [];
  /** Notas dos jogadores (tabela notas_jogadores), de todos os torcedores. */
  readonly notasJogadores: NotaDeTeste[] = [];
  /** Escalações e palpites (tabela palpites), de todos os torcedores. */
  readonly palpites: PalpiteDeTeste[] = [];
  /** Pedidos de "Me avise" (tabela lembretes_palpite). */
  readonly lembretes: { partida_id: number; usuario_id: string }[] = [];
  /** Elencos que a função elenco-da-partida devolve (padrão: Palmeiras e Corinthians). */
  readonly elencos = elencosDeTeste();
  readonly competicoes: CompeticaoRow[] = [];
  readonly classificacao: ClassificacaoRow[] = [];
  private readonly codigos = new Map<string, { codigo: string; tipo: Email['tipo'] }>();
  private readonly tokens = new Map<string, string>();
  /** Troca de e-mail pendente por usuário (PUT /user com email), confirmada com o código do e-mail novo. */
  private readonly trocasDeEmail = new Map<string, string>();
  /** Arquivos do bucket avatares (caminho → bytes e tipo), servidos pela URL pública. */
  readonly fotos = new Map<string, { corpo: Buffer; tipo: string }>();
  /** Feedbacks enviados (tabela feedbacks) e os prints do bucket feedback. */
  readonly feedbacks: FeedbackRow[] = [];
  readonly prints = new Map<string, { corpo: Buffer; tipo: string }>();
  /** Fotos da torcida (tabelas fotos_torcida, fotos_joinhas, fotos_denuncias) e os arquivos do bucket fotos-torcida. */
  readonly fotosDaTorcida = estadoDasFotos();
  /** XP: lançamentos (empurre com lancarXp), missões e regras. */
  readonly xp = estadoDoXp();
  readonly arquivosDasFotos = new Map<string, { corpo: Buffer; tipo: string }>();
  private sequencia = 0;
  /** Provedores sociais ligados (resposta de /auth/v1/settings). */
  provedores: Record<string, boolean> = { email: true, google: false };

  async instalar(contexto: BrowserContext) {
    await contexto.route('**/auth/v1/**', (rota) => this.auth(rota));
    await contexto.route('**/rest/v1/**', (rota) => this.rest(rota));
    // Escudos do bucket público: o teste não tem as imagens, então o app mostra o escudo listrado.
    await contexto.route('**/storage/v1/object/public/escudos/**', (rota) => rota.fulfill({ status: 404, body: '' }));
    await contexto.route('**/storage/v1/object/**/avatares/**', (rota) => this.avatares(rota));
    await contexto.route('**/storage/v1/object/avatares', (rota) => this.avatares(rota));
    await contexto.route('**/storage/v1/object/feedback/**', (rota) => this.printDoFeedback(rota));
    await contexto.route('**/storage/v1/object/**fotos-torcida**', (rota) => this.bucketDasFotos(rota));
    await contexto.route('**/functions/v1/**', (rota) => this.funcoes(rota));
    // Nenhum teste fala com o Stripe de verdade: o Stripe.js nem carrega.
    await contexto.route('https://js.stripe.com/**', (rota) => rota.abort());

  }

  // ---------- Atalhos para montar cenários ----------

  /** Usuário com e-mail confirmado. Com `perfil`, já passa pelo onboarding. */
  criarUsuario(email: string, senha: string, dados: { nome?: string; apelido?: string } = {}, perfil: Partial<Perfil> = {}) {
    const usuario = this.novoUsuario(email, senha, { nome: dados.nome ?? 'Torcedor de Teste', apelido: dados.apelido, aceitou_termos: true });
    usuario.confirmado = true;
    Object.assign(this.perfis.get(usuario.id)!, perfil);
    return usuario;
  }

  /** Grava uma assinatura como o webhook do Stripe ou do RevenueCat faria. */
  /** O código que "chegou" no e-mail de cobrança novo. */
  codigoDeCobranca(email: string) {
    return [...this.codigosDeCobranca.values()].find((c) => c.email === email)?.codigo ?? '';
  }

  assinar(email: string, campos: Partial<Assinatura> = {}) {
    const usuario = this.porEmail(email);
    if (!usuario) throw new Error(`Usuário ${email} não existe`);
    const assinatura: Assinatura = {
      id: crypto.randomUUID(),
      usuario_id: usuario.id,
      origem: 'web',
      id_externo: `sub_${this.assinaturas.length + 1}`,
      plano: 'anual',
      status: 'ativa',
      expira_em: new Date(Date.now() + 365 * 86400_000).toISOString(),
      criado_em: agora(),
      atualizado_em: agora(),
      ...campos,
    };
    this.assinaturas.push(assinatura);
    return assinatura;
  }

  ultimoCodigo(email: string, tipo: Email['tipo']) {
    const email_ = [...this.emails].reverse().find((e) => e.para === email && e.tipo === tipo);
    if (!email_) throw new Error(`Nenhum e-mail de ${tipo} para ${email}`);
    return email_.codigo;
  }

  perfilDe(email: string) {
    const usuario = [...this.usuarios.values()].find((u) => u.email === email);
    return usuario && this.perfis.get(usuario.id);
  }

  // ---------- Regras do "banco" ----------

  private apelidoEmUso(apelido: string, excetoId?: string) {
    return [...this.perfis.values()].some((p) => p.id !== excetoId && p.apelido?.toLowerCase() === apelido.trim().toLowerCase());
  }

  private novoUsuario(email: string, senha: string, metadata: Record<string, unknown>) {
    const id = `00000000-0000-4000-8000-${String(++this.sequencia).padStart(12, '0')}`;
    const usuario: Usuario = { id, email, senha, confirmado: false, metadata, criado_em: agora() };
    this.usuarios.set(id, usuario);
    // Mesmo comportamento do trigger criar_perfil_do_usuario.
    let apelido = typeof metadata.apelido === 'string' ? metadata.apelido.trim() : null;
    if (!apelido || !APELIDO_VALIDO.test(apelido) || this.apelidoEmUso(apelido)) apelido = null;
    this.perfis.set(id, {
      id,
      nome: String(metadata.nome ?? metadata.full_name ?? '').slice(0, 80),
      apelido,
      pais: null,
      time_id: null,
      nascimento: null,
      cidade: null,
      cidade_id: null,
      quer_avisos: true,
      quer_novidades: metadata.quer_novidades === true,
      termos_aceitos_em: metadata.aceitou_termos === true ? agora() : null,
      onboarding_concluido_em: null,
      foto: null,
      apelido_alterado_em: null,
      apelido_anterior: null,
      // Trigger ao_trocar_senha: cadastro com senha já marca a data.
      senha_alterada_em: senha ? agora() : null,
      exclusao_agendada_para: null,
      time_anterior_id: null,
      time_trocado_em: null,
      // raw_user_meta_data.convite: o apelido de quem mandou o link /r/.
      convidado_por: donoDoConvite(this.perfis.values(), metadata.convite)?.id ?? null,
      convite_contou_em: null,
      criado_em: agora(),
      atualizado_em: agora(),
    });
    return usuario;
  }

  private enviarCodigo(email: string, tipo: Email['tipo']) {
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    this.codigos.set(email, { codigo, tipo });
    this.emails.push({ para: email, tipo, codigo });
  }

  private sessao(usuario: Usuario) {
    const token = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: usuario.id, email: usuario.email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.assinatura`;
    this.tokens.set(token, usuario.id);
    return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `refresh-${usuario.id}`, user: this.usuarioPublico(usuario) };
  }

  private usuarioPublico(u: Usuario) {
    return {
      id: u.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: u.email,
      email_confirmed_at: u.confirmado ? u.criado_em : null,
      user_metadata: u.metadata,
      app_metadata: { provider: 'email', providers: ['email'] },
      identities: [{ id: u.id, provider: 'email', identity_data: { email: u.email } }],
      created_at: u.criado_em,
    };
  }

  private usuarioDoToken(rota: Route) {
    const token = rota.request().headers()['authorization']?.replace('Bearer ', '');
    const id = token && this.tokens.get(token);
    return id ? this.usuarios.get(id) : undefined;
  }

  private porEmail(email: string) {
    return [...this.usuarios.values()].find((u) => u.email === email.toLowerCase());
  }

  // ---------- /auth/v1 ----------

  private async auth(rota: Route) {
    const req = rota.request();
    const url = new URL(req.url());
    const caminho = url.pathname.replace(/^.*\/auth\/v1/, '');
    const corpo = req.postDataJSON?.() ?? {};
    const json = (status: number, dados: unknown) => rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify(dados) });
    const erro = (status: number, codigo: string, msg: string) => json(status, { code: status, error_code: codigo, msg });

    if (caminho === '/settings') return json(200, { external: this.provedores, disable_signup: false, mailer_autoconfirm: false });

    if (caminho === '/token' && url.searchParams.get('grant_type') === 'password') {
      const usuario = this.porEmail(corpo.email);
      if (!usuario || usuario.senha !== corpo.password) return erro(400, 'invalid_credentials', 'Invalid login credentials');
      if (!usuario.confirmado) return erro(400, 'email_not_confirmed', 'Email not confirmed');
      return json(200, this.sessao(usuario));
    }

    if (caminho === '/signup') {
      const existente = this.porEmail(corpo.email);
      if (existente?.confirmado) {
        // O Supabase não revela que o e-mail existe: devolve um usuário falso sem identidades.
        return json(200, { ...this.usuarioPublico(existente), id: crypto.randomUUID(), identities: [] });
      }
      const usuario = existente ?? this.novoUsuario(corpo.email.toLowerCase(), corpo.password, corpo.data ?? {});
      this.enviarCodigo(usuario.email, 'signup');
      return json(200, this.usuarioPublico(usuario));
    }

    if (caminho === '/resend') {
      const usuario = this.porEmail(corpo.email);
      if (usuario && !usuario.confirmado) this.enviarCodigo(usuario.email, 'signup');
      return json(200, {});
    }

    if (caminho === '/recover') {
      const usuario = this.porEmail(corpo.email);
      if (usuario) this.enviarCodigo(usuario.email, 'recovery');
      return json(200, {});
    }

    if (caminho === '/verify' && corpo.type === 'email_change') {
      // O código vai para o e-mail novo; o usuário é achado pela troca pendente.
      const [id, novo] = [...this.trocasDeEmail].find(([, e]) => e === corpo.email) ?? [];
      const pendente = novo && this.codigos.get(novo);
      const usuario = id && this.usuarios.get(id);
      if (!usuario || !pendente || pendente.tipo !== 'email_change' || pendente.codigo !== corpo.token) return erro(403, 'otp_expired', 'Token has expired or is invalid');
      this.codigos.delete(novo);
      this.trocasDeEmail.delete(usuario.id);
      usuario.email = novo;
      return json(200, this.sessao(usuario));
    }

    if (caminho === '/verify') {
      const usuario = this.porEmail(corpo.email);
      const pendente = usuario && this.codigos.get(usuario.email);
      const tipoOk = pendente && (corpo.type === 'email' || corpo.type === pendente.tipo);
      if (!usuario || !pendente || !tipoOk || pendente.codigo !== corpo.token) return erro(403, 'otp_expired', 'Token has expired or is invalid');
      this.codigos.delete(usuario.email);
      usuario.confirmado = true;
      return json(200, this.sessao(usuario));
    }

    if (caminho === '/user') {
      const usuario = this.usuarioDoToken(rota);
      if (!usuario) return erro(401, 'no_authorization', 'Missing token');
      if (req.method() === 'PUT' && corpo.password) {
        if (corpo.password === usuario.senha) return erro(422, 'same_password', 'New password should be different from the old password.');
        if (corpo.current_password !== undefined && corpo.current_password !== usuario.senha) {
          return erro(422, 'current_password_mismatch', 'Current password required when setting new password.');
        }
        usuario.senha = corpo.password;
        this.perfis.get(usuario.id)!.senha_alterada_em = agora();
      }
      if (req.method() === 'PUT' && corpo.email) {
        if (this.porEmail(corpo.email)) return erro(422, 'email_exists', 'A user with this email address has already been registered');
        this.trocasDeEmail.set(usuario.id, corpo.email.toLowerCase());
        this.enviarCodigo(corpo.email.toLowerCase(), 'email_change');
      }
      return json(200, this.usuarioPublico(usuario));
    }

    if (caminho === '/logout') {
      // scope=others: só os outros aparelhos saem; este token continua valendo.
      const usuario = this.usuarioDoToken(rota);
      const token = req.headers()['authorization']?.replace('Bearer ', '');
      for (const [t, id] of this.tokens) if (id === usuario?.id && (url.searchParams.get('scope') !== 'others' || t !== token)) this.tokens.delete(t);
      return rota.fulfill({ status: 204 });
    }

    return erro(404, 'not_found', `Rota falsa não implementada: ${req.method()} ${caminho}`);
  }

  // ---------- /functions/v1 (mesmo contrato das Edge Functions em supabase/functions) ----------

  private async funcoes(rota: Route) {
    const req = rota.request();
    const json = (status: number, dados: unknown) => rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify(dados) });
    if (req.method() === 'OPTIONS') return rota.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    const nome = new URL(req.url()).pathname.replace(/^.*\/functions\/v1\//, '');
    const usuario = this.usuarioDoToken(rota);
    if (!usuario) return json(401, { erro: 'sem_sessao' });
    const corpo = req.postDataJSON?.() ?? {};

    if (nome === 'criar-checkout') return json(200, { clientSecret: 'cs_test_e2e_secret' });
    if (nome === 'detalhes-da-partida') {
      if (!this.partidas.some((p) => p.id === corpo.partida)) return json(404, { erro: 'partida_nao_encontrada' });
      return json(200, this.detalhes.get(corpo.partida) ?? SEM_DETALHES);
    }
    if (nome === 'elenco-da-partida') {
      const partida = this.partidas.find((p) => p.id === corpo.partida);
      if (!partida) return json(404, { erro: 'partida_nao_encontrada' });
      return json(200, elencosDaPartida(this.elencos, partida));
    }
    if (nome === 'convidar-amigos') {
      const r = convidarAmigosDeTeste(this.convitesEmail, { id: usuario.id, email: usuario.email }, corpo);
      return json(r.status, r.corpo);
    }
    if (nome === 'excluir-conta') {
      // Agenda para daqui a 30 dias e tira a conta de todos os aparelhos, como a Edge Function.
      const exclui_em = new Date(Date.now() + 30 * DIA_MS).toISOString();
      this.perfis.get(usuario.id)!.exclusao_agendada_para = exclui_em;
      for (const [t, id] of this.tokens) if (id === usuario.id) this.tokens.delete(t);
      return json(200, { ok: true, exclui_em });
    }
    if (nome === 'gerenciar-assinatura') {
      if (corpo.acao === 'resumo') {
        const doWeb = this.assinaturas.find((a) => a.usuario_id === usuario.id && a.origem === 'web');
        if (!doWeb) return json(200, { email: null, plano: null, pagamento: null, cobrancas: [] });
        const anual = doWeb.plano === 'anual';
        return json(200, {
          email: this.emailDeCobranca.get(usuario.id) ?? usuario.email,
          plano: { valor: anual ? 149 : 14.9, moeda: 'BRL', intervalo: anual ? 'ano' : 'mes' },
          pagamento: { tipo: 'cartao', bandeira: 'Visa', final: '4242', expira: '08/2029' },
          cobrancas: [{ data: doWeb.criado_em, descricao: `Plano ${doWeb.plano} · cartão •••• 4242`, valor: anual ? 149 : 14.9, moeda: 'BRL', recibo: null }],
        });
      }
      // E-mail de cobrança: o código "enviado" fica guardado para o teste ler (ultimoCodigoDeCobranca).
      if (corpo.acao === 'email-da-conta') {
        this.emailDeCobranca.delete(usuario.id);
        return json(200, { email: usuario.email });
      }
      if (corpo.acao === 'codigo-email') {
        const email = String(corpo.email ?? '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { erro: 'email_invalido' });
        this.codigosDeCobranca.set(usuario.id, { email, codigo: String(100000 + this.codigosDeCobranca.size) });
        return json(200, { ok: true });
      }
      if (corpo.acao === 'confirmar-email') {
        const pendente = this.codigosDeCobranca.get(usuario.id);
        if (!pendente) return json(410, { erro: 'codigo_expirado' });
        if (corpo.codigo !== pendente.codigo) return json(400, { erro: 'codigo_invalido' });
        this.emailDeCobranca.set(usuario.id, pendente.email);
        this.codigosDeCobranca.delete(usuario.id);
        return json(200, { email: pendente.email });
      }
      const web = this.assinaturas.find((a) => a.usuario_id === usuario.id && a.origem === 'web' && ['ativa', 'cancelada', 'atrasada'].includes(a.status));
      if (!web) return json(404, { erro: 'sem_assinatura_web' });
      if (corpo.acao === 'cancelar' || corpo.acao === 'reativar') {
        web.status = corpo.acao === 'cancelar' ? 'cancelada' : 'ativa';
        return json(200, { status: web.status, expira_em: web.expira_em });
      }
      if (corpo.acao === 'previa-troca' || corpo.acao === 'trocar-plano') {
        if (web.status !== 'ativa') return json(409, { erro: 'assinatura_nao_ativa' });
        if (corpo.plano === web.plano) return json(409, { erro: 'mesmo_plano' });
        const anual = corpo.plano === 'anual';
        if (corpo.acao === 'previa-troca') {
          return json(
            200,
            anual
              ? { plano: 'anual', valor: 149, credito: 7.45, total: 141.55, moeda: 'BRL', renova_em: '2027-10-12T12:00:00.000Z' }
              : { plano: 'mensal', valor: 14.9, credito: 74.5, total: 0, moeda: 'BRL', renova_em: '2026-11-12T12:00:00.000Z' },
          );
        }
        web.plano = anual ? 'anual' : 'mensal';
        return json(200, { plano: web.plano, status: web.status, expira_em: web.expira_em });
      }
      if (corpo.acao === 'sessao-cartao') return json(200, { clientSecret: 'cs_setup_e2e_secret' });
      if (corpo.acao === 'definir-cartao') return json(200, { status: web.status });
      return json(400, { erro: 'acao_invalida' });
    }
    return json(404, { erro: `Função falsa não implementada: ${nome}` });
  }

  // ---------- /storage/v1 (bucket avatares) ----------

  private async avatares(rota: Route) {
    const req = rota.request();
    const url = new URL(req.url());
    const publico = url.pathname.match(/\/object\/public\/avatares\/(.+)$/);
    if (publico) {
      const foto = this.fotos.get(decodeURIComponent(publico[1]));
      return foto ? rota.fulfill({ status: 200, contentType: foto.tipo, body: foto.corpo }) : rota.fulfill({ status: 404, body: '' });
    }
    const usuario = this.usuarioDoToken(rota);
    if (!usuario) return rota.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Unauthorized"}' });
    if (req.method() === 'DELETE') {
      // remove(): DELETE /object/avatares com { prefixes: [...] }.
      const { prefixes = [] } = req.postDataJSON() ?? {};
      for (const caminho of prefixes as string[]) if (caminho.startsWith(`${usuario.id}/`)) this.fotos.delete(caminho);
      return rota.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    // upload(): POST /object/avatares/<id>/<arquivo>; política: só na pasta do próprio torcedor.
    const caminho = decodeURIComponent(url.pathname.replace(/^.*\/object\/avatares\//, ''));
    if (!caminho.startsWith(`${usuario.id}/`)) return rota.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"new row violates row-level security policy"}' });
    const arquivo = arquivoDoMultipart(req.postDataBuffer() ?? Buffer.alloc(0), req.headers()['content-type'] ?? '');
    if (!arquivo) return rota.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"Arquivo não encontrado no corpo"}' });
    this.fotos.set(caminho, arquivo);
    return rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: `avatares/${caminho}` }) });
  }

  /** Bucket privado fotos-torcida: upload na própria pasta, URLs assinadas só para a torcida do clube (membros). */
  private async bucketDasFotos(rota: Route) {
    const req = rota.request();
    const url = new URL(req.url());
    const assinada = url.pathname.match(/\/object\/sign\/fotos-torcida\/(.+)$/);
    if (assinada && req.method() === 'GET') {
      const arquivo = this.arquivosDasFotos.get(decodeURIComponent(assinada[1]));
      return arquivo ? rota.fulfill({ status: 200, contentType: arquivo.tipo, body: arquivo.corpo }) : rota.fulfill({ status: 404, body: '' });
    }
    const usuario = this.usuarioDoToken(rota);
    if (!usuario) return rota.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Unauthorized"}' });
    const perfil = this.perfis.get(usuario.id);
    const membro = this.assinaturas.some(
      (a) => a.usuario_id === usuario.id && ['ativa', 'atrasada', 'cancelada'].includes(a.status) && !!a.expira_em && new Date(a.expira_em) > new Date(),
    );
    if (url.pathname.endsWith('/object/sign/fotos-torcida')) {
      const { paths = [] } = req.postDataJSON() as { paths: string[] };
      const pode = (c: string) => membro && c.split('/')[1] === String(perfil?.time_id);
      return rota.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(paths.map((c) => (pode(c) ? { path: c, signedURL: `/object/sign/fotos-torcida/${c}?token=e2e`, error: null } : { path: c, signedURL: null, error: 'Object not found' }))),
      });
    }
    if (req.method() === 'DELETE') {
      const { prefixes = [] } = req.postDataJSON() ?? {};
      for (const c of prefixes as string[]) if (c.split('/')[2] === usuario.id) this.arquivosDasFotos.delete(c);
      return rota.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    // upload(): POST /object/fotos-torcida/<partida>/<clube>/<usuario>/<arquivo>; política: própria pasta, clube e membro.
    const caminho = decodeURIComponent(url.pathname.replace(/^.*\/object\/fotos-torcida\//, ''));
    const [, clube, dono] = caminho.split('/');
    if (!membro || dono !== usuario.id || clube !== String(perfil?.time_id)) {
      return rota.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"new row violates row-level security policy"}' });
    }
    const arquivo = arquivoDoMultipart(req.postDataBuffer() ?? Buffer.alloc(0), req.headers()['content-type'] ?? '');
    if (!arquivo) return rota.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"Arquivo não encontrado no corpo"}' });
    if (!['image/webp', 'image/jpeg'].includes(arquivo.tipo)) return rota.fulfill({ status: 415, contentType: 'application/json', body: '{"message":"mime type not supported"}' });
    this.arquivosDasFotos.set(caminho, arquivo);
    return rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: `fotos-torcida/${caminho}` }) });
  }

  private async printDoFeedback(rota: Route) {
    const req = rota.request();
    const usuario = this.usuarioDoToken(rota);
    const caminho = decodeURIComponent(new URL(req.url()).pathname.replace(/^.*\/object\/feedback\//, ''));
    // Bucket privado: só grava na pasta do próprio torcedor.
    if (!usuario || !caminho.startsWith(`${usuario.id}/`)) return rota.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"new row violates row-level security policy"}' });
    const arquivo = arquivoDoMultipart(req.postDataBuffer() ?? Buffer.alloc(0), req.headers()['content-type'] ?? '');
    if (!arquivo) return rota.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"Arquivo não encontrado no corpo"}' });
    this.prints.set(caminho, arquivo);
    return rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: `feedback/${caminho}` }) });
  }

  // ---------- /rest/v1 ----------

  private async rest(rota: Route) {
    const req = rota.request();
    const url = new URL(req.url());
    const caminho = url.pathname.replace(/^.*\/rest\/v1/, '');
    const usuario = this.usuarioDoToken(rota);
    const json = (status: number, dados: unknown) => rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify(dados) });

    if (caminho === '/rpc/apelido_disponivel') {
      const { apelido } = req.postDataJSON();
      return json(200, !this.apelidoEmUso(apelido, usuario?.id));
    }

    if (caminho === '/rpc/buscar_cidades') {
      const { termo, pais, limite } = req.postDataJSON();
      return json(200, buscarCidadesDeTeste(termo, pais, limite));
    }

    if (caminho === '/rpc/resumo_do_clube') {
      if (!usuario) return json(401, { code: '42501', message: 'permission denied for function resumo_do_clube' });
      return json(200, resumoDoClubeDeTeste([...this.perfis.values()], req.postDataJSON().clube));
    }

    if (caminho === '/rpc/meus_aparelhos') {
      if (!usuario) return json(401, { code: '42501', message: 'permission denied for function meus_aparelhos' });
      return json(200, [{ id: 'sessao-atual', user_agent: req.headers()['user-agent'] ?? null, criado_em: usuario.criado_em, usado_em: agora(), atual: true }]);
    }
    if (caminho === '/rpc/manter_minha_conta') {
      if (usuario) this.perfis.get(usuario.id)!.exclusao_agendada_para = null;
      return rota.fulfill({ status: 204 });
    }

    // ---------- convites ----------
    if (caminho === '/rpc/convite_de') {
      const dono = donoDoConvite(this.perfis.values(), req.postDataJSON().codigo);
      return json(200, dono ? [{ apelido: dono.apelido, clube: CLUBES_DE_TESTE.find((c) => c.id === dono.time_id)?.nome ?? null }] : []);
    }
    if (['/rpc/meu_convidador', '/rpc/aplicar_convite', '/rpc/meus_convidados', '/rpc/convites_restantes'].includes(caminho)) {
      if (!usuario) return json(401, { code: '42501', message: `permission denied for function ${caminho.slice(5)}` });
      if (caminho === '/rpc/meu_convidador') {
        const meu = this.perfis.get(usuario.id)?.convidado_por;
        return json(200, (meu && this.perfis.get(meu)?.apelido) ?? null);
      }
      if (caminho === '/rpc/aplicar_convite') {
        const r = aplicarConviteDeTeste(this.perfis, usuario.id, req.postDataJSON().codigo);
        return 'hint' in r ? json(400, { code: 'P0001', message: r.hint, hint: r.hint, details: null }) : json(200, r.apelido);
      }
      if (caminho === '/rpc/meus_convidados') {
        return json(200, convidadosDe(this.perfis.values(), this.convitesEmail, (id) => this.usuarios.get(id)?.email, usuario.id));
      }
      return json(200, Math.max(0, LIMITE_DE_CONVITES - convitesHoje(this.convitesEmail, usuario.id)));
    }

    if (['/rpc/registrar_foto', '/rpc/fotos_do_jogo', '/rpc/curtir_foto', '/rpc/denunciar_foto'].includes(caminho)) {
      if (!usuario) return json(401, { code: '42501', message: 'permission denied' });
      const eu = this.perfis.get(usuario.id);
      const assinante = this.assinaturas.some(
        (a) => a.usuario_id === usuario.id && ['ativa', 'atrasada', 'cancelada'].includes(a.status) && !!a.expira_em && new Date(a.expira_em) > new Date(),
      );
      const pedido = req.postDataJSON();
      if (caminho === '/rpc/fotos_do_jogo') return json(200, fotosDoJogoDeTeste(this.fotosDaTorcida, eu, assinante, pedido.p_partida));
      const r =
        caminho === '/rpc/registrar_foto'
          ? registrarFotoDeTeste(this.fotosDaTorcida, eu, assinante, this.partidas, pedido)
          : caminho === '/rpc/curtir_foto'
            ? curtirFotoDeTeste(this.fotosDaTorcida, eu, assinante, this.partidas, pedido.p_foto)
            : denunciarFotoDeTeste(this.fotosDaTorcida, eu, assinante, this.partidas, pedido.p_foto);
      return r && typeof r === 'object' ? json(400, { code: r.code, message: r.hint, hint: r.hint, details: null }) : json(200, r);
    }

    if (caminho === '/rpc/enviar_palpite' || caminho === '/rpc/meu_palpite' || caminho === '/rpc/escalacao_mais_votada' || caminho === '/rpc/palpites_da_torcida') {
      if (!usuario) return json(401, { code: '42501', message: 'permission denied' });
      const pedido = req.postDataJSON();
      if (caminho === '/rpc/meu_palpite') return json(200, meuPalpiteDeTeste(this.palpites, usuario.id, pedido.p_partida));
      const assinante = this.assinaturas.some(
        (a) => a.usuario_id === usuario.id && ['ativa', 'atrasada', 'cancelada'].includes(a.status) && !!a.expira_em && new Date(a.expira_em) > new Date(),
      );
      if (caminho === '/rpc/palpites_da_torcida') {
        return json(200, placaresDaTorcidaDeTeste(this.palpites, this.perfis.get(usuario.id), assinante, this.partidas, pedido.p_partida));
      }
      if (caminho === '/rpc/escalacao_mais_votada') {
        return json(200, maisVotadaDeTeste(this.palpites, this.perfis.get(usuario.id), assinante, this.partidas, this.elencos, pedido.p_partida));
      }
      const r = enviarPalpiteDeTeste(this.palpites, this.perfis.get(usuario.id), assinante, this.partidas, this.elencos, pedido);
      return r ? json(400, { code: r.code, message: r.hint, hint: r.hint, details: null }) : json(200, null);
    }

    if (caminho === '/rpc/enviar_notas' || caminho === '/rpc/notas_da_torcida') {
      if (!usuario) return json(401, { code: '42501', message: 'permission denied' });
      const perfil = this.perfis.get(usuario.id);
      const assinante = this.assinaturas.some(
        (a) => a.usuario_id === usuario.id && ['ativa', 'atrasada', 'cancelada'].includes(a.status) && !!a.expira_em && new Date(a.expira_em) > new Date(),
      );
      const { p_partida, p_notas } = req.postDataJSON();
      if (caminho === '/rpc/notas_da_torcida') return json(200, notasDaTorcidaDeTeste(this.notasJogadores, perfil, assinante, p_partida));
      const r = enviarNotasDeTeste(this.notasJogadores, perfil, assinante, this.partidas.find((p) => p.id === p_partida), this.detalhes.get(p_partida), p_notas);
      return typeof r === 'number' ? json(200, r) : json(400, { code: r.code, message: r.hint, hint: r.hint, details: null });
    }

    if (['/rpc/registrar_presenca', '/rpc/meu_xp', '/rpc/minha_presenca', '/rpc/meu_extrato', '/rpc/minhas_missoes', '/rpc/ranking_xp'].includes(caminho)) {
      if (!usuario) return json(401, { code: '42501', message: `permission denied for function ${caminho.slice(5)}` });
      const eu = this.perfis.get(usuario.id);
      const a = (req.postDataJSON() ?? {}) as { p_limite?: number; p_periodo?: string; p_clube?: number | null };
      if (caminho === '/rpc/registrar_presenca') return json(200, registrarPresencaDeTeste(this.xp, eu));
      if (caminho === '/rpc/meu_xp') return json(200, meuXpDeTeste(this.xp, eu));
      if (caminho === '/rpc/minha_presenca') return json(200, minhaPresencaDeTeste(this.xp, eu));
      if (caminho === '/rpc/meu_extrato') return json(200, extratoDeTeste(this.xp, eu, a.p_limite));
      if (caminho === '/rpc/minhas_missoes') return json(200, missoesDeTeste(this.xp, eu));
      return json(200, rankingDeTeste(this.xp, this.perfis.values(), eu, a));
    }

    if (caminho === '/xp_regras') {
      if (!usuario) return json(401, { code: '42501', message: 'permission denied for table xp_regras' });
      return json(200, this.xp.regras);
    }

    if (caminho === '/rpc/sou_assinante') {
      // Mesma regra da função sou_assinante() da migration.
      const valida = this.assinaturas.some(
        (a) => a.usuario_id === usuario?.id && ['ativa', 'atrasada', 'cancelada'].includes(a.status) && !!a.expira_em && new Date(a.expira_em) > new Date(),
      );
      return json(200, valida);
    }

    if (caminho === '/lembretes_palpite') {
      if (!usuario) return json(401, { code: '42501', message: 'permission denied for table lembretes_palpite' });
      const meus = (partida: number) => this.lembretes.filter((l) => l.usuario_id === usuario.id && l.partida_id === partida);
      if (req.method() === 'POST') {
        const { partida_id } = req.postDataJSON() as { partida_id: number };
        if (meus(partida_id).length) return json(409, { code: '23505', message: 'duplicate key value', details: null, hint: null });
        this.lembretes.push({ partida_id, usuario_id: usuario.id });
        return rota.fulfill({ status: 201, body: '' });
      }
      const partida = Number(url.searchParams.get('partida_id')?.replace(/^eq\./, ''));
      if (req.method() === 'DELETE') {
        for (const l of meus(partida)) this.lembretes.splice(this.lembretes.indexOf(l), 1);
        return rota.fulfill({ status: 204, body: '' });
      }
      return json(200, meus(partida).map((l) => ({ partida_id: l.partida_id })));
    }

    if (caminho === '/mensagens_chat') {
      if (!usuario) return json(401, { code: '42501', message: 'permission denied for table mensagens_chat' });
      const perfil = this.perfis.get(usuario.id);
      const assinante = this.assinaturas.some(
        (a) => a.usuario_id === usuario.id && ['ativa', 'atrasada', 'cancelada'].includes(a.status) && !!a.expira_em && new Date(a.expira_em) > new Date(),
      );
      if (req.method() === 'POST') {
        // Trigger mensagens_chat_antes_de_inserir: autor, torcida e foto vêm do servidor.
        const corpo = req.postDataJSON() as { partida_id: number; texto: string };
        const r = inserirMensagemDeTeste(this.mensagensChat, perfil, assinante, this.partidas.find((p) => p.id === corpo.partida_id), corpo.texto);
        if ('hint' in r) return json(400, { code: r.code, message: r.hint, hint: r.hint, details: null });
        return json(201, req.headers()['accept']?.includes('vnd.pgrst.object') ? r : [r]);
      }
      // RLS: membros leem o chat da própria torcida. Filtros: partida_id=eq.X, id=gt.N, order=id.desc|asc, limit.
      const partidaId = Number(url.searchParams.get('partida_id')?.replace(/^eq\./, ''));
      const depoisDe = Number(url.searchParams.get('id')?.replace(/^gt\./, '') ?? 0);
      const autor = url.searchParams.get('autor_id')?.replace(/^eq\./, '');
      let linhas = assinante
        ? this.mensagensChat.filter((m) => m.partida_id === partidaId && m.id > depoisDe && m.clube_id === perfil?.time_id && (!autor || m.autor_id === autor))
        : [];
      if (url.searchParams.get('order')?.includes('desc')) linhas = [...linhas].reverse();
      const limite = Number(url.searchParams.get('limit') ?? Infinity);
      const pagina = linhas.slice(0, limite);
      // Prefer: count=exact → o total vem no Content-Range, como no PostgREST.
      return rota.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Range': `0-${Math.max(pagina.length - 1, 0)}/${linhas.length}` },
        body: JSON.stringify(pagina),
      });
    }

    if (caminho === '/feedbacks') {
      if (!usuario) return json(401, { code: '42501', message: 'permission denied for table feedbacks' });
      const meus = () => this.feedbacks.filter((f) => f.usuario_id === usuario.id).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
      if (req.method() === 'POST') {
        // Trigger feedbacks_antes_de_inserir: quem envia, e-mail, estado e XP são do servidor.
        const corpo = req.postDataJSON() as Partial<FeedbackRow>;
        const comXp = meus().filter((f) => f.xp > 0 && new Date(f.criado_em) >= inicioDaSemana()).length;
        const linha: FeedbackRow = {
          id: crypto.randomUUID(),
          usuario_id: usuario.id,
          tipo: corpo.tipo!,
          area: corpo.area!,
          texto: corpo.texto!.trim(),
          anexo: corpo.anexo ?? null,
          dados_navegador: corpo.dados_navegador ?? null,
          pode_responder: !!corpo.pode_responder,
          email: corpo.pode_responder ? usuario.email : null,
          estado: 'recebido',
          resposta: null,
          xp: comXp < 2 ? 50 : 0,
          criado_em: agora(),
          atualizado_em: agora(),
        };
        this.feedbacks.push(linha);
        const umObjeto = req.headers()['accept']?.includes('vnd.pgrst.object');
        return json(201, umObjeto ? linha : [linha]);
      }
      return json(200, meus());
    }

    if (caminho === '/assinaturas') {
      if (!usuario) return json(401, { code: '42501', message: 'permission denied for table assinaturas' });
      // RLS: só as próprias; o app pede a mais recente (order=criado_em.desc&limit=1).
      const linhas = this.assinaturas.filter((a) => a.usuario_id === usuario.id).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
      const limite = Number(url.searchParams.get('limit') ?? linhas.length);
      const umObjeto = req.headers()['accept']?.includes('vnd.pgrst.object');
      return json(200, umObjeto ? linhas[0] ?? null : linhas.slice(0, limite));
    }

    if (caminho === '/partidas') {
      if (!usuario) return json(401, { code: '42501', message: 'permission denied for table partidas' });
      // Página do jogo: id=eq.X, um objeto só.
      const id = url.searchParams.get('id');
      if (id) {
        const partida = this.partidas.find((p) => p.id === Number(id.replace(/^eq\./, '')));
        return req.headers()['accept']?.includes('vnd.pgrst.object') ? json(partida ? 200 : 406, partida ?? { code: 'PGRST116' }) : json(200, partida ? [partida] : []);
      }
      // O app pede os jogos de um clube: or=(mandante_id.eq.X,visitante_id.eq.X)&order=inicio.asc.
      const clubeId = Number(/mandante_id\.eq\.(\d+)/.exec(url.searchParams.get('or') ?? '')?.[1]);
      return json(200, jogosDoClubeDeTeste(this.partidas, clubeId));
    }

    if (caminho === '/competicoes' || caminho === '/classificacao') {
      if (!usuario) return json(401, { code: '42501', message: `permission denied for table ${caminho.slice(1)}` });
      // O app filtra por liga: liga_id=in.(9,32,35).
      const ids = (url.searchParams.get('liga_id') ?? '').replace(/^in\.\(|\)$/g, '').split(',').map(Number);
      const linhas: { liga_id: number }[] = caminho === '/competicoes' ? this.competicoes : this.classificacao;
      return json(200, linhas.filter((l) => ids.includes(l.liga_id)));
    }

    // Catálogo: leitura pública, sem sessão.
    if (caminho === '/paises') return json(200, PAISES_DE_TESTE);
    if (caminho === '/clubes') return json(200, clubesDoPais(url.searchParams.get('pais')?.replace(/^eq\./, '') ?? ''));

    if (caminho === '/perfis') {
      if (!usuario) return json(401, { code: '42501', message: 'permission denied for table perfis' });
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      // RLS: cada um só enxerga e edita o próprio perfil.
      const perfil = id === usuario.id ? this.perfis.get(id) : undefined;
      const umObjeto = req.headers()['accept']?.includes('vnd.pgrst.object');

      if (req.method() === 'PATCH') {
        if (!perfil) return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
        const campos = req.postDataJSON() as Partial<Perfil>;
        const proibido = Object.keys(campos).find((c) => !COLUNAS_EDITAVEIS.includes(c));
        if (proibido) return json(403, { code: '42501', message: `permission denied for column ${proibido}` });
        if (campos.apelido && this.apelidoEmUso(campos.apelido, perfil.id)) {
          return json(409, { code: '23505', message: 'duplicate key value violates unique constraint "perfis_apelido_unico"' });
        }
        // Trigger perfis_antes_de_atualizar: datas só podem ser marcadas uma vez e com o horário do servidor.
        const novo = { ...perfil, ...campos, atualizado_em: agora() };
        novo.termos_aceitos_em = perfil.termos_aceitos_em ?? (campos.termos_aceitos_em ? agora() : null);
        novo.onboarding_concluido_em = perfil.onboarding_concluido_em ?? (campos.onboarding_concluido_em ? agora() : null);
        // Troca de time: livre no onboarding; depois dele, uma única vez, com o país do clube novo.
        novo.time_anterior_id = perfil.time_anterior_id;
        novo.time_trocado_em = perfil.time_trocado_em;
        // O convite conta quando o convidado conclui o onboarding.
        novo.convite_contou_em = !perfil.onboarding_concluido_em && novo.onboarding_concluido_em && perfil.convidado_por ? agora() : perfil.convite_contou_em;
        if (campos.time_id !== undefined && campos.time_id !== perfil.time_id && perfil.onboarding_concluido_em) {
          if (perfil.time_trocado_em) return json(400, { code: 'P0001', message: 'A troca de time já foi usada', hint: 'troca_usada' });
          novo.time_anterior_id = perfil.time_id;
          novo.time_trocado_em = agora();
          novo.pais = CLUBES_DE_TESTE.find((c) => c.id === campos.time_id)?.pais ?? novo.pais;
        }
        if (novo.time_id !== null && !CLUBES_DE_TESTE.some((c) => c.id === novo.time_id)) {
          return json(409, { code: '23503', message: 'insert or update on table "perfis" violates foreign key constraint "perfis_time_id_fkey"' });
        }
        if (novo.onboarding_concluido_em && !(novo.apelido && novo.pais && novo.time_id && novo.termos_aceitos_em)) {
          return json(400, { code: '23514', message: 'new row violates check constraint "perfis_onboarding_completo"' });
        }
        this.perfis.set(perfil.id, novo);
        return json(200, umObjeto ? comCatalogo(novo) : [comCatalogo(novo)]);
      }

      // O app pede o perfil com o clube e o país embutidos (select=*,clube:clubes(...),pais_dados:paises(...)).
      const linhas = perfil ? [comCatalogo(perfil)] : [];
      return json(200, umObjeto ? linhas[0] : linhas);
    }

    return json(404, { message: `Rota falsa não implementada: ${req.method()} ${caminho}` });
  }
}
