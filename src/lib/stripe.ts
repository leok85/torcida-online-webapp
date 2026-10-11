import { loadStripe, type Stripe } from '@stripe/stripe-js';

let stripe: Promise<Stripe | null> | undefined;

/** Carrega o Stripe.js só quando a tela de pagamento abre (e uma vez só). */
export function carregarStripe() {
  const chave = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (!chave) throw new Error('Defina VITE_STRIPE_PUBLISHABLE_KEY no .env.local (veja .env.example).');
  stripe ??= loadStripe(chave, { locale: 'pt-BR' });
  return stripe;
}
