import { describe, expect, it } from 'vitest';
import { htmlDoCodigoDeCobranca, REMETENTE, textoDoCodigoDeCobranca } from './emailCodigoCobranca';

describe('e-mail do código de cobrança', () => {
  it('sai do no-reply do domínio verificado no Resend', () => {
    expect(REMETENTE).toBe('Torcida Online <no-reply@torcidaonline.com.br>');
  });

  it('mostra o código e o endereço no HTML e no texto, sem link', () => {
    const html = htmlDoCodigoDeCobranca('482913', 'financeiro@email.com');
    expect(html).toContain('482913');
    expect(html).toContain('financeiro@email.com');
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).not.toMatch(/href="https:\/\/app\./);
    expect(textoDoCodigoDeCobranca('482913')).toContain('482913');
  });
});
