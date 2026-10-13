// Envio pela API do Resend (só no Deno). A chave é o segredo RESEND_API_KEY das Edge Functions.
import { CorreioIndisponivel } from './assinatura.ts';
import { REMETENTE } from './emailCodigoCobranca.ts';

export async function enviarPeloResend(email: { para: string; assunto: string; html: string; texto: string }) {
  const chave = Deno.env.get('RESEND_API_KEY');
  if (!chave) throw new CorreioIndisponivel();
  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REMETENTE, to: [email.para], subject: email.assunto, html: email.html, text: email.texto }),
  });
  if (!resposta.ok) throw new Error(`Resend ${resposta.status}: ${await resposta.text()}`);
}
