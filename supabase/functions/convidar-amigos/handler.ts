// Convites por e-mail do modal "Chame a torcida e ganhe junto": envia até 10 por dia e reenvia uma vez cada.
// O banco (registrar_convites e registrar_reenvio) guarda o convite e confere duplicados e o limite antes do envio;
// se o e-mail não sai, o registro é desfeito. Fica separado do index.ts para os testes do Vitest chamarem direto.
import { CorreioIndisponivel } from '../_compartilhado/assinatura.ts';
import { CORS, json, jwtDe, lerCorpo, origemDoApp } from '../_compartilhado/http.ts';

/** Sem espaços, aspas nem sinais de tag: o endereço vai no corpo do e-mail. */
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
export const LIMITE_POR_DIA = 10;
export const TAMANHO_DA_MENSAGEM = 280;

/** Erro de regra vindo do banco (hint da exceção do Postgres). */
export class RecusaDoBanco extends Error {
  constructor(
    readonly motivo: string,
    readonly detalhe?: string,
  ) {
    super(motivo);
  }
}

export type DadosDoConvite = { apelido: string; clube: string | null; mensagem: string | null; link: string };

export type Dependencias = {
  usuarioDoToken(jwt: string): Promise<{ id: string; email: string | null } | null>;
  /** Grava os convites; lança RecusaDoBanco (sem_apelido, ja_convidado, limite_diario). */
  registrar(usuarioId: string, emails: string[], mensagem: string | null): Promise<{ apelido: string; clube: string | null }>;
  /** Marca o reenvio; lança RecusaDoBanco (nao_convidado, ja_reenviado, limite_diario). */
  registrarReenvio(usuarioId: string, email: string): Promise<{ apelido: string; clube: string | null; mensagem: string | null }>;
  desfazer(usuarioId: string, emails: string[], reenvio: boolean): Promise<void>;
  /** Lança CorreioIndisponivel quando não há chave do provedor configurada. */
  enviarConvite(para: string, convite: DadosDoConvite): Promise<void>;
};

const STATUS: Record<string, number> = { ja_convidado: 409, ja_reenviado: 409, nao_convidado: 404, limite_diario: 429, sem_apelido: 409 };

export async function convidarAmigos(req: Request, deps: Dependencias): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { erro: 'metodo_nao_permitido' });

  const jwt = jwtDe(req);
  const usuario = jwt ? await deps.usuarioDoToken(jwt) : null;
  if (!usuario) return json(401, { erro: 'sem_sessao' });

  const corpo = await lerCorpo(req);
  const linkDe = (apelido: string) => `${origemDoApp(req)}/r/${encodeURIComponent(apelido)}`;

  if (corpo.acao === 'enviar') {
    const lista = Array.isArray(corpo.emails) ? corpo.emails : [];
    const emails = [...new Set(lista.map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : '')))];
    if (!emails.length || emails.length > LIMITE_POR_DIA) return json(400, { erro: 'emails_invalidos' });
    const invalido = emails.find((e) => e.length > 254 || !EMAIL.test(e));
    if (invalido !== undefined) return json(400, { erro: 'email_invalido', email: invalido });
    if (usuario.email && emails.includes(usuario.email.toLowerCase())) return json(400, { erro: 'proprio_email' });
    const mensagem = typeof corpo.mensagem === 'string' ? corpo.mensagem.trim() || null : null;
    if (mensagem && mensagem.length > TAMANHO_DA_MENSAGEM) return json(400, { erro: 'mensagem_longa' });

    let dados;
    try {
      dados = await deps.registrar(usuario.id, emails, mensagem);
    } catch (e) {
      return recusa(e);
    }
    const convite = { ...dados, mensagem, link: linkDe(dados.apelido) };
    const falharam: string[] = [];
    for (const email of emails) {
      try {
        await deps.enviarConvite(email, convite);
      } catch (e) {
        // Sem chave do provedor nenhum e-mail sai: desfaz todos.
        if (e instanceof CorreioIndisponivel) {
          await deps.desfazer(usuario.id, emails, false);
          return json(503, { erro: 'email_indisponivel' });
        }
        falharam.push(email);
      }
    }
    if (falharam.length) await deps.desfazer(usuario.id, falharam, false);
    if (falharam.length === emails.length) return json(502, { erro: 'falha_no_envio' });
    return json(200, { enviados: emails.filter((e) => !falharam.includes(e)), falharam });
  }

  if (corpo.acao === 'reenviar') {
    const email = typeof corpo.email === 'string' ? corpo.email.trim().toLowerCase() : '';
    if (!EMAIL.test(email)) return json(400, { erro: 'email_invalido', email });
    let dados;
    try {
      dados = await deps.registrarReenvio(usuario.id, email);
    } catch (e) {
      return recusa(e);
    }
    try {
      await deps.enviarConvite(email, { ...dados, link: linkDe(dados.apelido) });
    } catch (e) {
      await deps.desfazer(usuario.id, [email], true);
      return e instanceof CorreioIndisponivel ? json(503, { erro: 'email_indisponivel' }) : json(502, { erro: 'falha_no_envio' });
    }
    return json(200, { ok: true });
  }

  return json(400, { erro: 'acao_invalida' });
}

function recusa(e: unknown) {
  if (e instanceof RecusaDoBanco && STATUS[e.motivo]) return json(STATUS[e.motivo], { erro: e.motivo, ...(e.detalhe && { email: e.detalhe }) });
  throw e;
}
