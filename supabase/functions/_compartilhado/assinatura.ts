// Regras da assinatura do web app (Stripe) e as interfaces que as Edge Functions usam.
// As implementações reais (supabase-js e stripe) ficam em adaptadores.ts, que só roda no Deno;
// os testes do Vitest passam falsos com o mesmo formato.

export type Plano = 'mensal' | 'anual';
export type Moeda = 'BRL' | 'USD' | 'EUR';
export type Status = 'pendente' | 'ativa' | 'atrasada' | 'cancelada' | 'expirada';

/** O que usamos de uma Subscription do Stripe. */
export type AssinaturaStripe = {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  ended_at: number | null;
  items: { data: { current_period_end: number; price: { recurring: { interval: string } | null } }[] };
};

export type LinhaAssinatura = {
  usuario_id: string;
  origem: 'web';
  id_externo: string;
  plano: Plano;
  status: Status;
  expira_em: string | null;
};

export type Usuario = { id: string; email: string | null };

export interface Banco {
  usuarioDoToken(jwt: string): Promise<Usuario | null>;
  clienteDo(usuarioId: string): Promise<string | null>;
  /** Grava o vínculo e devolve o que ficou salvo (se outro pedido gravou antes, vale o dele). */
  salvarCliente(usuarioId: string, customerId: string): Promise<string>;
  usuarioDoCliente(customerId: string): Promise<string | null>;
  /** Assinatura do web app mais recente que ainda não acabou (pendente, ativa, atrasada ou cancelada no prazo). */
  assinaturaWebEmAndamento(usuarioId: string): Promise<{ id_externo: string; status: Status } | null>;
  gravarAssinatura(linha: LinhaAssinatura): Promise<void>;
}

export interface Pagamentos {
  criarCliente(usuario: Usuario): Promise<string>;
  precoPorChave(chave: string): Promise<string>;
  criarSessao(dados: { customer: string; preco: string; moeda: Moeda; retorno: string; usuarioId: string }): Promise<string>;
  buscarAssinatura(id: string): Promise<AssinaturaStripe>;
  cancelarNoFimDoPeriodo(id: string, cancelar: boolean): Promise<void>;
  cancelarAgora(id: string): Promise<void>;
  criarPortal(customer: string, retorno: string): Promise<string>;
}

const STATUS: Record<string, Status> = {
  active: 'ativa',
  trialing: 'ativa',
  past_due: 'atrasada',
  unpaid: 'atrasada',
  incomplete: 'pendente',
  incomplete_expired: 'expirada',
  canceled: 'expirada',
  paused: 'expirada',
};

const iso = (segundos: number) => new Date(segundos * 1000).toISOString();

/** Converte a Subscription do Stripe na linha de public.assinaturas. */
export function linhaDaAssinatura(sub: AssinaturaStripe, usuarioId: string): LinhaAssinatura {
  const item = sub.items.data[0];
  let status = STATUS[sub.status] ?? 'expirada';
  // Ativa com fim marcado: continua liberada até o fim do período, mas não renova.
  if (status === 'ativa' && (sub.cancel_at_period_end || sub.cancel_at)) status = 'cancelada';

  const fimDoPeriodo = item?.current_period_end ?? null;
  let expira: number | null = sub.cancel_at ?? fimDoPeriodo;
  if (status === 'expirada') expira = sub.ended_at ?? fimDoPeriodo;
  if (status === 'pendente') expira = null;

  return {
    usuario_id: usuarioId,
    origem: 'web',
    id_externo: sub.id,
    plano: item?.price.recurring?.interval === 'year' ? 'anual' : 'mensal',
    status,
    expira_em: expira === null ? null : iso(expira),
  };
}

/**
 * Relê a assinatura no Stripe e grava o estado atual. Sempre buscar de novo (em vez de confiar no evento)
 * deixa a ordem de chegada dos webhooks irrelevante.
 */
export async function sincronizarAssinatura(id: string, banco: Banco, pagamentos: Pagamentos) {
  const sub = await pagamentos.buscarAssinatura(id);
  const usuarioId = await banco.usuarioDoCliente(sub.customer);
  if (!usuarioId) return null;
  const linha = linhaDaAssinatura(sub, usuarioId);
  await banco.gravarAssinatura(linha);
  return linha;
}
