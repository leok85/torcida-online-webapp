import { describe, expect, it } from 'vitest';
import { assuntoDoConvite, htmlDoConvite, textoDoConvite } from './emailConvite';

const convite = { apelido: 'Rafa_9', clube: 'Palmeiras', mensagem: 'Bora torcer junto!', link: 'https://app.torcidaonline.com.br/r/Rafa_9' };

describe('e-mail do convite', () => {
  it('assunto com quem chamou e o clube, como no design', () => {
    expect(assuntoDoConvite(convite)).toBe('Rafa_9 te chamou para a torcida do Palmeiras');
    expect(assuntoDoConvite({ ...convite, clube: null })).toBe('Rafa_9 te chamou para a Torcida Online');
  });

  it('leva o link do convite no botão e no texto, com o recado', () => {
    const html = htmlDoConvite(convite, 'pedro@email.com');
    expect(html).toContain('href="https://app.torcidaonline.com.br/r/Rafa_9"');
    expect(html).toContain('Aceitar o convite');
    expect(html).toContain('Bora torcer junto!');
    expect(html).toContain('pedro@email.com');
    expect(textoDoConvite(convite)).toContain('https://app.torcidaonline.com.br/r/Rafa_9');
  });

  it('sem recado, não mostra o bloco do recado', () => {
    expect(htmlDoConvite({ ...convite, mensagem: null }, 'pedro@email.com')).not.toContain('Recado de');
  });

  it('escapa o recado digitado pelo torcedor', () => {
    const html = htmlDoConvite({ ...convite, mensagem: '<a href="https://golpe.example">ganhe</a>' }, 'pedro@email.com');
    expect(html).not.toContain('<a href="https://golpe.example">');
    expect(html).toContain('&lt;a href=&quot;https://golpe.example&quot;&gt;ganhe&lt;/a&gt;');
  });
});
