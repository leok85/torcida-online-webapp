import { describe, expect, it, vi } from 'vitest';
import { excluirConta, type ClienteAdmin, type Dependencias } from './handler';

const AGORA = new Date('2026-10-14T12:00:00Z');

function dependencias({ usuario = { id: 'usuario-1' } as { id: string } | null, erroExclusao = null as unknown, vencidas = [] as string[] } = {}) {
  const getUser = vi.fn(async (jwt: string) =>
    jwt === 'token-valido' && usuario ? { data: { user: usuario }, error: null } : { data: { user: null }, error: new Error('invalid JWT') },
  );
  const deleteUser = vi.fn(async (_id: string) => ({ error: erroExclusao }));
  const signOut = vi.fn(async (_jwt: string, _scope: 'global') => ({ error: null }));
  const admin: ClienteAdmin = { auth: { getUser, admin: { deleteUser, signOut } } };
  const deps = {
    admin,
    agendarExclusao: vi.fn(async (_id: string, _data: Date) => undefined),
    contasVencidas: vi.fn(async (_agora: Date) => vencidas),
    apagarArquivos: vi.fn(async (_id: string) => undefined),
    segredo: 'segredo-do-cron',
    agora: () => AGORA,
  } satisfies Dependencias;
  return { deps, getUser, deleteUser, signOut };
}

const pedido = (init: RequestInit = {}) =>
  new Request('http://supabase.test/functions/v1/excluir-conta', { method: 'POST', ...init });

const logado = { headers: { Authorization: 'Bearer token-valido' } };

describe('excluir-conta: pedido do torcedor', () => {
  it('agenda a exclusão para daqui a 30 dias, tira a conta de todos os aparelhos e não apaga nada ainda', async () => {
    const { deps, deleteUser, signOut } = dependencias();
    const resposta = await excluirConta(pedido(logado), deps);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true, exclui_em: '2026-11-13T12:00:00.000Z' });
    expect(deps.agendarExclusao).toHaveBeenCalledWith('usuario-1', new Date('2026-11-13T12:00:00Z'));
    expect(signOut).toHaveBeenCalledWith('token-valido', 'global');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('ignora qualquer id mandado no corpo: só agenda quem está logado', async () => {
    const { deps } = dependencias();
    await excluirConta(pedido({ ...logado, body: JSON.stringify({ id: 'outro-usuario' }) }), deps);
    expect(deps.agendarExclusao).toHaveBeenCalledTimes(1);
    expect(deps.agendarExclusao).toHaveBeenCalledWith('usuario-1', expect.any(Date));
  });

  it('recusa pedido sem token', async () => {
    const { deps } = dependencias();
    const resposta = await excluirConta(pedido(), deps);
    expect(resposta.status).toBe(401);
    expect(deps.agendarExclusao).not.toHaveBeenCalled();
  });

  it('recusa token inválido ou expirado', async () => {
    const { deps } = dependencias();
    const resposta = await excluirConta(pedido({ headers: { Authorization: 'Bearer token-vencido' } }), deps);
    expect(resposta.status).toBe(401);
    expect(await resposta.json()).toEqual({ erro: 'sem_sessao' });
    expect(deps.agendarExclusao).not.toHaveBeenCalled();
  });

  it('avisa quando não consegue agendar', async () => {
    const { deps, signOut } = dependencias();
    deps.agendarExclusao.mockRejectedValue(new Error('db down'));
    const resposta = await excluirConta(pedido(logado), deps);
    expect(resposta.status).toBe(500);
    expect(await resposta.json()).toEqual({ erro: 'falha_ao_excluir' });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('responde ao preflight do navegador e recusa outros métodos', async () => {
    const { deps } = dependencias();
    const preflight = await excluirConta(pedido({ method: 'OPTIONS' }), deps);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
    expect((await excluirConta(pedido({ method: 'GET' }), deps)).status).toBe(405);
  });
});

describe('excluir-conta com assinatura do web app', () => {
  it('encerra a assinatura no Stripe antes de agendar', async () => {
    const { deps } = dependencias();
    const ordem: string[] = [];
    deps.agendarExclusao.mockImplementation(async () => void ordem.push('agendou'));
    const encerrar = vi.fn(async () => void ordem.push('encerrou'));
    const resposta = await excluirConta(pedido(logado), { ...deps, encerrarAssinaturas: encerrar });
    expect(resposta.status).toBe(200);
    expect(encerrar).toHaveBeenCalledWith('usuario-1');
    expect(ordem).toEqual(['encerrou', 'agendou']);
  });

  it('não agenda se não conseguir encerrar a assinatura, para não seguir cobrando', async () => {
    const { deps } = dependencias();
    const resposta = await excluirConta(pedido(logado), {
      ...deps,
      encerrarAssinaturas: async () => {
        throw new Error('Stripe fora do ar');
      },
    });
    expect(resposta.status).toBe(500);
    expect(await resposta.json()).toEqual({ erro: 'falha_ao_encerrar_assinatura' });
    expect(deps.agendarExclusao).not.toHaveBeenCalled();
  });
});

describe('excluir-conta: rodada diária do pg_cron', () => {
  const doCron = (segredo = 'segredo-do-cron') => pedido({ headers: { 'x-segredo': segredo }, body: '{"modo":"vencidas"}' });

  it('apaga as contas vencidas e a foto de cada uma', async () => {
    const { deps, deleteUser } = dependencias({ vencidas: ['usuario-7', 'usuario-8'] });
    const resposta = await excluirConta(doCron(), deps);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ excluidas: 2, falhas: 0 });
    expect(deps.contasVencidas).toHaveBeenCalledWith(AGORA);
    expect(deps.apagarArquivos.mock.calls).toEqual([['usuario-7'], ['usuario-8']]);
    expect(deleteUser.mock.calls).toEqual([['usuario-7'], ['usuario-8']]);
  });

  it('segue para as próximas quando uma falha e avisa no status', async () => {
    const { deps, deleteUser } = dependencias({ vencidas: ['usuario-7', 'usuario-8'] });
    deleteUser.mockImplementationOnce(async () => ({ error: new Error('db down') }));
    const resposta = await excluirConta(doCron(), deps);
    expect(resposta.status).toBe(500);
    expect(await resposta.json()).toEqual({ excluidas: 1, falhas: 1 });
    expect(deleteUser).toHaveBeenCalledTimes(2);
  });

  it('recusa segredo errado ou sem segredo configurado', async () => {
    const { deps, deleteUser } = dependencias({ vencidas: ['usuario-7'] });
    expect((await excluirConta(doCron('chute'), deps)).status).toBe(401);
    expect((await excluirConta(doCron(), { ...deps, segredo: undefined })).status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
