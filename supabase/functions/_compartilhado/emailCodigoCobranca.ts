// E-mail com o código que confirma o e-mail de cobrança (W18). Mesmo visual dos templates do Supabase Auth
// (supabase/templates), que seguem o "Email Template.html" do Claude Design.

/** Mesmo remetente dos e-mails do Supabase Auth (SMTP do Resend). */
export const REMETENTE = 'Torcida Online <no-reply@torcidaonline.com.br>';

export const ASSUNTO_CODIGO_COBRANCA = 'Confirme o e-mail de cobrança - Torcida Online';

export function textoDoCodigoDeCobranca(codigo: string) {
  return [
    'Torcida Online · E-mail de cobrança',
    '',
    `Digite este código em Minha assinatura para receber os avisos de cobrança neste e-mail: ${codigo}`,
    '',
    'O código vale por 15 minutos.',
    'Não pediu? Ignore este e-mail: sem o código, os avisos continuam indo para o endereço de antes.',
  ].join('\n');
}

export function htmlDoCodigoDeCobranca(codigo: string, para: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${ASSUNTO_CODIGO_COBRANCA}</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF1F5;">
<span style="display:none;font-size:1px;color:#EEF1F5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Digite o código em Minha assinatura para receber os avisos de cobrança aqui. Ele vale por 15 minutos.</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#EEF1F5;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#FFFFFF;border-radius:14px;overflow:hidden;">
    <tr><td width="600" style="background-color:#091D37;padding:34px 34px 30px 34px;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;color:#7FDD4A;line-height:14px;">TORCIDA ONLINE</p>
      <p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:31px;font-weight:bold;color:#FFFFFF;line-height:35px;">E-mail de cobrança</p>
      <p style="margin:14px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#B8C6D9;line-height:24px;">Recibos, avisos de renovação e falhas no pagamento.</p>
    </td></tr>
    <tr><td width="600" style="padding:30px 34px 0 34px;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#33425C;line-height:25px;">Digite este código em Minha assinatura para receber os avisos de cobrança neste e-mail:</p>
    </td></tr>
    <tr><td width="600" style="padding:20px 34px 0 34px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td width="100%" align="center" style="background-color:#F6F8FB;border:1px solid #E1E7EF;border-radius:10px;padding:20px 18px;">
          <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;letter-spacing:10px;color:#00419B;line-height:40px;">${codigo}</p>
        </td>
      </tr></table>
    </td></tr>
    <tr><td width="600" align="center" style="padding:16px 34px 30px 34px;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6E7C93;line-height:20px;">O código vale por 15 minutos. Se expirar, é só pedir outro na mesma tela.</p>
    </td></tr>
    <tr><td width="600" style="background-color:#F6F8FB;border-top:1px solid #E1E7EF;padding:22px 34px;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#33425C;line-height:21px;">Não pediu? Ignore este e-mail: sem o código, os avisos continuam indo para o endereço de antes. O login da conta não muda.</p>
    </td></tr>
    <tr><td width="600" style="background-color:#091D37;padding:24px 34px;">
      <img src="https://torcidaonline.com.br/assets/shield-white.png" alt="Torcida Online" width="28" style="display:block;width:28px;height:auto;border:0;margin:0 0 14px 0;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8FA1B8;line-height:19px;">Torcida Online · <a href="https://torcidaonline.com.br" style="color:#B8C6D9;text-decoration:underline;">torcidaonline.com.br</a></p>
      <p style="margin:12px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8FA1B8;line-height:19px;">Você recebeu este e-mail porque alguém pediu para mandar os avisos de cobrança da Torcida Online para ${para}.</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
