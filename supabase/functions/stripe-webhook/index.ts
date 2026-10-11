// Edge Function (Deno) chamada pelo Stripe, sem JWT (verify_jwt = false): a autenticação é a assinatura
// Stripe-Signature, conferida com STRIPE_WEBHOOK_SECRET.
import Stripe from 'npm:stripe@22.6.0';
import { banco, pagamentos, stripe } from '../_compartilhado/adaptadores.ts';
import { stripeWebhook, type EventoStripe } from './handler.ts';

const segredo = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const cripto = Stripe.createSubtleCryptoProvider();

const verificar = async (corpo: string, assinatura: string) =>
  (await stripe.webhooks.constructEventAsync(corpo, assinatura, segredo, undefined, cripto)) as unknown as EventoStripe;

Deno.serve((req) => stripeWebhook(req, verificar, banco, pagamentos));
