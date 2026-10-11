import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';

function Localizacao() {
  const { pathname } = useLocation();
  return <div data-testid="local">{pathname}</div>;
}

/**
 * Renderiza o app inteiro (rotas e guards reais) a partir de `rota`, que pode ter query string.
 * Logue antes com `supabaseFalso.logar(...)` para começar com sessão.
 */
export function renderApp(rota: string, state?: unknown) {
  const user = userEvent.setup();
  const [pathname, query] = rota.split('?');
  render(
    <MemoryRouter initialEntries={[{ pathname, search: query ? `?${query}` : '', state }]}>
      <AuthProvider>
        <App />
        <Localizacao />
      </AuthProvider>
    </MemoryRouter>,
  );
  return { user, local: () => screen.getByTestId('local').textContent };
}
