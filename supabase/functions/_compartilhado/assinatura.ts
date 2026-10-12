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
  /** Código pendente do e-mail de cobrança (um por torcedor; um pedido novo substitui o anterior). */
  guardarCodigoDeEmail(usuarioId: string, codigo: { email: string; hash: string; expiraEm: string }): Promise<void>;
  codigoDeEmail(usuarioId: string): Promise<CodigoDeEmail | null>;
  errouCodigoDeEmail(usuarioId: string): Promise<void>;
  apagarCodigoDeEmail(usuarioId: string): Promise<void>;
}

export type CodigoDeEmail = { email: string; hash: string; tentativas: number; expiraEm: string };

/** Envio de e-mails fora do Supabase Auth (código do e-mail de cobrança). */
export interface Correio {
  /** Lança CorreioIndisponivel quando não há chave do provedor configurada. */
  enviarCodigoDeCobranca(para: string, codigo: string): Promise<void>;
}

export class CorreioIndisponivel extends Error {
  constructor() {
    super('RESEND_API_KEY não configurada');
  }
}

/** Prévia da troca de plano, em centavos: o plano novo, o crédito do que sobrou do atual e o total de hoje. */
export type PreviaStripe = { valor: number; credito: number; total: number; moeda: string; renovaEm: number | null };

/** Forma de pagamento como o Stripe devolve (PaymentMethod, só o que a tela mostra). */
export type MetodoStripe = {
  type: string;
  card?: { brand: string; last4: string; exp_month: number; exp_year: number } | null;
};

/** Fatura paga, já com a forma de pagamento do PaymentIntent que a quitou. */
export type FaturaStripe = {
  pagaEm: number | null;
  valor: number;
  moeda: string;
  /** Início e fim do período cobrado (segundos), para saber se foi o plano anual ou o mensal. */
  periodo: { start: number; end: number } | null;
  metodo: MetodoStripe | null;
  recibo: string | null;
};

/** Dados de cobrança do cliente no Stripe: preço e forma de pagamento da assinatura, e-mail e faturas pagas. */
export type CobrancaStripe = {
  email: string | null;
  assinatura: { valor: number; moeda: string; intervalo: string; metodo: MetodoStripe | null } | null;
  faturas: FaturaStripe[];
};

export interface Pagamentos {
  criarCliente(usuario: Usuario): Promise<string>;
  precoPorChave(chave: string): Promise<string>;
  criarSessao(dados: { customer: string; preco: string; moeda: Moeda; retorno: string; usuarioId: string }): Promise<string>;
  buscarAssinatura(id: string): Promise<AssinaturaStripe>;
  cancelarNoFimDoPeriodo(id: string, cancelar: boolean): Promise<void>;
  cancelarAgora(id: string): Promise<void>;
  /** Quanto custa trocar a assinatura para o preço novo agora (o Stripe cobra na hora quando o período muda). */
  previaDaTroca(assinaturaId: string, preco: string): Promise<PreviaStripe>;
  /** Troca o preço da assinatura e cobra a diferença na hora; 'recusado' quando o cartão não passa. */
  trocarPlano(assinaturaId: string, preco: string): Promise<'ok' | 'recusado'>;
  /** Checkout Session em modo setup para cadastrar um cartão novo. */
  criarSessaoDeCartao(dados: { customer: string; assinaturaId: string; retorno: string }): Promise<string>;
  /** Usa o cartão da sessão concluída na assinatura (e tenta pagar a fatura em aberto, se houver). */
  definirCartao(customer: string, sessaoId: string, assinaturaId: string): Promise<boolean>;
  trocarEmailDeCobranca(customer: string, email: string): Promise<void>;
  /** Preço e forma de pagamento da assinatura (se houver), e-mail de cobrança e as últimas faturas pagas. */
  buscarCobranca(customer: string, assinaturaId: string | null): Promise<CobrancaStripe>;
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

// ---------- Resumo de cobrança para Minha assinatura (W18) ----------

export type Pagamento = { tipo: 'cartao'; bandeira: string; final: string; expira: string } | { tipo: 'pix' } | { tipo: 'outro'; nome: string };

export type Cobranca = { data: string; descricao: string; valor: number; moeda: string; recibo: string | null };

export type ResumoDaCobranca = {
  email: string | null;
  plano: { valor: number; moeda: string; intervalo: 'ano' | 'mes' } | null;
  pagamento: Pagamento | null;
  cobrancas: Cobranca[];
};

const BANDEIRAS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  elo: 'Elo',
  hipercard: 'Hipercard',
  diners: 'Diners',
  discover: 'Discover',
  jcb: 'JCB',
};

export function pagamentoDe(metodo: MetodoStripe | null): Pagamento | null {
  if (!metodo) return null;
  if (metodo.type === 'card' && metodo.card) {
    const { brand, last4, exp_month, exp_year } = metodo.card;
    return { tipo: 'cartao', bandeira: BANDEIRAS[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1), final: last4, expira: `${String(exp_month).padStart(2, '0')}/${exp_year}` };
  }
  if (metodo.type === 'pix') return { tipo: 'pix' };
  return { tipo: 'outro', nome: metodo.type };
}

const textoDoPagamento = (p: Pagamento | null) =>
  !p ? null : p.tipo === 'cartao' ? `cartão •••• ${p.final}` : p.tipo === 'pix' ? 'Pix' : p.nome;

/** Mais de 40 dias de período = plano anual. */
const planoDoPeriodo = (periodo: FaturaStripe['periodo']) =>
  !periodo ? null : periodo.end - periodo.start > 40 * 86400 ? 'Plano anual' : 'Plano mensal';

/** Monta o que a tela mostra a partir do Stripe: valores em reais (não em centavos), datas ISO e textos prontos. */
export function resumoDaCobranca(c: CobrancaStripe): ResumoDaCobranca {
  return {
    email: c.email,
    plano: c.assinatura
      ? { valor: c.assinatura.valor / 100, moeda: c.assinatura.moeda.toUpperCase(), intervalo: c.assinatura.intervalo === 'year' ? 'ano' : 'mes' }
      : null,
    pagamento: pagamentoDe(c.assinatura?.metodo ?? null),
    cobrancas: c.faturas
      .filter((f) => f.pagaEm)
      .map((f) => ({
        data: new Date(f.pagaEm! * 1000).toISOString(),
        descricao: [planoDoPeriodo(f.periodo) ?? 'Assinatura', textoDoPagamento(pagamentoDe(f.metodo))].filter(Boolean).join(' · '),
        valor: f.valor / 100,
        moeda: f.moeda.toUpperCase(),
        recibo: f.recibo,
      })),
  };
}
