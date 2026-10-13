import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { partidaDeTeste } from '../../test/catalogoDeTeste';
import { renderApp } from '../../test/renderApp';
import { assinaturaDeTeste, perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';

const torcedor = () => supabaseFalso.logar(perfilDeTeste());
const membro = (campos = {}) => {
  supabaseFalso.assinar(assinaturaDeTeste(campos));
  supabaseFalso.logar(perfilDeTeste());
};

describe('bloqueios de assinante', () => {
  it.each([
    ['/escalacao', 'Escalação e palpite'],
    ['/pos-jogo', 'Pós-jogo e notas'],
    ['/missoes', 'Missões'],
    ['/ranking', 'Ranking'],
    ['/fotos', 'Fotos'],
    ['/loja', 'Loja de moedas'],
  ])('quem não é membro vê o bloqueio em %s, sem sair do endereço', async (rota, recurso) => {
    torcedor();
    const { local } = renderApp(rota);
    expect(await screen.findByRole('heading', { name: recurso })).toBeInTheDocument();
    expect(screen.getByText('SÓ PARA MEMBROS')).toBeInTheDocument();
    expect(local()).toBe(rota);
  });

  it('"Ver planos" leva para a escolha do plano', async () => {
    torcedor();
    const { user, local } = renderApp('/ranking');
    await user.click(await screen.findByRole('link', { name: 'Ver planos' }));
    expect(await screen.findByRole('heading', { name: 'Seja membro' })).toBeInTheDocument();
    expect(local()).toBe('/assinar');
  });

  it('membro entra direto nas páginas de assinante', async () => {
    membro();
    renderApp('/ranking');
    expect(await screen.findByRole('heading', { name: 'Ranking' })).toBeInTheDocument();
    expect(screen.queryByText('SÓ PARA MEMBROS')).not.toBeInTheDocument();
  });

  it('assinatura cancelada continua liberando até a data final', async () => {
    membro({ status: 'cancelada' });
    renderApp('/fotos');
    await screen.findByRole('banner');
    await waitFor(() => expect(screen.queryByText('SÓ PARA MEMBROS')).not.toBeInTheDocument());
  });

  it('assinatura expirada volta a bloquear', async () => {
    membro({ status: 'expirada', expira_em: '2026-01-01T00:00:00Z' });
    renderApp('/fotos');
    expect(await screen.findByText('SÓ PARA MEMBROS')).toBeInTheDocument();
  });

  it('o menu mostra cadeado só nos itens de assinante, e só para quem não é membro', async () => {
    torcedor();
    renderApp('/');
    const menu = await screen.findByRole('navigation');
    expect(within(menu).getByRole('link', { name: /Ranking/ })).toHaveTextContent('só para membros');
    expect(within(menu).getByRole('link', { name: /Notícias/ })).not.toHaveTextContent('só para membros');
    expect(within(menu).getByRole('link', { name: /Jogos/ })).not.toHaveTextContent('só para membros');
  });

  it('membro não vê cadeados no menu', async () => {
    membro();
    renderApp('/');
    const menu = await screen.findByRole('navigation');
    await waitFor(() => expect(menu).not.toHaveTextContent('só para membros'));
  });

  it('no jogo ao vivo, o placar é livre e só o chat fica bloqueado', async () => {
    supabaseFalso.adicionarPartida(partidaDeTeste());
    torcedor();
    renderApp('/jogo/7290');
    expect(await screen.findByText('Chat da torcida')).toBeInTheDocument();
    expect(screen.getByLabelText('Placar: 1 a 0')).toBeInTheDocument();
    expect(screen.getByText(/O chat da torcida é para membros/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Manda a real pra torcida')).not.toBeInTheDocument();
  });

  it('membro conversa no chat do jogo ao vivo', async () => {
    supabaseFalso.adicionarPartida(partidaDeTeste());
    membro();
    renderApp('/jogo/7290');
    expect(await screen.findByPlaceholderText('Manda a real pra torcida')).toBeInTheDocument();
  });

  it('se a checagem da assinatura falhar, o torcedor entra como não membro', async () => {
    torcedor();
    supabaseFalso.cliente.rpc.mockImplementation(async () => ({ data: null, error: { message: 'Failed to fetch' } }));
    renderApp('/ranking');
    expect(await screen.findByText('SÓ PARA MEMBROS')).toBeInTheDocument();
  });
});

describe('planos (/assinar)', () => {
  it('abre no anual em reais, com o preço por mês e o total do ano', async () => {
    torcedor();
    renderApp('/assinar');
    const anual = await screen.findByRole('radio', { name: /Anual/ });
    expect(anual).toHaveAttribute('aria-checked', 'true');
    expect(anual).toHaveTextContent('R$ 12,42/mês');
    expect(anual).toHaveTextContent('R$ 149,00 por ano · 2 meses grátis');
    expect(screen.getByRole('radio', { name: /Mensal/ })).toHaveTextContent('R$ 14,90/mês');
    expect(screen.getByText('Plano anual · R$ 149,00 por ano')).toBeInTheDocument();
  });

  it('lista os benefícios com os textos do design (W13)', async () => {
    torcedor();
    renderApp('/assinar');
    expect(await screen.findByRole('heading', { name: 'Os dois planos liberam' })).toBeInTheDocument();
    expect(screen.getByText('Moedas para a loja')).toBeInTheDocument();
    expect(screen.getByText('Troque por produtos oficiais e prêmios do clube.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuar para pagamento/ })).toBeInTheDocument();
  });

  it('respeita o plano e a moeda que vêm do site', async () => {
    torcedor();
    renderApp('/assinar?plano=mensal&moeda=USD');
    const mensal = await screen.findByRole('radio', { name: /Mensal/ });
    expect(mensal).toHaveAttribute('aria-checked', 'true');
    expect(mensal).toHaveTextContent('US$ 5,90/mês');
    expect(screen.getByRole('radio', { name: /Anual/ })).toHaveTextContent('US$ 59,00 por ano');
    expect(screen.getByText('Plano mensal · US$ 5,90 por mês')).toBeInTheDocument();
  });

  it('trocar o plano atualiza o resumo e leva a escolha para o pagamento', async () => {
    torcedor();
    const { user, local } = renderApp('/assinar');
    await user.click(await screen.findByRole('radio', { name: /Mensal/ }));
    expect(screen.getByRole('radio', { name: /Mensal/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Plano mensal · R$ 14,90 por mês')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }));
    await waitFor(() => expect(local()).toBe('/assinar/pagamento'));
    expect(supabaseFalso.cliente.functions.invoke).toHaveBeenCalledWith('criar-checkout', { body: { plano: 'mensal', moeda: 'BRL' } });
  });

  it('"Agora não" volta para o início', async () => {
    torcedor();
    const { user, local } = renderApp('/assinar');
    await user.click(await screen.findByRole('button', { name: 'Agora não' }));
    await waitFor(() => expect(local()).toBe('/'));
  });

  it('quem assinou pela loja vai direto para Minha assinatura (troca de plano fica na loja)', async () => {
    membro({ origem: 'apple' });
    const { local } = renderApp('/assinar');
    expect(await screen.findByRole('heading', { name: 'Minha assinatura' })).toBeInTheDocument();
    expect(local()).toBe('/conta/assinatura');
  });

  it('assinatura cancelada não troca de plano: volta para Minha assinatura', async () => {
    membro({ status: 'cancelada' });
    const { local } = renderApp('/assinar?plano=mensal');
    await waitFor(() => expect(local()).toBe('/conta/assinatura'));
  });
});

describe('Minha assinatura (/conta/assinatura)', () => {
  it('sem assinatura (W18): o que a assinatura libera, o preço, a dica do app e nenhuma cobrança', async () => {
    torcedor();
    renderApp('/conta/assinatura');
    expect(await screen.findByRole('heading', { name: 'Você ainda não é membro' })).toBeInTheDocument();
    expect(screen.getByText('SEM ASSINATURA')).toBeInTheDocument();
    expect(screen.getByText('Palpites, escalação e notas')).toBeInTheDocument();
    expect(screen.getByText('R$ 12,42')).toBeInTheDocument();
    expect(screen.getByText('plano anual · R$ 149,00 · cancele quando quiser')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver planos/ })).toHaveAttribute('href', '/assinar');
    expect(screen.getByText('Já assinou pelo app?')).toBeInTheDocument();
    expect(await screen.findByText('Nenhuma cobrança por aqui.')).toBeInTheDocument();
  });

  it('com assinatura do web app (W18): plano, preço, renovação, cartão, e-mail e cobranças', async () => {
    membro();
    renderApp('/conta/assinatura');
    expect(await screen.findByRole('heading', { name: 'Plano anual' })).toBeInTheDocument();
    expect(screen.getByText('ATIVA')).toBeInTheDocument();
    expect(await screen.findByText(`R$ 149,00 por ano · renova em ${new Date('2027-10-11T12:00:00Z').toLocaleDateString('pt-BR')}`)).toBeInTheDocument();
    expect(screen.getByText('Cartão •••• 4242')).toBeInTheDocument();
    expect(screen.getByText('Visa · expira 08/2029')).toBeInTheDocument();
    expect(screen.getByText('Avisos de cobrança')).toBeInTheDocument();
    const cobrancas = screen.getByRole('list', { name: 'Cobranças pagas' });
    expect(cobrancas).toHaveTextContent('Plano anual · cartão •••• 4242');
    expect(cobrancas).toHaveTextContent('PAGO');
    expect(screen.getByText('Assinou pelo app? A gestão fica nos ajustes da App Store ou do Google Play.')).toBeInTheDocument();
    expect(screen.queryByText('Já assinou pelo app?')).not.toBeInTheDocument();
  });

  it('assinatura feita na App Store manda gerenciar por lá, sem cartão nem cancelamento aqui', async () => {
    membro({ origem: 'apple', plano: 'mensal' });
    renderApp('/conta/assinatura');
    expect(await screen.findByRole('heading', { name: 'Plano mensal' })).toBeInTheDocument();
    expect(screen.getByText(/pela App Store · renova em/)).toBeInTheDocument();
    expect(screen.getByText(/Você assinou pela App Store\. Troca de plano e cancelamento ficam nos ajustes da App Store\./)).toBeInTheDocument();
    expect(screen.queryByText('Avisos de cobrança')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cancelar assinatura' })).not.toBeInTheDocument();
  });

  it('assinatura expirada volta à versão sem assinatura e oferece assinar de novo', async () => {
    membro({ status: 'expirada', expira_em: '2026-01-01T12:00:00Z' });
    renderApp('/conta/assinatura');
    expect(await screen.findByText('EXPIRADA')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Volte a ser membro' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Assinar de novo/ })).toHaveAttribute('href', '/assinar');
  });

  it('o menu da conta leva para Minha assinatura', async () => {
    torcedor();
    const { user, local } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Rafa_9/ }));
    await user.click(screen.getByRole('menuitem', { name: /Minha assinatura/ }));
    await waitFor(() => expect(local()).toBe('/conta/assinatura'));
  });
});
