import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { CodeInput } from './CodeInput';

function Campo() {
  const [valor, setValor] = useState('');
  return <CodeInput length={6} value={valor} onChange={setValor} />;
}

describe('CodeInput', () => {
  it('aceita só dígitos e para no tamanho do código', async () => {
    const user = userEvent.setup();
    render(<Campo />);
    const input = screen.getByLabelText('Código de 6 dígitos');
    await user.type(input, '12a3-4567');
    expect(input).toHaveValue('123456');
  });

  it('aceita o código colado do e-mail com espaços e traços', async () => {
    const user = userEvent.setup();
    render(<Campo />);
    const input = screen.getByLabelText('Código de 6 dígitos');
    await user.click(input);
    await user.paste('123 - 456');
    expect(input).toHaveValue('123456');
  });
});
