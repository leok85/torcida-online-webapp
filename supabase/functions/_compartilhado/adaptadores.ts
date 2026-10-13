// Implementações reais de Banco e Pagamentos (só no Deno). As regras ficam em assinatura.ts e nos handlers.
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.6.0';
import { type AssinaturaStripe, type Banco, type Correio, type MetodoStripe, type Pagamentos } from './assinatura.ts';
import { ASSUNTO_CODIGO_COBRANCA, htmlDoCodigoDeCobranca, textoDoCodigoDeCobranca } from './emailCodigoCobranca.ts';
import { enviarPeloResend } from './resend.ts';

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
  async guardarCodigoDeEmail(usuarioId, { email, hash, expiraEm }) {
    const { error } = await admin
      .from('codigos_email_cobranca')
      .upsert({ usuario_id: usuarioId, email, codigo_hash: hash, expira_em: expiraEm, tentativas: 0, criado_em: new Date().toISOString() }, { onConflict: 'usuario_id' });
    falhar('guardarCodigoDeEmail', error);
  },
  async codigoDeEmail(usuarioId) {
    const { data, error } = await admin.from('codigos_email_cobranca').select('email, codigo_hash, tentativas, expira_em').eq('usuario_id', usuarioId).maybeSingle();
    falhar('codigoDeEmail', error);
    return data ? { email: data.email, hash: data.codigo_hash, tentativas: data.tentativas, expiraEm: data.expira_em } : null;
  },
  async errouCodigoDeEmail(usuarioId) {
    const atual = await this.codigoDeEmail(usuarioId);
    if (!atual) return;
    const { error } = await admin.from('codigos_email_cobranca').update({ tentativas: atual.tentativas + 1 }).eq('usuario_id', usuarioId);
    falhar('errouCodigoDeEmail', error);
  },
  async apagarCodigoDeEmail(usuarioId) {
    const { error } = await admin.from('codigos_email_cobranca').delete().eq('usuario_id', usuarioId);
    falhar('apagarCodigoDeEmail', error);
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
  async previaDaTroca(assinaturaId, preco) {
    const sub = await stripe.subscriptions.retrieve(assinaturaId);
    const previa = await stripe.invoices.createPreview({
      customer: sub.customer as string,
      subscription: assinaturaId,
      subscription_details: { items: [{ id: sub.items.data[0].id, price: preco }], proration_behavior: 'always_invoice' },
    });
    const linhas = previa.lines.data;
    // Linhas negativas são o crédito do que sobrou do plano atual; a positiva é o plano novo.
    const credito = -linhas.filter((l) => l.amount < 0).reduce((t, l) => t + l.amount, 0);
    const valor = linhas.filter((l) => l.amount > 0).reduce((t, l) => t + l.amount, 0);
    const novo = linhas.find((l) => l.amount > 0);
    return { valor, credito, total: previa.amount_due, moeda: previa.currency, renovaEm: novo?.period.end ?? null };
  },
  async trocarPlano(assinaturaId, preco) {
    const sub = await stripe.subscriptions.retrieve(assinaturaId);
    try {
      await stripe.subscriptions.update(assinaturaId, {
        items: [{ id: sub.items.data[0].id, price: preco }],
        // Mensal ↔ anual muda o período: o Stripe fatura na hora, já descontando o que sobrou do plano atual.
        proration_behavior: 'always_invoice',
        // Se o cartão não passar, nada muda na assinatura.
        payment_behavior: 'error_if_incomplete',
      });
      return 'ok';
    } catch (e) {
      if (e instanceof Stripe.errors.StripeCardError) return 'recusado';
      throw e;
    }
  },
  async criarSessaoDeCartao({ customer, assinaturaId, retorno }) {
    const sub = await stripe.subscriptions.retrieve(assinaturaId);
    const sessao = await stripe.checkout.sessions.create({
      mode: 'setup',
      ui_mode: 'elements',
      customer,
      currency: sub.currency,
      return_url: retorno,
      // O webhook (checkout.session.completed) acha a assinatura por aqui se a aba fechar antes da tela confirmar.
      metadata: { assinatura: assinaturaId },
      integration_identifier: `torcida-web-cartao-${letrasAleatorias(8)}`,
    } as Stripe.Checkout.SessionCreateParams);
    return sessao.client_secret!;
  },
  async definirCartao(customer, sessaoId, assinaturaId) {
    const sessao = await stripe.checkout.sessions.retrieve(sessaoId, { expand: ['setup_intent'] });
    // Só a sessão de cartão concluída do próprio cliente.
    if (sessao.customer !== customer || sessao.mode !== 'setup' || sessao.status !== 'complete') return false;
    const pm = (sessao.setup_intent as Stripe.SetupIntent | null)?.payment_method;
    const pmId = typeof pm === 'string' ? pm : pm?.id;
    if (!pmId) return false;
    await stripe.customers.update(customer, { invoice_settings: { default_payment_method: pmId } });
    const sub = await stripe.subscriptions.update(assinaturaId, { default_payment_method: pmId });
    // Renovação recusada: tenta de novo com o cartão novo (se recusar, segue pendente).
    if (sub.status === 'past_due' || sub.status === 'unpaid') {
      const abertas = await stripe.invoices.list({ subscription: assinaturaId, status: 'open', limit: 3 });
      for (const f of abertas.data) {
        try {
          await stripe.invoices.pay(f.id!, { payment_method: pmId });
        } catch {
          // Recusado de novo: a tela continua mostrando o pagamento pendente.
        }
      }
    }
    return true;
  },
  async trocarEmailDeCobranca(customer, email) {
    await stripe.customers.update(customer, { email });
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

export const correio: Correio = {
  enviarCodigoDeCobranca: (para, codigo) =>
    enviarPeloResend({ para, assunto: ASSUNTO_CODIGO_COBRANCA, html: htmlDoCodigoDeCobranca(codigo, para), texto: textoDoCodigoDeCobranca(codigo) }),
};

function letrasAleatorias(n: number) {
  const letras = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => letras[b % 26]).join('');
}
