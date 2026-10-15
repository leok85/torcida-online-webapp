import { describe, expect, it, vi } from 'vitest';
import { inicioDoMes, receitaDoMes, type Dependencias } from './handler';

const pedido = (token: string | null = 'jwt', metodo = 'POST') =>
  new Request('http://local/receita-do-mes', { method: metodo, headers: token ? { Authorization: `Bearer ${token}` } : {} });

const deps = (extra: Partial<Dependencias> = {}): Dependencias => ({
  papelDoToken: vi.fn(async () => 'super_admin'),
  movimentos: vi.fn(async () => [
    { tipo: 'charge', valor: 1490, moeda: 'brl' },
    { tipo: 'charge', valor: 14900, moeda: 'brl' },
    { tipo: 'payment', valor: 1490, moeda: 'brl' },
    { tipo: 'refund', valor: -1490, moeda: 'brl' },
    { tipo: 'stripe_fee', valor: -99, moeda: 'brl' },
    { tipo: 'payout', valor: -10000, moeda: 'brl' },
  ]),
  assinantes: vi.fn(async () => 42),
  agora: () => new Date('2026-10-15T15:00:00Z'),
  ...extra,
});

describe('inicioDoMes', () => {
  it('é o dia 1º à meia-noite de Brasília', () => {
    expect(inicioDoMes(new Date('2026-10-15T15:00:00Z'))).toEqual({ segundos: Date.parse('2026-10-01T03:00:00Z') / 1000, mes: '2026-10' });
  });

  it('na virada do mês ainda vale o mês de Brasília', () => {
    expect(inicioDoMes(new Date('2026-11-01T02:30:00Z')).mes).toBe('2026-10');
    expect(inicioDoMes(new Date('2026-11-01T03:00:00Z')).mes).toBe('2026-11');
  });
});

describe('receitaDoMes', () => {
  it('soma pagamentos e desconta reembolsos, sem taxas nem repasses', async () => {
    const d = deps();
    const resposta = await receitaDoMes(pedido(), d);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ mes: '2026-10', moeda: 'BRL', arrecadado: 163.9, pagamentos: 3, assinantes: 42, ticket: 54.63 });
    expect(d.movimentos).toHaveBeenCalledWith(Date.parse('2026-10-01T03:00:00Z') / 1000);
  });

  it('mês sem pagamentos', async () => {
    const resposta = await receitaDoMes(pedido(), deps({ movimentos: async () => [] }));
    expect(await resposta.json()).toMatchObject({ arrecadado: 0, pagamentos: 0, ticket: 0, moeda: 'BRL' });
  });

  it('analista também lê', async () => {
    const resposta = await receitaDoMes(pedido(), deps({ papelDoToken: async () => 'analista' }));
    expect(resposta.status).toBe(200);
  });

  it.each([['editor'], ['moderador'], [null]])('papel %s não lê', async (papel) => {
    const d = deps({ papelDoToken: async () => papel });
    const resposta = await receitaDoMes(pedido(), d);
    expect(resposta.status).toBe(401);
    expect(d.movimentos).not.toHaveBeenCalled();
  });

  it('sem token não lê', async () => {
    expect((await receitaDoMes(pedido(null), deps())).status).toBe(401);
  });

  it('só POST', async () => {
    expect((await receitaDoMes(pedido('jwt', 'GET'), deps())).status).toBe(405);
  });
});
