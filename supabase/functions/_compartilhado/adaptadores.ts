// Implementações reais de Banco e Pagamentos (só no Deno). As regras ficam em assinatura.ts e nos handlers.
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.6.0';
import type { AssinaturaStripe, Banco, MetodoStripe, Pagamentos } from './assinatura.ts';

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { httpClient: Stripe.createFetchHttpClient() });

export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const falhar = (onde: string, erro: { message: string } | null) => {
  if (erro) throw new Error(`${onde}: ${erro.message}`);
};

export const banco: Banco = {
  async usuarioDoToken(jwt) {
    const { data } = await admin.auth.getUser(jwt);
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  },
  async clienteDo(usuarioId) {
    const { data, error } = await admin.from('clientes_stripe').select('customer_id').eq('usuario_id', usuarioId).maybeSingle();
    falhar('clienteDo', error);
    return data?.customer_id ?? null;
  },
  async salvarCliente(usuarioId, customerId) {
    const { error } = await admin.from('clientes_stripe').upsert({ usuario_id: usuarioId, customer_id: customerId }, { onConflict: 'usuario_id', ignoreDuplicates: true });
    falhar('salvarCliente', error);
    return (await this.clienteDo(usuarioId))!;
  },
  async usuarioDoCliente(customerId) {
    const { data, error } = await admin.from('clientes_stripe').select('usuario_id').eq('customer_id', customerId).maybeSingle();
    falhar('usuarioDoCliente', error);
    return data?.usuario_id ?? null;
  },
  async assinaturaWebEmAndamento(usuarioId) {
    const { data, error } = await admin
      .from('assinaturas')
      .select('id_externo, status, expira_em')
      .eq('usuario_id', usuarioId)
      .eq('origem', 'web')
      .in('status', ['pendente', 'ativa', 'atrasada', 'cancelada'])
      .order('criado_em', { ascending: false });
    falhar('assinaturaWebEmAndamento', error);
    const agora = Date.now();
    const atual = (data ?? []).find((a) => a.status === 'pendente' || (a.expira_em && new Date(a.expira_em).getTime() > agora));
    return atual ? { id_externo: atual.id_externo, status: atual.status } : null;
  },
  async gravarAssinatura(linha) {
    const { error } = await admin.from('assinaturas').upsert(linha, { onConflict: 'origem,id_externo' });
    falhar('gravarAssinatura', error);
  },
};

export const pagamentos: Pagamentos = {
  async criarCliente(usuario) {
    const cliente = await stripe.customers.create({ email: usuario.email ?? undefined, metadata: { usuario_id: usuario.id } });
    return cliente.id;
  },
  async precoPorChave(chave) {
    const { data } = await stripe.prices.list({ lookup_keys: [chave], active: true, limit: 1 });
    if (!data[0]) throw new Error(`Preço ${chave} não existe no Stripe`);
    return data[0].id;
  },
  async criarSessao({ customer, preco, moeda, retorno, usuarioId }) {
    const sessao = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ui_mode: 'elements',
      customer,
      currency: moeda.toLowerCase(),
      line_items: [{ price: preco, quantity: 1 }],
      return_url: retorno,
      client_reference_id: usuarioId,
      subscription_data: { metadata: { usuario_id: usuarioId } },
      integration_identifier: `torcida-web-${letrasAleatorias(8)}`,
    } as Stripe.Checkout.SessionCreateParams);
    return sessao.client_secret!;
  },
  async buscarAssinatura(id) {
    return (await stripe.subscriptions.retrieve(id)) as unknown as AssinaturaStripe;
  },
  async cancelarNoFimDoPeriodo(id, cancelar) {
    await stripe.subscriptions.update(id, { cancel_at_period_end: cancelar });
  },
  async cancelarAgora(id) {
    await stripe.subscriptions.cancel(id);
  },
  async criarPortal(customer, retorno) {
    const sessao = await stripe.billingPortal.sessions.create({ customer, return_url: retorno });
    return sessao.url;
  },
  async buscarCobranca(customer, assinaturaId) {
    const metodoDe = (pm: unknown): MetodoStripe | null =>
      pm && typeof pm === 'object' ? { type: (pm as Stripe.PaymentMethod).type, card: (pm as Stripe.PaymentMethod).card ?? null } : null;
    const [cliente, sub, faturas] = await Promise.all([
      stripe.customers.retrieve(customer),
      assinaturaId ? stripe.subscriptions.retrieve(assinaturaId, { expand: ['default_payment_method'] }) : null,
      // As 6 faturas pagas mais recentes, com o pagamento de cada uma.
      stripe.invoices.list({ customer, status: 'paid', limit: 6, expand: ['data.payments'] }),
    ]);
    // A forma de pagamento de cada fatura está no PaymentIntent que a quitou.
    const metodos = await Promise.all(
      faturas.data.map(async (f) => {
        const pi = (f as unknown as { payments?: { data: { payment: { payment_intent?: string | null } }[] } }).payments?.data[0]?.payment.payment_intent;
        if (!pi) return null;
        const intent = await stripe.paymentIntents.retrieve(pi, { expand: ['payment_method'] });
        return metodoDe(intent.payment_method);
      }),
    );
    const item = sub?.items.data[0];
    return {
      email: 'deleted' in cliente && cliente.deleted ? null : ((cliente as Stripe.Customer).email ?? null),
      assinatura:
        sub && item
          ? { valor: item.price.unit_amount ?? 0, moeda: item.price.currency, intervalo: item.price.recurring?.interval ?? 'month', metodo: metodoDe(sub.default_payment_method) }
          : null,
      faturas: faturas.data.map((f, i) => ({
        pagaEm: f.status_transitions.paid_at ?? null,
        valor: f.amount_paid,
        moeda: f.currency,
        periodo: f.lines.data[0]?.period ?? null,
        metodo: metodos[i],
        recibo: f.hosted_invoice_url ?? null,
      })),
    };
  },
};

function letrasAleatorias(n: number) {
  const letras = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => letras[b % 26]).join('');
}
