import { act, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/renderApp';
import { assinaturaDeTeste, perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';
import { ESPERA } from './Retorno';

// O formulário do Stripe roda num iframe que o jsdom não carrega: o teste controla o resultado do confirm().
const stripe = vi.hoisted(() => ({
  opcoes: null as null | { clientSecret: string },
  estado: { type: 'success' } as { type: 'loading' | 'success' | 'error'; error?: { message: string } },
  confirm: null as unknown as ReturnType<typeof vi.fn>,
  formulario: null as null | Record<string, unknown>,
}));

vi.mock('../../lib/stripe', () => ({ carregarStripe: () => Promise.resolve({}) }));
vi.mock('@stripe/react-stripe-js/checkout', () => ({
  CheckoutElementsProvider: ({ options, children }: { options: { clientSecret: string }; children: ReactNode }) => {
    stripe.opcoes = options;
    return children;
  },
  PaymentElement: ({ options }: { options: Record<string, unknown> }) => {
    stripe.formulario = options;
    return <div>Formulário do cartão</div>;
  },
  useCheckoutElements: () =>
    stripe.estado.type === 'success' ? { type: 'success', checkout: { confirm: stripe.confirm } } : stripe.estado,
}));

const torcedor = () => supabaseFalso.logar(perfilDeTeste());
const { invoke } = supabaseFalso.cliente.functions;

beforeEach(() => {
  stripe.opcoes = null;
  stripe.estado = { type: 'success' };
  stripe.confirm = vi.fn(async () => ({ type: 'success', session: { id: 'cs_test_1' } }));
});

describe('pagamento (/assinar/pagamento)', () => {
  it('abre a sessão do Stripe com o plano e a moeda escolhidos e mostra o resumo', async () => {
    torcedor();
    renderApp('/assinar/pagamento?plano=anual&moeda=BRL');
    expect(await screen.findByText('Formulário do cartão')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('criar-checkout', { body: { plano: 'anual', moeda: 'BRL' } });
    expect(stripe.opcoes?.clientSecret).toBe('cs_test_secret_teste');
    expect(screen.getByText('Desconto de 2 meses')).toBeInTheDocument();
    expect(screen.getByText('− R$ 29,80')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar R$ 149,00' })).toBeInTheDocument();
  });

  it('resumo do W14: data da renovação, linhas do pedido e o formulário sem o aviso do Stripe', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
    torcedor();
    renderApp('/assinar/pagamento?plano=anual&moeda=BRL');
    expect(await screen.findByText('renova em 12/10/2027')).toBeInTheDocument();
    expect(screen.getByText('R$ 178,80')).toBeInTheDocument();
    expect(screen.getByText(/Avisamos por e-mail 3 dias antes/)).toBeInTheDocument();
    // O aviso de cobrança recorrente já está na tela; o do Stripe ficaria duplicado.
    expect(stripe.formulario).toMatchObject({ layout: 'tabs', terms: { card: 'never' } });
    vi.useRealTimers();
  });

  it('no mensal, o resumo mostra o dia da cobrança recorrente', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
    torcedor();
    renderApp('/assinar/pagamento?plano=mensal&moeda=BRL');
    expect(await screen.findByText('renova em 12/11/2026')).toBeInTheDocument();
    expect(screen.getByText('Cobrança recorrente')).toBeInTheDocument();
    expect(screen.getByText('todo dia 12')).toBeInTheDocument();
    expect(screen.queryByText('Desconto de 2 meses')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar R$ 14,90' })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('pagamento aprovado leva para a confirmação', async () => {
    torcedor();
    const { user, local } = renderApp('/assinar/pagamento?plano=mensal&moeda=BRL');
    await user.click(await screen.findByRole('button', { name: 'Pagar R$ 14,90' }));
    expect(stripe.confirm).toHaveBeenCalledWith({ redirect: 'if_required' });
    await waitFor(() => expect(local()).toBe('/assinar/retorno'));
  });

  it('cartão recusado mostra o aviso do banco e deixa tentar outro cartão', async () => {
    torcedor();
    stripe.confirm = vi.fn(async () => ({
      type: 'error',
      error: { code: 'paymentFailed', message: 'Your card was declined.', paymentFailed: { declineCode: 'generic_decline' } },
    }));
    const { user, local } = renderApp('/assinar/pagamento?plano=mensal&moeda=BRL');
    await user.click(await screen.findByRole('button', { name: 'Pagar R$ 14,90' }));
    expect(await screen.findByRole('heading', { name: 'O banco recusou o cartão' })).toBeInTheDocument();
    expect(screen.getByText(/Nada foi cobrado/)).toBeInTheDocument();
    expect(local()).toBe('/assinar/pagamento');
    await user.click(screen.getByRole('button', { name: /Tentar outro cartão/ }));
    expect(screen.getByText('Formulário do cartão')).toBeInTheDocument();
  });

  it('outros erros do formulário aparecem junto do pagamento', async () => {
    torcedor();
    stripe.confirm = vi.fn(async () => ({ type: 'error', error: { code: 'incompleteNumber', message: 'O número do cartão está incompleto.' } }));
    const { user } = renderApp('/assinar/pagamento?plano=mensal&moeda=BRL');
    await user.click(await screen.findByRole('button', { name: 'Pagar R$ 14,90' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O número do cartão está incompleto.');
  });

  it('se a sessão não abrir, avisa que nada foi cobrado e deixa tentar de novo', async () => {
    torcedor();
    invoke.mockResolvedValueOnce({ data: null, error: { context: new Response('erro interno', { status: 500 }) } });
    const { user } = renderApp('/assinar/pagamento?plano=mensal&moeda=BRL');
    expect(await screen.findByRole('heading', { name: 'Não deu para abrir o pagamento' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Formulário do cartão')).toBeInTheDocument();
  });

  it('quem já tem assinatura no web app é levado para Minha assinatura', async () => {
    torcedor();
    invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ erro: 'ja_assinante' }), { status: 409 }) } });
    const { local } = renderApp('/assinar/pagamento?plano=mensal&moeda=BRL');
    await waitFor(() => expect(local()).toBe('/conta/assinatura'));
  });
});

describe('retorno do pagamento (/assinar/retorno)', () => {
  const original = { ...ESPERA };
  beforeEach(() => Object.assign(ESPERA, { tentativas: 3, intervaloMs: 20 }));
  afterEach(() => Object.assign(ESPERA, original));

  it('espera o webhook liberar a assinatura e então mostra "Você é membro"', async () => {
    torcedor();
    renderApp('/assinar/retorno?sessao=cs_test_1');
    expect(await screen.findByRole('heading', { name: 'Confirmando seu pagamento' })).toBeInTheDocument();
    // O webhook do Stripe grava a assinatura alguns instantes depois.
    act(() => void supabaseFalso.assinar(assinaturaDeTeste()));
    expect(await screen.findByRole('heading', { name: 'Você é membro' })).toBeInTheDocument();
    expect(await screen.findByText('Plano anual')).toBeInTheDocument();
    expect(screen.getByText('Rafa_9 · Palmeiras')).toBeInTheDocument();
    // Os cadeados do menu somem sem recarregar a página.
    expect(screen.getByRole('navigation')).not.toHaveTextContent('só para membros');
  });

  it('se a confirmação demorar, explica e aponta para Minha assinatura', async () => {
    torcedor();
    renderApp('/assinar/retorno?sessao=cs_test_1');
    expect(await screen.findByRole('heading', { name: 'O pagamento ainda está sendo confirmado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver minha assinatura' })).toHaveAttribute('href', '/conta/assinatura');
  });
});

describe('gestão da assinatura do web app', () => {
  const membroWeb = (campos = {}) => {
    supabaseFalso.assinar(assinaturaDeTeste({ expira_em: '2099-10-11T12:00:00Z', ...campos }));
    supabaseFalso.logar(perfilDeTeste());
  };

  it('cancelar pede confirmação, mantém o acesso até a data e permite reativar', async () => {
    membroWeb();
    const { user, local } = renderApp('/conta/assinatura');
    expect(await screen.findByText(/Cancelando, você mantém tudo liberado até 11\/10\/2099/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Cancelar assinatura' }));
    expect(await screen.findByRole('heading', { name: 'O que você perde' })).toBeInTheDocument();
    expect(local()).toBe('/conta/assinatura/cancelar');

    await user.click(screen.getByRole('button', { name: 'Cancelar assinatura' }));
    await waitFor(() => expect(local()).toBe('/conta/assinatura'));
    expect(invoke).toHaveBeenCalledWith('gerenciar-assinatura', { body: { acao: 'cancelar' } });
    expect(await screen.findByText('CANCELADA')).toBeInTheDocument();
    expect(screen.getByText('R$ 149,00 por ano · não renova · liberado até 11/10/2099')).toBeInTheDocument();
    expect(screen.getByText('Sua assinatura não renova. Tudo continua liberado até 11/10/2099.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reativar assinatura' }));
    expect(await screen.findByText('ATIVA')).toBeInTheDocument();
  });

  it('"Manter assinatura" volta sem cancelar', async () => {
    membroWeb();
    const { user, local } = renderApp('/conta/assinatura/cancelar');
    await user.click(await screen.findByRole('link', { name: 'Manter assinatura' }));
    await waitFor(() => expect(local()).toBe('/conta/assinatura'));
    expect(invoke).not.toHaveBeenCalledWith('gerenciar-assinatura', { body: { acao: 'cancelar' } });
  });

  it('se o cancelamento falhar, avisa e continua na tela', async () => {
    membroWeb();
    invoke.mockResolvedValueOnce({ data: null, error: { context: new Response('{}', { status: 500 }) } });
    const { user, local } = renderApp('/conta/assinatura/cancelar');
    await user.click(await screen.findByRole('button', { name: 'Cancelar assinatura' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para cancelar agora');
    expect(local()).toBe('/conta/assinatura/cancelar');
  });

  it('assinatura das lojas não se cancela aqui', async () => {
    membroWeb({ origem: 'apple' });
    renderApp('/conta/assinatura/cancelar');
    expect(await screen.findByRole('heading', { name: 'Não há assinatura para cancelar aqui' })).toBeInTheDocument();
  });

  it.each(['Trocar de plano', 'Atualizar forma de pagamento', 'Trocar e-mail de cobrança'])('"%s" abre o Portal do Cliente do Stripe', async (botao) => {
    membroWeb();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const { user } = renderApp('/conta/assinatura');
    await user.click(await screen.findByRole('button', { name: botao }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://billing.stripe.com/p/session/teste'));
    expect(invoke).toHaveBeenCalledWith('gerenciar-assinatura', { body: { acao: 'portal' } });
    vi.unstubAllGlobals();
  });

  it('com a renovação recusada, pede para atualizar o cartão', async () => {
    membroWeb({ status: 'atrasada' });
    renderApp('/conta/assinatura');
    expect(await screen.findByText(/A última cobrança não passou/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar cartão' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cancelar assinatura' })).not.toBeInTheDocument();
  });
});
