// Supabase falso para o Playwright: intercepta /auth/v1 e /rest/v1 no navegador e guarda tudo em memória.
// Reproduz as regras do servidor que o app depende (supabase/migrations): perfil criado no cadastro, apelido único,
// datas de aceite e onboarding definidas pelo servidor. Os "e-mails" ficam em `emails` para o teste ler o código.
import type { BrowserContext, Route } from '@playwright/test';
import { clubesDoPais, CLUBES_DE_TESTE, comCatalogo, PAISES_DE_TESTE } from '../src/test/catalogoDeTeste';

type Perfil = {
  id: string;
  nome: string;
  apelido: string | null;
  pais: string | null;
  time_id: number | null;
  nascimento: string | null;
  cidade: string | null;
  quer_avisos: boolean;
  quer_novidades: boolean;
  termos_aceitos_em: string | null;
  onboarding_concluido_em: string | null;
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
type Email = { para: string; tipo: 'signup' | 'recovery'; codigo: string };

const APELIDO_VALIDO = /^[A-Za-z0-9._]{3,20}$/;
const COLUNAS_EDITAVEIS = ['nome', 'apelido', 'pais', 'time_id', 'nascimento', 'cidade', 'quer_avisos', 'quer_novidades', 'termos_aceitos_em', 'onboarding_concluido_em'];

const base64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const agora = () => new Date().toISOString();

export class BackendFalso {
  readonly usuarios = new Map<string, Usuario>();
  readonly perfis = new Map<string, Perfil>();
  readonly emails: Email[] = [];
  readonly assinaturas: Assinatura[] = [];
  private readonly codigos = new Map<string, { codigo: string; tipo: Email['tipo'] }>();
  private readonly tokens = new Map<string, string>();
  private sequencia = 0;
  /** Provedores sociais ligados (resposta de /auth/v1/settings). */
  provedores: Record<string, boolean> = { email: true, google: false };

  async instalar(contexto: BrowserContext) {
    await contexto.route('**/auth/v1/**', (rota) => this.auth(rota));
    await contexto.route('**/rest/v1/**', (rota) => this.rest(rota));
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
      quer_avisos: true,
      quer_novidades: metadata.quer_novidades === true,
      termos_aceitos_em: metadata.aceitou_termos === true ? agora() : null,
      onboarding_concluido_em: null,
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
        usuario.senha = corpo.password;
      }
      return json(200, this.usuarioPublico(usuario));
    }

    if (caminho === '/logout') return rota.fulfill({ status: 204 });

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
    if (nome === 'gerenciar-assinatura') {
      if (corpo.acao === 'portal') return json(200, { url: 'https://billing.stripe.com/p/session/e2e' });
      const web = this.assinaturas.find((a) => a.usuario_id === usuario.id && a.origem === 'web' && ['ativa', 'cancelada', 'atrasada'].includes(a.status));
      if (!web || !['cancelar', 'reativar'].includes(corpo.acao)) return json(404, { erro: 'sem_assinatura_web' });
      web.status = corpo.acao === 'cancelar' ? 'cancelada' : 'ativa';
      return json(200, { status: web.status, expira_em: web.expira_em });
    }
    return json(404, { erro: `Função falsa não implementada: ${nome}` });
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

    if (caminho === '/rpc/sou_assinante') {
      // Mesma regra da função sou_assinante() da migration.
      const valida = this.assinaturas.some(
        (a) => a.usuario_id === usuario?.id && ['ativa', 'atrasada', 'cancelada'].includes(a.status) && !!a.expira_em && new Date(a.expira_em) > new Date(),
      );
      return json(200, valida);
    }

    if (caminho === '/assinaturas') {
      if (!usuario) return json(401, { code: '42501', message: 'permission denied for table assinaturas' });
      // RLS: só as próprias; o app pede a mais recente (order=criado_em.desc&limit=1).
      const linhas = this.assinaturas.filter((a) => a.usuario_id === usuario.id).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
      const limite = Number(url.searchParams.get('limit') ?? linhas.length);
      const umObjeto = req.headers()['accept']?.includes('vnd.pgrst.object');
      return json(200, umObjeto ? linhas[0] ?? null : linhas.slice(0, limite));
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
