import { describe, expect, it } from 'vitest';
import { criarFalsos, pedido, RAFA, subStripe } from '../_compartilhado/falsos';
import { gerenciarAssinatura } from './handler';

const URL_FUNCAO = 'http://supabase.test/functions/v1/gerenciar-assinatura';

async function comAssinatura() {
  const f = criarFalsos();
  f.clientes.set(RAFA.id, 'cus_1');
  const sub = subStripe();
  f.subs.set('sub_1', sub);
  await f.banco.gravarAssinatura({
    usuario_id: RAFA.id,
    origem: 'web',
    id_externo: 'sub_1',
    plano: 'mensal',
    status: 'ativa',
    expira_em: new Date(sub.items.data[0].current_period_end * 1000).toISOString(),
  });
  return f;
}

describe('gerenciar-assinatura', () => {
  it('cancelar marca o fim do período no Stripe e já grava a assinatura como cancelada', async () => {
    const f = await comAssinatura();
    const resposta = await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'cancelar' } }), f.banco, f.pagamentos);
    expect(resposta.status).toBe(200);
    expect(f.pagamentos.cancelarNoFimDoPeriodo).toHaveBeenCalledWith('sub_1', true);
    expect(f.assinaturas[0].status).toBe('cancelada');
    expect((await resposta.json()).status).toBe('cancelada');
  });

  it('reativar desfaz o cancelamento', async () => {
    const f = await comAssinatura();
    await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'cancelar' } }), f.banco, f.pagamentos);
    await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'reativar' } }), f.banco, f.pagamentos);
    expect(f.pagamentos.cancelarNoFimDoPeriodo).toHaveBeenLastCalledWith('sub_1', false);
    expect(f.assinaturas[0].status).toBe('ativa');
  });

  it('o portal abre para o cliente do próprio torcedor e volta para Minha assinatura', async () => {
    const f = await comAssinatura();
    const resposta = await gerenciarAssinatura(
      pedido(URL_FUNCAO, { corpo: { acao: 'portal' }, headers: { Origin: 'http://localhost:5173' } }),
      f.banco,
      f.pagamentos,
    );
    expect(await resposta.json()).toEqual({ url: 'https://billing.stripe.com/p/session/cus_1' });
    expect(f.pagamentos.criarPortal).toHaveBeenCalledWith('cus_1', 'http://localhost:5173/conta/assinatura');
  });

  it('ignora qualquer id de assinatura mandado no pedido: só mexe na do torcedor logado', async () => {
    const f = await comAssinatura();
    await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'cancelar', id: 'sub_de_outra_pessoa' } }), f.banco, f.pagamentos);
    expect(f.pagamentos.cancelarNoFimDoPeriodo).toHaveBeenCalledWith('sub_1', true);
  });

  it('sem assinatura do web app, não há o que cancelar nem portal para abrir', async () => {
    const f = criarFalsos();
    const cancelar = await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'cancelar' } }), f.banco, f.pagamentos);
    const portal = await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'portal' } }), f.banco, f.pagamentos);
    expect([cancelar.status, portal.status]).toEqual([404, 404]);
  });

  it('recusa ação desconhecida e pedido sem sessão', async () => {
    const f = await comAssinatura();
    expect((await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'apagar' } }), f.banco, f.pagamentos)).status).toBe(400);
    expect(
      (await gerenciarAssinatura(pedido(URL_FUNCAO, { headers: { Authorization: '' }, corpo: { acao: 'cancelar' } }), f.banco, f.pagamentos)).status,
    ).toBe(401);
  });
});
