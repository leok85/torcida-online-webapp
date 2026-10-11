import { AuthApiError } from '@supabase/supabase-js';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp';
import { perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';

const { auth } = supabaseFalso.cliente;

async function pedirCodigo(user: ReturnType<typeof renderApp>['user']) {
  await user.type(await screen.findByLabelText('E-mail'), 'rafa@example.com');
  await user.click(screen.getByRole('button', { name: 'Enviar código' }));
  return screen.findByLabelText('Código de 6 dígitos');
}

describe('Recuperar senha', () => {
  it('pede o código, valida e salva a senha nova', async () => {
    auth.verifyOtp.mockImplementation(async () => {
      supabaseFalso.logar(perfilDeTeste());
      return { data: {}, error: null };
    });
    const { user, local } = renderApp('/recuperar-senha');
    await user.type(await pedirCodigo(user), '654321');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('rafa@example.com');

    await user.type(screen.getByLabelText('Senha nova'), 'NovaSenha#2026');
    await user.type(screen.getByLabelText('Repita a senha nova'), 'NovaSenha#2026');
    await user.click(screen.getByRole('button', { name: 'Salvar senha e entrar' }));

    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'rafa@example.com', token: '654321', type: 'recovery' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'NovaSenha#2026' });
    await waitFor(() => expect(local()).toBe('/'));
  });

  it('não deixa salvar com as senhas diferentes', async () => {
    const { user } = renderApp('/recuperar-senha');
    await user.type(await pedirCodigo(user), '654321');
    await user.type(screen.getByLabelText('Senha nova'), 'NovaSenha#2026');
    await user.type(screen.getByLabelText('Repita a senha nova'), 'NovaSenha#2027');

    expect(screen.getByText('As senhas não são iguais.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar senha e entrar' })).toBeDisabled();
  });

  it('se a senha nova for recusada, não pede o código de novo (ele já foi usado)', async () => {
    auth.verifyOtp.mockImplementation(async () => {
      supabaseFalso.logar(perfilDeTeste());
      return { data: {}, error: null };
    });
    auth.updateUser
      .mockResolvedValueOnce({ data: {}, error: new AuthApiError('New password should be different', 422, 'same_password') })
      .mockResolvedValueOnce({ data: {}, error: null });
    const { user, local } = renderApp('/recuperar-senha');
    await user.type(await pedirCodigo(user), '654321');
    await user.type(screen.getByLabelText('Senha nova'), 'MesmaSenha#1');
    await user.type(screen.getByLabelText('Repita a senha nova'), 'MesmaSenha#1');
    await user.click(screen.getByRole('button', { name: 'Salvar senha e entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A nova senha precisa ser diferente da atual.');
    expect(screen.queryByLabelText('Código de 6 dígitos')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Senha nova'));
    await user.clear(screen.getByLabelText('Repita a senha nova'));
    await user.type(screen.getByLabelText('Senha nova'), 'OutraSenha#2');
    await user.type(screen.getByLabelText('Repita a senha nova'), 'OutraSenha#2');
    await user.click(screen.getByRole('button', { name: 'Salvar senha e entrar' }));

    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(local()).toBe('/'));
  });

  it('código errado: mostra o erro e mantém a senha digitada', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: new AuthApiError('Token has expired or is invalid', 403, 'otp_expired') });
    const { user } = renderApp('/recuperar-senha');
    await user.type(await pedirCodigo(user), '000000');
    await user.type(screen.getByLabelText('Senha nova'), 'NovaSenha#2026');
    await user.type(screen.getByLabelText('Repita a senha nova'), 'NovaSenha#2026');
    await user.click(screen.getByRole('button', { name: 'Salvar senha e entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido ou expirado');
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Senha nova')).toHaveValue('NovaSenha#2026');
  });
});
