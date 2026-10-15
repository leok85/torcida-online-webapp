import { AuthApiError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { lerAvisoDeEntrada } from './avisoDeEntrada';
import { mensagemDeErro } from './erros';
import { avisarSuspensaoDoRedirect, criarFetchQueAvisaSuspensao, MENSAGEM_SUSPENSO } from './suspensao';

const BANIDO = { code: 400, error_code: 'user_banned', msg: 'User is banned' };
const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

describe('conta suspensa', () => {
  it('login recusado com user_banned mostra a suspensão', () => {
    expect(mensagemDeErro(new AuthApiError('User is banned', 400, 'user_banned'))).toBe(MENSAGEM_SUSPENSO);
  });

  it('renovação recusada com user_banned deixa o recado para a tela de entrar, sem mexer na resposta', async () => {
    const base = vi.fn(async () => resposta(400, BANIDO));
    const r = await criarFetchQueAvisaSuspensao(base)('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' });
    expect(await r.json()).toEqual(BANIDO);
    expect(lerAvisoDeEntrada()).toBe(MENSAGEM_SUSPENSO);
  });

  it('outros erros e o login com senha não deixam recado', async () => {
    const f = criarFetchQueAvisaSuspensao(async () => resposta(400, { error_code: 'refresh_token_not_found' }));
    await f('https://x.supabase.co/auth/v1/token?grant_type=refresh_token');
    // No login com senha o erro aparece na própria tela.
    await criarFetchQueAvisaSuspensao(async () => resposta(400, BANIDO))('https://x.supabase.co/auth/v1/token?grant_type=password');
    await criarFetchQueAvisaSuspensao(async () => resposta(200, { ok: true }))(new URL('https://x.supabase.co/rest/v1/perfis'));
    expect(lerAvisoDeEntrada()).toBeNull();
  });

  it('volta do Google com a conta suspensa (query ou hash)', () => {
    avisarSuspensaoDoRedirect({ search: '?error=access_denied&error_code=user_banned&error_description=User+is+banned', hash: '' });
    expect(lerAvisoDeEntrada()).toBe(MENSAGEM_SUSPENSO);
    sessionStorage.clear();
    avisarSuspensaoDoRedirect({ search: '', hash: '#error=access_denied&error_code=user_banned' });
    expect(lerAvisoDeEntrada()).toBe(MENSAGEM_SUSPENSO);
    sessionStorage.clear();
    avisarSuspensaoDoRedirect({ search: '?error_code=otp_expired', hash: '' });
    expect(lerAvisoDeEntrada()).toBeNull();
  });
});
