import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { mensagemDeErro } from './erros';

describe('mensagemDeErro', () => {
  it.each([
    ['invalid_credentials', 'E-mail ou senha incorretos.'],
    ['email_not_confirmed', 'Você ainda não confirmou seu e-mail.'],
    ['otp_expired', 'Código inválido ou expirado. Confira os números ou peça um novo.'],
    ['same_password', 'A nova senha precisa ser diferente da atual.'],
    ['over_email_send_rate_limit', 'Muitos e-mails enviados em pouco tempo. Espere um minuto e tente de novo.'],
  ])('traduz o código %s', (codigo, mensagem) => {
    expect(mensagemDeErro(new AuthApiError('mensagem em inglês', 400, codigo))).toBe(mensagem);
  });

  it('trata falha de rede como sem conexão', () => {
    expect(mensagemDeErro(new AuthRetryableFetchError('Failed to fetch', 0))).toMatch(/Sem conexão/);
  });

  it('usa a mensagem de limite quando só vem o status 429', () => {
    expect(mensagemDeErro(new AuthApiError('Too many requests', 429, 'codigo_novo'))).toMatch(/Muitas tentativas/);
  });

  it('nunca mostra a mensagem crua em inglês', () => {
    expect(mensagemDeErro(new AuthApiError('Database error saving new user', 500, 'unexpected_failure'))).toBe(
      'Algo deu errado. Tente de novo em instantes.',
    );
    expect(mensagemDeErro(new Error('boom'))).toBe('Algo deu errado. Tente de novo em instantes.');
  });
});
