import { AuthApiError } from '@supabase/supabase-js';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp';
import { perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';

const { auth } = supabaseFalso.cliente;

async function preencher(user: ReturnType<typeof renderApp>['user'], email: string, senha: string) {
  await user.type(await screen.findByLabelText('E-mail'), email);
  await user.type(screen.getByLabelText('Senha'), senha);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('Entrar', () => {
  it('entra com e-mail normalizado e lembra a sessão por padrão', async () => {
    auth.signInWithPassword.mockImplementation(async () => {
      supabaseFalso.logar(perfilDeTeste());
      return { data: {}, error: null };
    });
    const { user, local } = renderApp('/entrar');
    await preencher(user, '  Rafa@Example.COM ', 'Senha#2026');

    await waitFor(() => expect(local()).toBe('/'));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'rafa@example.com', password: 'Senha#2026' });
    expect(supabaseFalso.setManterConectado).toHaveBeenCalledWith(true);
  });

  it('desmarcar "Manter conectado" deixa a sessão só nesta aba', async () => {
    const { user } = renderApp('/entrar');
    await user.click(await screen.findByRole('checkbox', { name: 'Manter conectado' }));
    await preencher(user, 'rafa@example.com', 'Senha#2026');
    expect(supabaseFalso.setManterConectado).toHaveBeenCalledWith(false);
  });

  it('mostra erro de credenciais em português', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials') });
    const { user, local } = renderApp('/entrar');
    await preencher(user, 'rafa@example.com', 'errada');
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
    expect(local()).toBe('/entrar');
  });

  it('não chama o servidor com campos vazios', async () => {
    const { user } = renderApp('/entrar');
    await user.click(await screen.findByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Preencha seu e-mail e sua senha.');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('e-mail não confirmado: oferece um código novo e leva para a verificação', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: new AuthApiError('Email not confirmed', 400, 'email_not_confirmed') });
    const { user, local } = renderApp('/entrar');
    await preencher(user, 'pendente@example.com', 'Senha#2026');

    await user.click(await screen.findByRole('button', { name: 'Enviar código' }));
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'pendente@example.com' });
    await waitFor(() => expect(local()).toBe('/verificar-email'));
    expect(screen.getByText(/Enviamos um código de 6 dígitos para/)).toHaveTextContent('pendente@example.com');
  });

  it('"Esqueci a senha" leva o e-mail digitado para a recuperação', async () => {
    const { user, local } = renderApp('/entrar');
    await user.type(await screen.findByLabelText('E-mail'), 'rafa@example.com');
    await user.click(screen.getByRole('link', { name: 'Esqueci a senha' }));
    expect(local()).toBe('/recuperar-senha');
    expect(screen.getByLabelText('E-mail')).toHaveValue('rafa@example.com');
  });

  it('o botão do Google só aparece com o provedor ligado no Supabase', async () => {
    renderApp('/entrar');
    await screen.findByRole('button', { name: 'Entrar' });
    expect(screen.queryByRole('button', { name: 'Google' })).not.toBeInTheDocument();
  });

  it('com o Google ligado, inicia o OAuth voltando para o app', async () => {
    supabaseFalso.provedoresAtivos.mockResolvedValue({ google: true });
    const { user } = renderApp('/entrar');
    await user.click(await screen.findByRole('button', { name: 'Google' }));
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } });
  });
});
