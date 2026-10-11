import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';
import { perfilDeTeste, perfilNovo, supabaseFalso } from '../test/supabaseFalso';

describe('guards de rota', () => {
  it('manda quem não entrou para /entrar', async () => {
    const { local } = renderApp('/perfil');
    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(local()).toBe('/entrar');
  });

  it('depois do login, volta para a página que o torcedor tentou abrir', async () => {
    const { user, local } = renderApp('/ranking');
    supabaseFalso.cliente.auth.signInWithPassword.mockImplementation(async () => {
      supabaseFalso.logar(perfilDeTeste());
      return { data: {}, error: null };
    });
    await user.type(await screen.findByLabelText('E-mail'), 'rafa@example.com');
    await user.type(screen.getByLabelText('Senha'), 'Senha#2026');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(local()).toBe('/ranking'));
  });

  it('leva quem ainda não escolheu o clube para o onboarding', async () => {
    supabaseFalso.logar(perfilNovo());
    const { local } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'De qual país você torce?' })).toBeInTheDocument();
    expect(local()).toBe('/onboarding');
  });

  it('abre o app para o torcedor com onboarding concluído', async () => {
    supabaseFalso.logar(perfilDeTeste({ apelido: 'Bia.T', time_id: 167 }));
    renderApp('/');
    const header = await screen.findByRole('banner');
    expect(header).toHaveTextContent('Bia.T');
    expect(header).toHaveTextContent('Corinthians');
  });

  it('tira de /entrar quem já está logado', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { local } = renderApp('/entrar');
    await screen.findByRole('banner');
    expect(local()).toBe('/');
  });

  it('mostra erro com saída quando o perfil não carrega', async () => {
    supabaseFalso.logar(perfilDeTeste());
    supabaseFalso.cliente.from.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'Failed to fetch' } }) }) }),
    }));
    const { user, local } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Não deu para carregar seu perfil' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(local()).toBe('/entrar'));
  });

  it('o botão Sair do menu da conta encerra a sessão', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Rafa_9/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Sair' }));
    await waitFor(() => expect(local()).toBe('/entrar'));
    expect(supabaseFalso.cliente.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
