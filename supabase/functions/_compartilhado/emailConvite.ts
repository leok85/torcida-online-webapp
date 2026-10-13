// E-mail do convite por e-mail (modal "Chame a torcida e ganhe junto"). Segue o "Email Template.html" do
// Claude Design: cabeçalho escuro, cartão de destaque com o recado do amigo e botão verde de conversão.

export type Convite = { apelido: string; clube: string | null; mensagem: string | null; link: string };

/** Apelido, clube e recado vêm do banco e do torcedor: tudo entra escapado no HTML. */
export const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const daTorcida = (clube: string | null) => (clube ? `a torcida do ${clube}` : 'a Torcida Online');

export const assuntoDoConvite = ({ apelido, clube }: Convite) => `${apelido} te chamou para ${daTorcida(clube)}`;

export function textoDoConvite(c: Convite) {
  return [
    assuntoDoConvite(c),
    '',
    ...(c.mensagem ? [`"${c.mensagem}"`, ''] : []),
    'Palpite, chat ao vivo, missões da semana e moedas para trocar na loja. Criando a conta por este convite, vocês dois ganham 100 XP.',
    '',
    `Aceitar o convite: ${c.link}`,
    '',
    `Você recebeu este e-mail porque ${c.apelido} te convidou pela Torcida Online. Não conhece? É só ignorar.`,
  ].join('\n');
}

export function htmlDoConvite(c: Convite, para: string) {
  const apelido = escapar(c.apelido);
  const link = escapar(c.link);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapar(assuntoDoConvite(c))}</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF1F5;">
<span style="display:none;font-size:1px;color:#EEF1F5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Criando a conta por este convite, vocês dois ganham 100 XP.</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#EEF1F5;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#FFFFFF;border-radius:14px;overflow:hidden;">
    <tr><td width="600" style="background-color:#091D37;padding:34px 34px 30px 34px;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;color:#7FDD4A;line-height:14px;">TORCIDA ONLINE · CONVITE</p>
      <p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:31px;font-weight:bold;color:#FFFFFF;line-height:35px;">${apelido} te chamou para ${escapar(daTorcida(c.clube))}</p>
      <p style="margin:14px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#B8C6D9;line-height:24px;">Palpite, chat ao vivo, missões da semana e moedas para trocar na loja.</p>
    </td></tr>
    <tr><td width="600" style="padding:30px 34px 0 34px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${
  c.mensagem
    ? `        <tr><td width="100%" style="background-color:#F6F8FB;border:1px solid #E1E7EF;border-radius:10px;padding:16px 18px;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#6E7C93;line-height:18px;">Recado de ${apelido}</p>
          <p style="margin:6px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#091D37;line-height:22px;">${escapar(c.mensagem)}</p>
        </td></tr>
        <tr><td height="10" style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr>
`
    : ''
}        <tr><td width="100%" style="background-color:#FFF8E8;border:1px solid #F0DFB4;border-radius:10px;padding:16px 18px;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#5C4A1E;line-height:20px;">+100 XP para você e para ${apelido}</p>
          <p style="margin:6px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#5C4A1E;line-height:21px;">Crie a conta por este convite e escolha seu clube. O convite já vai aplicado, não precisa digitar código.</p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td width="600" align="center" style="padding:28px 34px 8px 34px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="#3FA414" style="border-radius:10px;">
          <a href="${link}" style="display:block;padding:16px 34px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;line-height:20px;">Aceitar o convite</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td width="600" align="center" style="padding:12px 34px 30px 34px;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6E7C93;line-height:20px;">Leva menos de um minuto. Depois você entra no app com o mesmo login.</p>
    </td></tr>
    <tr><td width="600" style="background-color:#091D37;padding:24px 34px;">
      <img src="https://torcidaonline.com.br/assets/shield-white.png" alt="Torcida Online" width="28" style="display:block;width:28px;height:auto;border:0;margin:0 0 14px 0;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8FA1B8;line-height:19px;">Torcida Online · <a href="https://torcidaonline.com.br" style="color:#B8C6D9;text-decoration:underline;">torcidaonline.com.br</a></p>
      <p style="margin:12px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8FA1B8;line-height:19px;">Você recebeu este e-mail em ${escapar(para)} porque ${apelido} te convidou pela Torcida Online. Não conhece? É só ignorar.</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
