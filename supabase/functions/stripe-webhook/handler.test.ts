import { describe, expect, it, vi } from 'vitest';
import { criarFalsos, RAFA, subStripe } from '../_compartilhado/falsos';
import { stripeWebhook, type EventoStripe } from './handler';

const chamada = (evento: EventoStripe | null, assinatura = 't=1,v1=ok') =>
  new Request('http://supabase.test/functions/v1/stripe-webhook', {
    method: 'POST',
    headers: assinatura ? { 'Stripe-Signature': assinatura } : {},
    body: JSON.stringify(evento ?? {}),
  });

/** Aceita só a assinatura "t=1,v1=ok", como se fosse o segredo do webhook. */
const verificar = vi.fn(async (corpo: string, assinatura: string) => {
  if (assinatura !== 't=1,v1=ok') throw new Error('No signatures found matching the expected signature');
  return JSON.parse(corpo) as EventoStripe;
});

const evento = (type: string, object: Record<string, unknown>): EventoStripe => ({ id: 'evt_1', type, data: { object } });

function cenario() {
  const f = criarFalsos();
  f.clientes.set(RAFA.id, 'cus_1');
  f.subs.set('sub_1', subStripe());
  return f;
}

describe('stripe-webhook', () => {
  it('assinatura criada libera o torcedor dono do cliente do Stripe', async () => {
    const f = cenario();
    const resposta = await stripeWebhook(chamada(evento('customer.subscription.created', { id: 'sub_1' })), verificar, f.banco, f.pagamentos);
    expect(resposta.status).toBe(200);
    expect(f.assinaturas).toHaveLength(1);
    expect(f.assinaturas[0]).toMatchObject({ usuario_id: RAFA.id, origem: 'web', id_externo: 'sub_1', plano: 'mensal', status: 'ativa' });
  });

  it('relê a assinatura no Stripe em vez de confiar no evento, então a ordem de chegada não importa', async () => {
    const f = cenario();
    // Evento antigo dizendo "incomplete" chega depois, mas o Stripe já está "active".
    await stripeWebhook(chamada(evento('customer.subscription.updated', { id: 'sub_1', status: 'incomplete' })), verificar, f.banco, f.pagamentos);
    expect(f.assinaturas[0].status).toBe('ativa');
  });

  it('fatura recusada marca a assinatura como atrasada, achando-a pela fatura', async () => {
    const f = cenario();
    f.subs.set('sub_1', subStripe({ status: 'past_due' }));
    await stripeWebhook(
      chamada(evento('invoice.payment_failed', { id: 'in_1', parent: { subscription_details: { subscription: 'sub_1' } } })),
      verificar,
      f.banco,
      f.pagamentos,
    );
    expect(f.assinaturas[0].status).toBe('atrasada');
  });

  it('assinatura encerrada vira expirada', async () => {
    const f = cenario();
    f.subs.set('sub_1', subStripe({ status: 'canceled', ended_at: 1_800_000_000 }));
    await stripeWebhook(chamada(evento('customer.subscription.deleted', { id: 'sub_1' })), verificar, f.banco, f.pagamentos);
    expect(f.assinaturas[0]).toMatchObject({ status: 'expirada', expira_em: new Date(1_800_000_000_000).toISOString() });
  });

  it('o mesmo evento repetido não duplica a assinatura', async () => {
    const f = cenario();
    for (let i = 0; i < 2; i++) await stripeWebhook(chamada(evento('invoice.paid', { id: 'in_1', subscription: 'sub_1' })), verificar, f.banco, f.pagamentos);
    expect(f.assinaturas).toHaveLength(1);
  });

  it('recusa evento sem assinatura do Stripe ou com assinatura inválida, sem gravar nada', async () => {
    const f = cenario();
    const semAssinatura = await stripeWebhook(chamada(evento('customer.subscription.created', { id: 'sub_1' }), ''), verificar, f.banco, f.pagamentos);
    const forjado = await stripeWebhook(chamada(evento('customer.subscription.created', { id: 'sub_1' }), 't=1,v1=forjado'), verificar, f.banco, f.pagamentos);
    expect([semAssinatura.status, forjado.status]).toEqual([400, 400]);
    expect(f.pagamentos.buscarAssinatura).not.toHaveBeenCalled();
    expect(f.assinaturas).toHaveLength(0);
  });

  it('ignora eventos que não mexem na assinatura e clientes que não são do app', async () => {
    const f = cenario();
    const outro = await stripeWebhook(chamada(evento('customer.created', { id: 'cus_9' })), verificar, f.banco, f.pagamentos);
    expect(outro.status).toBe(200);
    f.subs.set('sub_9', subStripe({ id: 'sub_9', customer: 'cus_de_outro_sistema' }));
    const estranho = await stripeWebhook(chamada(evento('customer.subscription.created', { id: 'sub_9' })), verificar, f.banco, f.pagamentos);
    expect(await estranho.json()).toEqual({ ignorado: 'cliente_desconhecido' });
    expect(f.assinaturas).toHaveLength(0);
  });

  it('se o Stripe ou o banco falharem, responde erro para o Stripe tentar de novo', async () => {
    const f = cenario();
    await expect(
      stripeWebhook(chamada(evento('customer.subscription.updated', { id: 'sub_que_sumiu' })), verificar, f.banco, f.pagamentos),
    ).rejects.toThrow('No such subscription');
  });
});
