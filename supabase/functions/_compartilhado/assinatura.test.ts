import { describe, expect, it } from 'vitest';
import { linhaDaAssinatura } from './assinatura';
import { subStripe } from './falsos';

const FIM = 1_800_000_000;
const fim = new Date(FIM * 1000).toISOString();

describe('linhaDaAssinatura', () => {
  it('assinatura ativa vale até o fim do período e diz o plano pelo intervalo do preço', () => {
    expect(linhaDaAssinatura(subStripe({ fim: FIM }), 'usuario-1')).toEqual({
      usuario_id: 'usuario-1',
      origem: 'web',
      id_externo: 'sub_1',
      plano: 'mensal',
      status: 'ativa',
      expira_em: fim,
    });
    expect(linhaDaAssinatura(subStripe({ intervalo: 'year' }), 'usuario-1').plano).toBe('anual');
  });

  it('cancelada no fim do período continua liberada até lá, sem renovar', () => {
    const linha = linhaDaAssinatura(subStripe({ fim: FIM, cancel_at_period_end: true }), 'usuario-1');
    expect(linha).toMatchObject({ status: 'cancelada', expira_em: fim });
  });

  it('com data de fim marcada (cancel_at), vale até essa data', () => {
    const linha = linhaDaAssinatura(subStripe({ fim: FIM, cancel_at: FIM - 100 }), 'usuario-1');
    expect(linha).toMatchObject({ status: 'cancelada', expira_em: new Date((FIM - 100) * 1000).toISOString() });
  });

  it('renovação recusada vira atrasada', () => {
    expect(linhaDaAssinatura(subStripe({ status: 'past_due' }), 'u').status).toBe('atrasada');
    expect(linhaDaAssinatura(subStripe({ status: 'unpaid' }), 'u').status).toBe('atrasada');
  });

  it('pagamento inicial ainda não concluído fica pendente, sem validade', () => {
    expect(linhaDaAssinatura(subStripe({ status: 'incomplete' }), 'u')).toMatchObject({ status: 'pendente', expira_em: null });
  });

  it('encerrada vira expirada com a data em que terminou', () => {
    const linha = linhaDaAssinatura(subStripe({ status: 'canceled', ended_at: FIM - 50 }), 'u');
    expect(linha).toMatchObject({ status: 'expirada', expira_em: new Date((FIM - 50) * 1000).toISOString() });
    expect(linhaDaAssinatura(subStripe({ status: 'incomplete_expired' }), 'u').status).toBe('expirada');
  });
});
