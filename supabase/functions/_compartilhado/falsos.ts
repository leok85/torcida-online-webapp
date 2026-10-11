// Banco e Stripe em memória para os testes das Edge Functions (Vitest).
import { vi } from 'vitest';
import type { AssinaturaStripe, Banco, LinhaAssinatura, Pagamentos, Usuario } from './assinatura';

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
    criarPortal: vi.fn(async (customer: string) => `https://billing.stripe.com/p/session/${customer}`),
  };

  return { banco, pagamentos, tokens, clientes, assinaturas, subs };
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
