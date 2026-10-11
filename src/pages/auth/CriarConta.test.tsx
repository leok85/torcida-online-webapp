import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp';
import { perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';

const { auth } = supabaseFalso.cliente;

async function preencherValido(user: ReturnType<typeof renderApp>['user'], email = 'novo@example.com') {
  await user.type(await screen.findByLabelText('Nome'), 'Novo Torcedor');
  await user.type(screen.getByLabelText('Apelido na torcida'), 'Novo_Torcedor');
  await user.type(screen.getByRole('textbox', { name: 'E-mail' }), email);
  await user.type(screen.getByLabelText('Senha'), 'Torcida#2026');
  await user.click(screen.getByRole('checkbox', { name: 'Tenho 18 anos ou mais.' }));
  await user.click(screen.getByRole('checkbox', { name: /Li e aceito os/ }));
  await screen.findByText('Apelido disponível.');
}

describe('Criar conta', () => {
  it('só libera o botão com tudo preenchido e os dois aceites obrigatórios', async () => {
    const { user } = renderApp('/criar-conta');
    const continuar = await screen.findByRole('button', { name: 'Criar conta' });
    expect(continuar).toBeDisabled();

    await user.type(screen.getByLabelText('Nome'), 'Novo Torcedor');
    await user.type(screen.getByLabelText('Apelido na torcida'), 'Novo_Torcedor');
    await user.type(screen.getByRole('textbox', { name: 'E-mail' }), 'novo@example.com');
    await user.type(screen.getByLabelText('Senha'), 'Torcida#2026');
    await user.click(screen.getByRole('checkbox', { name: 'Tenho 18 anos ou mais.' }));
    await screen.findByText('Apelido disponível.');
    expect(continuar).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /Li e aceito os/ }));
    expect(continuar).toBeEnabled();
  });

  it('bloqueia senha curta e apelido já usado', async () => {
    supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'outro', apelido: 'Rafa_9' }));
    const { user } = renderApp('/criar-conta');
    await preencherValido(user);

    await user.clear(screen.getByLabelText('Apelido na torcida'));
    await user.type(screen.getByLabelText('Apelido na torcida'), 'rafa_9');
    expect(await screen.findByText('Esse apelido já está em uso.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeDisabled();

    await user.clear(screen.getByLabelText('Apelido na torcida'));
    await user.type(screen.getByLabelText('Apelido na torcida'), 'Outro_Apelido');
    await screen.findByText('Apelido disponível.');
    await user.clear(screen.getByLabelText('Senha'));
    await user.type(screen.getByLabelText('Senha'), 'curta');
    expect(screen.getByText('curta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeDisabled();
  });

  it('envia os dados do perfil no cadastro e segue para a verificação do e-mail', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: 'novo', identities: [{ id: 'x' }] }, session: null }, error: null });
    const { user, local } = renderApp('/criar-conta');
    await preencherValido(user, 'Novo@Example.com');
    await user.click(screen.getByRole('checkbox', { name: /novidades/ }));
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'novo@example.com',
      password: 'Torcida#2026',
      options: { data: { nome: 'Novo Torcedor', apelido: 'Novo_Torcedor', aceitou_termos: true, quer_novidades: true } },
    });
    await waitFor(() => expect(local()).toBe('/verificar-email'));
    expect(sessionStorage.getItem('to:email-pendente')).toBe('novo@example.com');
  });

  it('e-mail que já tem conta: mostra o alerta e some quando o e-mail muda', async () => {
    // Com confirmação ligada, o Supabase responde um usuário sem identidades em vez de erro.
    auth.signUp.mockResolvedValue({ data: { user: { id: 'falso', identities: [] }, session: null }, error: null });
    const { user, local } = renderApp('/criar-conta');
    await preencherValido(user, 'ja@example.com');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Esse e-mail já tem conta na Torcida Online')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Corrija o e-mail para continuar' })).toBeDisabled();
    expect(local()).toBe('/criar-conta');

    await user.type(screen.getByRole('textbox', { name: 'E-mail' }), 'x');
    expect(screen.queryByText('Esse e-mail já tem conta na Torcida Online')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeEnabled();
  });
});
