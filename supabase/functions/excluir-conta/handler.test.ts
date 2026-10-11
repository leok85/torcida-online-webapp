import { describe, expect, it, vi } from 'vitest';
import { excluirConta, type ClienteAdmin } from './handler';

function adminFalso({ usuario = { id: 'usuario-1' } as { id: string } | null, erroExclusao = null as unknown } = {}) {
  const getUser = vi.fn(async (jwt: string) =>
    jwt === 'token-valido' && usuario ? { data: { user: usuario }, error: null } : { data: { user: null }, error: new Error('invalid JWT') },
  );
  const deleteUser = vi.fn(async (_id: string) => ({ error: erroExclusao }));
  const admin: ClienteAdmin = { auth: { getUser, admin: { deleteUser } } };
  return { admin, getUser, deleteUser };
}

const pedido = (init: RequestInit = {}) =>
  new Request('http://supabase.test/functions/v1/excluir-conta', { method: 'POST', ...init });

describe('excluir-conta', () => {
  it('exclui a conta dona do token e responde ok', async () => {
    const { admin, deleteUser } = adminFalso();
    const resposta = await excluirConta(pedido({ headers: { Authorization: 'Bearer token-valido' } }), admin);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledWith('usuario-1');
  });

  it('ignora qualquer id mandado no corpo: só apaga quem está logado', async () => {
    const { admin, deleteUser } = adminFalso();
    await excluirConta(
      pedido({ headers: { Authorization: 'Bearer token-valido' }, body: JSON.stringify({ id: 'outro-usuario' }) }),
      admin,
    );
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith('usuario-1');
  });

  it('recusa pedido sem token', async () => {
    const { admin, deleteUser } = adminFalso();
    const resposta = await excluirConta(pedido(), admin);
    expect(resposta.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('recusa token inválido ou expirado', async () => {
    const { admin, deleteUser } = adminFalso();
    const resposta = await excluirConta(pedido({ headers: { Authorization: 'Bearer token-vencido' } }), admin);
    expect(resposta.status).toBe(401);
    expect(await resposta.json()).toEqual({ erro: 'sem_sessao' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('avisa quando o Supabase não consegue excluir', async () => {
    const { admin } = adminFalso({ erroExclusao: new Error('db down') });
    const resposta = await excluirConta(pedido({ headers: { Authorization: 'Bearer token-valido' } }), admin);
    expect(resposta.status).toBe(500);
    expect(await resposta.json()).toEqual({ erro: 'falha_ao_excluir' });
  });

  it('responde ao preflight do navegador e recusa outros métodos', async () => {
    const { admin } = adminFalso();
    const preflight = await excluirConta(pedido({ method: 'OPTIONS' }), admin);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
    expect((await excluirConta(pedido({ method: 'GET' }), admin)).status).toBe(405);
  });
});

describe('excluir-conta com assinatura do web app', () => {
  it('encerra a assinatura no Stripe antes de apagar a conta', async () => {
    const { admin, deleteUser } = adminFalso();
    const ordem: string[] = [];
    deleteUser.mockImplementation(async () => (ordem.push('apagou'), { error: null }));
    const encerrar = vi.fn(async () => void ordem.push('encerrou'));
    const resposta = await excluirConta(pedido({ headers: { Authorization: 'Bearer token-valido' } }), admin, encerrar);
    expect(resposta.status).toBe(200);
    expect(encerrar).toHaveBeenCalledWith('usuario-1');
    expect(ordem).toEqual(['encerrou', 'apagou']);
  });

  it('não apaga a conta se não conseguir encerrar a assinatura, para não seguir cobrando', async () => {
    const { admin, deleteUser } = adminFalso();
    const resposta = await excluirConta(pedido({ headers: { Authorization: 'Bearer token-valido' } }), admin, async () => {
      throw new Error('Stripe fora do ar');
    });
    expect(resposta.status).toBe(500);
    expect(await resposta.json()).toEqual({ erro: 'falha_ao_encerrar_assinatura' });
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
