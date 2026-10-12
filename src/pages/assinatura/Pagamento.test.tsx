import { act, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/renderApp';
import { assinaturaDeTeste, CODIGO_DE_TESTE, perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';
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

  it('com a renovação recusada, pede para atualizar o cartão', async () => {
    membroWeb({ status: 'atrasada' });
    renderApp('/conta/assinatura');
    expect(await screen.findByText(/A última cobrança não passou/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar cartão' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cancelar assinatura' })).not.toBeInTheDocument();
  });
});

describe('Minha assinatura seguindo o design (W18): plano, cartão e e-mail de cobrança', () => {
  const membroWeb = (campos = {}) => {
    supabaseFalso.assinar(assinaturaDeTeste({ expira_em: '2099-10-11T12:00:00Z', ...campos }));
    supabaseFalso.logar(perfilDeTeste());
  };
  const aviso = () => screen.findByRole('status');

  it('"Trocar de plano" leva aos planos com o plano atual marcado e o outro escolhido', async () => {
    membroWeb();
    const { user, local } = renderApp('/conta/assinatura');
    await user.click(await screen.findByRole('button', { name: 'Trocar de plano' }));
    expect(await screen.findByRole('heading', { name: 'Trocar de plano' })).toBeInTheDocument();
    expect(local()).toBe('/assinar');
    const anual = screen.getByRole('radio', { name: /Anual/ });
    expect(anual).toBeDisabled();
    expect(anual).toHaveTextContent('SEU PLANO');
    expect(screen.getByRole('radio', { name: /Mensal/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('anual → mensal: o crédito cobre o mês, confirma sem cobrar e volta com o plano novo', async () => {
    membroWeb();
    const { user, local } = renderApp('/assinar?plano=mensal');
    await user.click(await screen.findByRole('button', { name: /Continuar para pagamento/ }));
    expect(await screen.findByText('Crédito do plano anual')).toBeInTheDocument();
    expect(screen.getByText('Cartão •••• 4242')).toBeInTheDocument();
    expect(screen.getByText('R$ 0,00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar troca' }));
    expect(await aviso()).toHaveTextContent('Plano mensal ativado');
    expect(local()).toBe('/conta/assinatura');
    expect(await screen.findByRole('heading', { name: 'Plano mensal' })).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('gerenciar-assinatura', { body: { acao: 'trocar-plano', plano: 'mensal' } });
  });

  it('mensal → anual: mostra o total de hoje já com o crédito e cobra ao confirmar', async () => {
    membroWeb({ plano: 'mensal' });
    const { user } = renderApp('/assinar/pagamento?plano=anual');
    expect(await screen.findByText('− R$ 7,45')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pagar R$ 141,55' }));
    expect(await aviso()).toHaveTextContent('Plano anual ativado');
  });

  it('troca recusada pelo banco mostra o aviso e leva para cadastrar outro cartão', async () => {
    membroWeb();
    supabaseFalso.recusarTrocaDePlano();
    const { user, local } = renderApp('/assinar/pagamento?plano=mensal');
    await user.click(await screen.findByRole('button', { name: 'Confirmar troca' }));
    expect(await screen.findByRole('heading', { name: 'O banco recusou o cartão' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Tentar outro cartão/ }));
    expect(local()).toBe('/assinar/pagamento');
    expect(await screen.findByRole('button', { name: 'Salvar cartão' })).toBeInTheDocument();
  });

  it('"Atualizar" abre o pagamento com o formulário de cartão e, ao salvar, usa o cartão na assinatura', async () => {
    membroWeb();
    const { user, local } = renderApp('/conta/assinatura');
    await user.click(await screen.findByRole('button', { name: 'Atualizar forma de pagamento' }));
    expect(await screen.findByText('Formulário do cartão')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('gerenciar-assinatura', { body: { acao: 'sessao-cartao' } });
    expect(stripe.opcoes?.clientSecret).toBe('cs_setup_secret_teste');
    await user.click(screen.getByRole('button', { name: 'Salvar cartão' }));
    expect(await aviso()).toHaveTextContent('Cartão atualizado');
    expect(local()).toBe('/conta/assinatura');
    expect(invoke).toHaveBeenCalledWith('gerenciar-assinatura', { body: { acao: 'definir-cartao', sessao: 'cs_test_1' } });
  });

  it('com a renovação recusada, o cartão novo resolve a cobrança pendente', async () => {
    membroWeb({ status: 'atrasada' });
    const { user } = renderApp('/conta/assinatura');
    await user.click(await screen.findByRole('button', { name: 'Atualizar cartão' }));
    expect(await screen.findByText('A cobrança que não passou é tentada de novo neste cartão.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar cartão' }));
    expect(await screen.findByText('ATIVA')).toBeInTheDocument();
  });

  it('volta do banco com ?cartao= liga o cartão à assinatura', async () => {
    membroWeb();
    const { local } = renderApp('/conta/assinatura?cartao=cs_test_volta');
    expect(await aviso()).toHaveTextContent('Cartão atualizado');
    expect(invoke).toHaveBeenCalledWith('gerenciar-assinatura', { body: { acao: 'definir-cartao', sessao: 'cs_test_volta' } });
    expect(local()).toBe('/conta/assinatura');
  });

  it('e-mail de cobrança: outro endereço só vale depois do código; depois dá para voltar ao da conta', async () => {
    membroWeb();
    const { user } = renderApp('/conta/assinatura');
    expect(await screen.findByText('rafa@example.com · e-mail da conta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Trocar e-mail de cobrança' }));
    const editor = screen.getByRole('form', { name: 'Onde receber os avisos de cobrança' });
    expect(within(editor).getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await user.click(within(editor).getByRole('radio', { name: /Usar outro e-mail/ }));
    await user.type(screen.getByRole('textbox', { name: 'Novo e-mail de cobrança' }), 'financeiro@');
    expect(screen.getByText('Confira o formato do e-mail.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Novo e-mail de cobrança' }), 'email.com');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));

    const codigo = await screen.findByRole('form', { name: 'Confirme o e-mail de cobrança' });
    expect(codigo).toHaveTextContent('enviado para financeiro@email.com');
    await user.type(within(codigo).getByLabelText('Código de 6 dígitos'), '000000');
    await user.click(within(codigo).getByRole('button', { name: 'Confirmar' }));
    expect(await within(codigo).findByRole('alert')).toHaveTextContent('Código incorreto');
    await user.clear(within(codigo).getByLabelText('Código de 6 dígitos'));
    await user.type(within(codigo).getByLabelText('Código de 6 dígitos'), CODIGO_DE_TESTE);
    await user.click(within(codigo).getByRole('button', { name: 'Confirmar' }));
    expect(await aviso()).toHaveTextContent('Avisos de cobrança vão para financeiro@email.com');
    expect(await screen.findByText('financeiro@email.com · e-mail separado')).toBeInTheDocument();
    expect(supabaseFalso.emailDeCobranca()).toBe('financeiro@email.com');

    await user.click(screen.getByRole('button', { name: 'Trocar e-mail de cobrança' }));
    await user.click(screen.getByRole('radio', { name: /Usar o e-mail da conta/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('rafa@example.com · e-mail da conta')).toBeInTheDocument();
    expect(supabaseFalso.emailDeCobranca()).toBeNull();
  });
});
