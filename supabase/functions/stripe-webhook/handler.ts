// Recebe os eventos do Stripe e mantém public.assinaturas em dia. É daqui, e não da tela de sucesso,
// que a assinatura é liberada, renovada, marcada como atrasada ou encerrada.
import { sincronizarAssinatura, type Banco, type Pagamentos } from '../_compartilhado/assinatura.ts';

export type EventoStripe = { id: string; type: string; data: { object: Record<string, unknown> } };

/** Confere a assinatura do Stripe-Signature e devolve o evento; lança erro se for inválida. */
export type VerificarEvento = (corpo: string, assinatura: string) => Promise<EventoStripe>;

const EVENTOS_DE_ASSINATURA = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
];
const EVENTOS_DE_FATURA = ['invoice.paid', 'invoice.payment_failed'];

/** Id da assinatura ligada ao evento, pelo grafo de objetos do Stripe (não por metadata). */
function assinaturaDoEvento(evento: EventoStripe): string | null {
  const objeto = evento.data.object;
  if (EVENTOS_DE_ASSINATURA.includes(evento.type)) return typeof objeto.id === 'string' ? objeto.id : null;
  if (EVENTOS_DE_FATURA.includes(evento.type)) {
    // Nas versões novas da API a assinatura da fatura fica em parent.subscription_details.
    const parent = objeto.parent as { subscription_details?: { subscription?: unknown } } | null | undefined;
    const id = parent?.subscription_details?.subscription ?? objeto.subscription;
    if (typeof id === 'string') return id;
    if (id && typeof id === 'object' && typeof (id as { id?: unknown }).id === 'string') return (id as { id: string }).id;
  }
  return null;
}

const resposta = (status: number, corpo: object) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

export async function stripeWebhook(req: Request, verificar: VerificarEvento, banco: Banco, pagamentos: Pagamentos): Promise<Response> {
  if (req.method !== 'POST') return resposta(405, { erro: 'metodo_nao_permitido' });
  const assinatura = req.headers.get('Stripe-Signature');
  if (!assinatura) return resposta(400, { erro: 'sem_assinatura' });

  let evento: EventoStripe;
  try {
    evento = await verificar(await req.text(), assinatura);
  } catch {
    return resposta(400, { erro: 'assinatura_invalida' });
  }

  // Cartão novo cadastrado em Minha assinatura (Checkout em modo setup): passa a ser o da assinatura.
  // A tela também faz isso ao concluir; repetir é inofensivo.
  if (evento.type === 'checkout.session.completed' && evento.data.object.mode === 'setup') {
    const sessao = evento.data.object as { id: string; customer?: unknown; metadata?: { assinatura?: unknown } | null };
    const assinaturaId = sessao.metadata?.assinatura;
    if (typeof sessao.customer !== 'string' || typeof assinaturaId !== 'string') return resposta(200, { ignorado: 'sessao_sem_assinatura' });
    await pagamentos.definirCartao(sessao.customer, sessao.id, assinaturaId);
    const linha = await sincronizarAssinatura(assinaturaId, banco, pagamentos);
    return resposta(200, linha ? { status: linha.status } : { ignorado: 'cliente_desconhecido' });
  }

  const id = assinaturaDoEvento(evento);
  if (!id) return resposta(200, { ignorado: evento.type });

  // Erro aqui devolve 500 e o Stripe tenta de novo mais tarde.
  const linha = await sincronizarAssinatura(id, banco, pagamentos);
  return resposta(200, linha ? { status: linha.status } : { ignorado: 'cliente_desconhecido' });
}
