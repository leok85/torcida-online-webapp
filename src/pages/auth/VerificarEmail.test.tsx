import { AuthApiError } from '@supabase/supabase-js';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp';
import { perfilNovo, supabaseFalso } from '../../test/supabaseFalso';

const { auth } = supabaseFalso.cliente;

describe('Verificar e-mail', () => {
  it('confirma sozinho ao digitar o 6º dígito e leva às boas-vindas', async () => {
    auth.verifyOtp.mockImplementation(async () => {
      supabaseFalso.logar(perfilNovo({ apelido: 'Novo_Torcedor' }), 'novo@example.com');
      return { data: {}, error: null };
    });
    sessionStorage.setItem('to:email-pendente', 'novo@example.com');
    const { user, local } = renderApp('/verificar-email', { email: 'novo@example.com' });

    await user.type(await screen.findByLabelText('Código de 6 dígitos'), '123456');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'novo@example.com', token: '123456', type: 'email' });
    expect(await screen.findByRole('heading', { name: /Bem-vindo/ })).toHaveTextContent('Novo_Torcedor');
    expect(local()).toBe('/boas-vindas');
    expect(sessionStorage.getItem('to:email-pendente')).toBeNull();
  });

  it('código errado: mostra o erro e limpa as caixas para tentar de novo', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: new AuthApiError('Token has expired or is invalid', 403, 'otp_expired') });
    const { user } = renderApp('/verificar-email', { email: 'novo@example.com' });
    const input = await screen.findByLabelText('Código de 6 dígitos');
    await user.type(input, '111111');

    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido ou expirado');
    expect(input).toHaveValue('');
  });

  it('recarregar a página mantém o e-mail guardado na sessão', async () => {
    sessionStorage.setItem('to:email-pendente', 'guardado@example.com');
    renderApp('/verificar-email');
    expect(await screen.findByText(/Enviamos um código/)).toHaveTextContent('guardado@example.com');
  });

  it('sem e-mail conhecido, pede o e-mail e envia o código', async () => {
    const { user } = renderApp('/verificar-email');
    await user.type(await screen.findByLabelText('E-mail'), 'perdido@example.com');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));

    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'perdido@example.com' });
    expect(await screen.findByLabelText('Código de 6 dígitos')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Código enviado');
  });

  it('só deixa reenviar depois da contagem', async () => {
    renderApp('/verificar-email', { email: 'novo@example.com' });
    expect(await screen.findByRole('button', { name: 'Reenviar' })).toBeDisabled();
    expect(screen.getByText(/novo envio em 1:00|novo envio em 0:59/)).toBeInTheDocument();
  });

  it('o código só serve para este e-mail: verifyOtp recebe o e-mail em minúsculas', async () => {
    const { user } = renderApp('/verificar-email', { email: 'Novo@Example.com' });
    await user.type(await screen.findByLabelText('Código de 6 dígitos'), '654321');
    await waitFor(() => expect(auth.verifyOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'novo@example.com' })));
  });
});
