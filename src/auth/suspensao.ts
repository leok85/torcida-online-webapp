// Conta suspensa pela equipe: o Supabase Auth recusa login e renovação com error_code 'user_banned'. O login mostra o
// erro na própria tela; a renovação derruba a sessão em silêncio, então o recado vai para a tela de entrar.
import { guardarAvisoDeEntrada } from './avisoDeEntrada';

export const MENSAGEM_SUSPENSO = 'Sua conta está suspensa. Fale com o suporte.';

const urlDe = (input: RequestInfo | URL) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

/** fetch do cliente Supabase: se a renovação da sessão volta 'user_banned', deixa o recado antes de a sessão cair. */
export function criarFetchQueAvisaSuspensao(base: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  return async (input, init) => {
    const resposta = await base(input, init);
    const url = urlDe(input);
    if (resposta.status === 400 && url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token')) {
      const corpo = (await resposta.clone().json().catch(() => null)) as { error_code?: string; code?: string } | null;
      if (corpo?.error_code === 'user_banned' || corpo?.code === 'user_banned') guardarAvisoDeEntrada(MENSAGEM_SUSPENSO);
    }
    return resposta;
  };
}

/** Volta do Google com a conta suspensa: o Supabase redireciona com error_code=user_banned na query ou no hash. */
export function avisarSuspensaoDoRedirect(local: Pick<Location, 'search' | 'hash'> = window.location) {
  const erro = new URLSearchParams(local.search).get('error_code') ?? new URLSearchParams(local.hash.replace(/^#/, '')).get('error_code');
  if (erro === 'user_banned') guardarAvisoDeEntrada(MENSAGEM_SUSPENSO);
}
