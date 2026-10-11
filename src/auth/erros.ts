import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js';

// Códigos em https://supabase.com/docs/guides/auth/debugging/error-codes
const MENSAGENS: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Você ainda não confirmou seu e-mail.',
  user_already_exists: 'Já existe uma conta com esse e-mail.',
  email_exists: 'Já existe uma conta com esse e-mail.',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres, misturando letras, números e símbolos.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  otp_expired: 'Código inválido ou expirado. Confira os números ou peça um novo.',
  over_email_send_rate_limit: 'Muitos e-mails enviados em pouco tempo. Espere um minuto e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
  email_address_invalid: 'Esse e-mail não é aceito. Confira o endereço digitado.',
  signup_disabled: 'Novos cadastros estão fechados no momento.',
  email_provider_disabled: 'O login por e-mail está desativado no momento.',
  user_banned: 'Esta conta está suspensa. Fale com o suporte.',
  session_expired: 'Sua sessão expirou. Entre de novo.',
  validation_failed: 'Confira os dados informados.',
};

export function mensagemDeErro(erro: unknown): string {
  if (isAuthRetryableFetchError(erro)) return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
  if (isAuthError(erro)) {
    if (erro.code && MENSAGENS[erro.code]) return MENSAGENS[erro.code];
    if (erro.status === 429) return MENSAGENS.over_request_rate_limit;
  }
  return 'Algo deu errado. Tente de novo em instantes.';
}
