// Edge Function (Deno): POST /functions/v1/convidar-amigos { acao: 'enviar', emails, mensagem? } | { acao: 'reenviar', email }.
// As regras estão em handler.ts; aqui ficam o banco (RPCs com service_role) e o envio pelo Resend.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { assuntoDoConvite, htmlDoConvite, textoDoConvite } from '../_compartilhado/emailConvite.ts';
import { enviarPeloResend } from '../_compartilhado/resend.ts';
import { convidarAmigos, RecusaDoBanco } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ErroDoBanco = { message: string; hint?: string; details?: string } | null;

/** Erro com hint conhecido vira RecusaDoBanco; o resto é falha de verdade. */
function conferir<T>(onde: string, { data, error }: { data: T | null; error: ErroDoBanco }): T {
  if (error?.hint) throw new RecusaDoBanco(error.hint, error.details || undefined);
  if (error) throw new Error(`${onde}: ${error.message}`);
  return data as T;
}

Deno.serve((req) =>
  convidarAmigos(req, {
    async usuarioDoToken(jwt) {
      const { data } = await admin.auth.getUser(jwt);
      return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
    },
    async registrar(usuarioId, emails, mensagem) {
      const linhas = conferir('registrar', await admin.rpc('registrar_convites', { p_convidador: usuarioId, p_emails: emails, p_mensagem: mensagem }));
      return (linhas as { apelido: string; clube: string | null }[])[0];
    },
    async registrarReenvio(usuarioId, email) {
      const linhas = conferir('registrarReenvio', await admin.rpc('registrar_reenvio', { p_convidador: usuarioId, p_email: email }));
      return (linhas as { apelido: string; clube: string | null; mensagem: string | null }[])[0];
    },
    async desfazer(usuarioId, emails, reenvio) {
      conferir('desfazer', await admin.rpc('desfazer_convites', { p_convidador: usuarioId, p_emails: emails, p_reenvio: reenvio }));
    },
    enviarConvite: (para, convite) =>
      enviarPeloResend({ para, assunto: assuntoDoConvite(convite), html: htmlDoConvite(convite, para), texto: textoDoConvite(convite) }),
  }),
);
