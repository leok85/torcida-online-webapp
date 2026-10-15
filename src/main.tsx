import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { avisarSuspensaoDoRedirect } from './auth/suspensao';
import './styles/global.css';

// Antes do cliente Supabase ler a URL: a volta do Google com a conta suspensa vira recado na tela de entrar.
avisarSuspensaoDoRedirect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
