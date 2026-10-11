import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TextField } from './TextField';

describe('TextField', () => {
  it('clicar no ícone ou em qualquer ponto da caixa foca o campo', async () => {
    const user = userEvent.setup();
    const { container } = render(<TextField label="E-mail" icon="mail" />);
    const campo = screen.getByLabelText('E-mail');

    await user.click(container.querySelector('[class*="icon"]')!);
    expect(campo).toHaveFocus();

    campo.blur();
    await user.click(campo.parentElement!);
    expect(campo).toHaveFocus();
  });

  it('o botão de mostrar a senha continua funcionando', async () => {
    const user = userEvent.setup();
    render(<TextField label="Senha" password />);
    const campo = screen.getByLabelText('Senha');

    await user.click(campo);
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(campo).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeInTheDocument();
  });

  it('campo desabilitado não ganha foco ao clicar na caixa', async () => {
    const user = userEvent.setup();
    render(<TextField label="E-mail" disabled />);
    const campo = screen.getByLabelText('E-mail');
    await user.click(campo.parentElement!);
    expect(campo).not.toHaveFocus();
  });
});
