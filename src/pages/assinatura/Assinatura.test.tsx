import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    expect(within(menu).getByRole('link', { name: /Jogo ao vivo/ })).not.toHaveTextContent('só para membros');
  });

  it('membro não vê cadeados no menu', async () => {
    membro();
    renderApp('/');
    const menu = await screen.findByRole('navigation');
    await waitFor(() => expect(menu).not.toHaveTextContent('só para membros'));
  });

  it('no jogo ao vivo, o placar é livre e só o chat fica bloqueado', async () => {
    torcedor();
    renderApp('/ao-vivo');
    expect(await screen.findByText('Chat da torcida')).toBeInTheDocument();
    expect(screen.getByText(/O chat da torcida é para membros/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Manda a real pra torcida')).not.toBeInTheDocument();
  });

  it('membro conversa no chat do jogo ao vivo', async () => {
    membro();
    renderApp('/ao-vivo');
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
    expect(await screen.findByRole('heading', { name: 'O pagamento online abre em breve' })).toBeInTheDocument();
    expect(local()).toBe('/assinar/pagamento');
    expect(screen.getByText(/plano mensal por R\$ 14,90 por mês/)).toBeInTheDocument();
  });

  it('"Agora não" volta para o início', async () => {
    torcedor();
    const { user, local } = renderApp('/assinar');
    await user.click(await screen.findByRole('button', { name: 'Agora não' }));
    await waitFor(() => expect(local()).toBe('/'));
  });

  it('quem já é membro vai direto para Minha assinatura', async () => {
    membro();
    const { local } = renderApp('/assinar');
    expect(await screen.findByRole('heading', { name: 'Minha assinatura' })).toBeInTheDocument();
    expect(local()).toBe('/conta/assinatura');
  });
});

describe('Minha assinatura (/conta/assinatura)', () => {
  it('sem assinatura, convida a ver os planos', async () => {
    torcedor();
    renderApp('/conta/assinatura');
    expect(await screen.findByRole('heading', { name: 'Você ainda não é membro' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver planos' })).toHaveAttribute('href', '/assinar');
  });

  it('mostra a assinatura ativa do web app com a data de renovação', async () => {
    membro();
    renderApp('/conta/assinatura');
    expect(await screen.findByRole('heading', { name: 'Plano anual' })).toBeInTheDocument();
    expect(screen.getByText('ATIVA')).toBeInTheDocument();
    expect(screen.getByText(`renova em ${new Date('2027-10-11T12:00:00Z').toLocaleDateString('pt-BR')}`)).toBeInTheDocument();
    expect(screen.queryByText(/App Store|Google Play/)).not.toBeInTheDocument();
  });

  it('assinatura feita na App Store manda gerenciar por lá', async () => {
    membro({ origem: 'apple', plano: 'mensal' });
    renderApp('/conta/assinatura');
    expect(await screen.findByRole('heading', { name: 'Plano mensal' })).toBeInTheDocument();
    expect(screen.getByText(/Você assinou pela App Store\. Troca de plano e cancelamento ficam nos ajustes da App Store\./)).toBeInTheDocument();
  });

  it('assinatura expirada oferece assinar de novo', async () => {
    membro({ status: 'expirada', expira_em: '2026-01-01T12:00:00Z' });
    renderApp('/conta/assinatura');
    expect(await screen.findByText('EXPIRADA')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Assinar de novo' })).toHaveAttribute('href', '/assinar');
  });

  it('o menu da conta leva para Minha assinatura', async () => {
    torcedor();
    const { user, local } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Rafa_9/ }));
    await user.click(screen.getByRole('menuitem', { name: /Minha assinatura/ }));
    await waitFor(() => expect(local()).toBe('/conta/assinatura'));
  });
});
