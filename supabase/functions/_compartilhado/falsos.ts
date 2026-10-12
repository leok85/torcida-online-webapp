// Banco e Stripe em memória para os testes das Edge Functions (Vitest).
import { vi } from 'vitest';
import { CorreioIndisponivel, type AssinaturaStripe, type Banco, type CodigoDeEmail, type CobrancaStripe, type Correio, type LinhaAssinatura, type Pagamentos, type Usuario } from './assinatura';

export const RAFA: Usuario = { id: 'usuario-1', email: 'rafa@example.com' };
const UM_MES = 30 * 86400;

/** Subscription ativa do Stripe, com o período terminando daqui a um mês. */
export function subStripe(campos: Partial<AssinaturaStripe> & { intervalo?: string; fim?: number } = {}): AssinaturaStripe {
  const { intervalo = 'month', fim = Math.floor(Date.now() / 1000) + UM_MES, ...resto } = campos;
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    cancel_at: null,
    ended_at: null,
    items: { data: [{ current_period_end: fim, price: { recurring: { interval: intervalo } } }] },
    ...resto,
  };
}

export function criarFalsos() {
  const tokens = new Map<string, Usuario>([['token-rafa', RAFA]]);
  const clientes = new Map<string, string>();
  const assinaturas: (LinhaAssinatura & { criado_em: string })[] = [];
  const subs = new Map<string, AssinaturaStripe>();
  const codigos = new Map<string, CodigoDeEmail>();
  // Último código enviado por e-mail (o teste lê como a pessoa leria na caixa de entrada).
  const enviados: { para: string; codigo: string }[] = [];
  let correioLigado = true;
  // Troca de plano: o próximo cartão recusa?
  let recusar = false;
  // Plano anual no cartão, com uma fatura anual no cartão e duas mensais no Pix.
  const cobranca: CobrancaStripe = {
    email: 'rafa@example.com',
    assinatura: { valor: 14900, moeda: 'brl', intervalo: 'year', metodo: { type: 'card', card: { brand: 'visa', last4: '4242', exp_month: 8, exp_year: 2029 } } },
    faturas: [
      { pagaEm: 1791720000, valor: 14900, moeda: 'brl', periodo: { start: 1791720000, end: 1823256000 }, metodo: { type: 'card', card: { brand: 'visa', last4: '4242', exp_month: 8, exp_year: 2029 } }, recibo: 'https://invoice.stripe.com/i/1' },
      { pagaEm: 1789128000, valor: 1490, moeda: 'brl', periodo: { start: 1789128000, end: 1791720000 }, metodo: { type: 'pix' }, recibo: null },
      { pagaEm: null, valor: 0, moeda: 'brl', periodo: null, metodo: null, recibo: null },
    ],
  };

  const banco: Banco = {
    usuarioDoToken: vi.fn(async (jwt: string) => tokens.get(jwt) ?? null),
    clienteDo: vi.fn(async (id: string) => clientes.get(id) ?? null),
    salvarCliente: vi.fn(async (id: string, customer: string) => {
      if (!clientes.has(id)) clientes.set(id, customer);
      return clientes.get(id)!;
    }),
    usuarioDoCliente: vi.fn(async (customer: string) => [...clientes].find(([, c]) => c === customer)?.[0] ?? null),
    assinaturaWebEmAndamento: vi.fn(async (id: string) => {
      const atual = [...assinaturas]
        .reverse()
        .find((a) => a.usuario_id === id && (a.status === 'pendente' || (['ativa', 'atrasada', 'cancelada'].includes(a.status) && new Date(a.expira_em!) > new Date())));
      return atual ? { id_externo: atual.id_externo, status: atual.status } : null;
    }),
    gravarAssinatura: vi.fn(async (linha: LinhaAssinatura) => {
      const i = assinaturas.findIndex((a) => a.id_externo === linha.id_externo);
      if (i >= 0) assinaturas[i] = { ...assinaturas[i], ...linha };
      else assinaturas.push({ ...linha, criado_em: new Date().toISOString() });
    }),
    guardarCodigoDeEmail: vi.fn(async (id: string, c: { email: string; hash: string; expiraEm: string }) => {
      codigos.set(id, { ...c, tentativas: 0 });
    }),
    codigoDeEmail: vi.fn(async (id: string) => codigos.get(id) ?? null),
    errouCodigoDeEmail: vi.fn(async (id: string) => {
      const c = codigos.get(id);
      if (c) c.tentativas += 1;
    }),
    apagarCodigoDeEmail: vi.fn(async (id: string) => {
      codigos.delete(id);
    }),
  };

  const pagamentos: Pagamentos = {
    criarCliente: vi.fn(async () => `cus_${clientes.size + 1}`),
    precoPorChave: vi.fn(async (chave: string) => `price_${chave}`),
    criarSessao: vi.fn(async () => 'cs_secret_teste'),
    buscarAssinatura: vi.fn(async (id: string) => {
      const sub = subs.get(id);
      if (!sub) throw new Error(`No such subscription: ${id}`);
      return sub;
    }),
    cancelarNoFimDoPeriodo: vi.fn(async (id: string, cancelar: boolean) => {
      const sub = subs.get(id)!;
      subs.set(id, { ...sub, cancel_at_period_end: cancelar, cancel_at: cancelar ? sub.items.data[0].current_period_end : null });
    }),
    cancelarAgora: vi.fn(async () => {}),
    // Mensal → anual com metade do mês usada: R$ 149,00 menos R$ 7,45 de crédito.
    previaDaTroca: vi.fn(async () => ({ valor: 14900, credito: 745, total: 14155, moeda: 'brl', renovaEm: 1823256000 })),
    trocarPlano: vi.fn(async (id: string, preco: string) => {
      if (recusar) return 'recusado' as const;
      const sub = subs.get(id)!;
      const intervalo = preco.endsWith('anual') ? 'year' : 'month';
      subs.set(id, { ...sub, items: { data: [{ ...sub.items.data[0], price: { recurring: { interval: intervalo } } }] } });
      return 'ok' as const;
    }),
    criarSessaoDeCartao: vi.fn(async () => 'cs_setup_secret_teste'),
    definirCartao: vi.fn(async (_customer: string, sessao: string) => sessao === 'cs_test_cartao'),
    trocarEmailDeCobranca: vi.fn(async (_customer: string, email: string) => {
      cobranca.email = email;
    }),
    buscarCobranca: vi.fn(async (): Promise<CobrancaStripe> => cobranca),
  };

  const correio: Correio = {
    enviarCodigoDeCobranca: vi.fn(async (para: string, codigo: string) => {
      if (!correioLigado) throw new CorreioIndisponivel();
      enviados.push({ para, codigo });
    }),
  };

  return {
    banco,
    pagamentos,
    correio,
    tokens,
    clientes,
    assinaturas,
    subs,
    cobranca,
    codigos,
    enviados,
    desligarCorreio: () => (correioLigado = false),
    recusarCartao: () => (recusar = true),
  };
}

export const pedido = (url: string, init: RequestInit & { corpo?: object } = {}) => {
  const { corpo, headers, ...resto } = init;
  return new Request(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer token-rafa', ...headers },
    body: corpo ? JSON.stringify(corpo) : undefined,
    ...resto,
  });
};
