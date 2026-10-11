import { describe, expect, it } from 'vitest';
import { criarFalsos, pedido, RAFA } from '../_compartilhado/falsos';
import { criarCheckout } from './handler';

const URL_FUNCAO = 'http://supabase.test/functions/v1/criar-checkout';

describe('criar-checkout', () => {
  it('cria o cliente no Stripe na primeira vez e abre a sessão do plano e da moeda pedidos', async () => {
    const f = criarFalsos();
    const resposta = await criarCheckout(
      pedido(URL_FUNCAO, { corpo: { plano: 'anual', moeda: 'EUR' }, headers: { Origin: 'http://localhost:5173' } }),
      f.banco,
      f.pagamentos,
    );
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ clientSecret: 'cs_secret_teste' });
    expect(f.pagamentos.criarCliente).toHaveBeenCalledWith(RAFA);
    expect(f.clientes.get(RAFA.id)).toBe('cus_1');
    expect(f.pagamentos.precoPorChave).toHaveBeenCalledWith('membro_anual');
    expect(f.pagamentos.criarSessao).toHaveBeenCalledWith({
      customer: 'cus_1',
      preco: 'price_membro_anual',
      moeda: 'EUR',
      retorno: 'http://localhost:5173/assinar/retorno?sessao={CHECKOUT_SESSION_ID}',
      usuarioId: RAFA.id,
    });
  });

  it('reaproveita o cliente do Stripe que o torcedor já tem', async () => {
    const f = criarFalsos();
    f.clientes.set(RAFA.id, 'cus_antigo');
    await criarCheckout(pedido(URL_FUNCAO, { corpo: { plano: 'mensal', moeda: 'BRL' } }), f.banco, f.pagamentos);
    expect(f.pagamentos.criarCliente).not.toHaveBeenCalled();
    expect(f.pagamentos.criarSessao).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_antigo' }));
  });

  it('volta para o web app de produção quando a origem não é conhecida', async () => {
    const f = criarFalsos();
    await criarCheckout(
      pedido(URL_FUNCAO, { corpo: { plano: 'mensal', moeda: 'BRL' }, headers: { Origin: 'https://golpe.example' } }),
      f.banco,
      f.pagamentos,
    );
    expect(f.pagamentos.criarSessao).toHaveBeenCalledWith(
      expect.objectContaining({ retorno: 'https://app.torcidaonline.com.br/assinar/retorno?sessao={CHECKOUT_SESSION_ID}' }),
    );
  });

  it('não abre uma segunda assinatura para quem já tem uma em andamento', async () => {
    const f = criarFalsos();
    await f.banco.gravarAssinatura({ usuario_id: RAFA.id, origem: 'web', id_externo: 'sub_1', plano: 'mensal', status: 'ativa', expira_em: '2099-01-01T00:00:00Z' });
    const resposta = await criarCheckout(pedido(URL_FUNCAO, { corpo: { plano: 'anual', moeda: 'BRL' } }), f.banco, f.pagamentos);
    expect(resposta.status).toBe(409);
    expect(await resposta.json()).toEqual({ erro: 'ja_assinante' });
    expect(f.pagamentos.criarSessao).not.toHaveBeenCalled();
  });

  it('deixa assinar de novo depois que a assinatura anterior expirou', async () => {
    const f = criarFalsos();
    await f.banco.gravarAssinatura({ usuario_id: RAFA.id, origem: 'web', id_externo: 'sub_1', plano: 'mensal', status: 'expirada', expira_em: '2026-01-01T00:00:00Z' });
    const resposta = await criarCheckout(pedido(URL_FUNCAO, { corpo: { plano: 'anual', moeda: 'BRL' } }), f.banco, f.pagamentos);
    expect(resposta.status).toBe(200);
  });

  it('recusa plano ou moeda fora da lista', async () => {
    const f = criarFalsos();
    for (const corpo of [{ plano: 'vitalicio', moeda: 'BRL' }, { plano: 'anual', moeda: 'JPY' }, {}]) {
      const resposta = await criarCheckout(pedido(URL_FUNCAO, { corpo }), f.banco, f.pagamentos);
      expect(resposta.status).toBe(400);
    }
    expect(f.pagamentos.criarSessao).not.toHaveBeenCalled();
  });

  it('exige sessão válida', async () => {
    const f = criarFalsos();
    const semToken = await criarCheckout(pedido(URL_FUNCAO, { headers: { Authorization: '' }, corpo: { plano: 'anual', moeda: 'BRL' } }), f.banco, f.pagamentos);
    const tokenInvalido = await criarCheckout(
      pedido(URL_FUNCAO, { headers: { Authorization: 'Bearer vencido' }, corpo: { plano: 'anual', moeda: 'BRL' } }),
      f.banco,
      f.pagamentos,
    );
    expect([semToken.status, tokenInvalido.status]).toEqual([401, 401]);
  });
});
