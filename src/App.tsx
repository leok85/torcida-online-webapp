import { Route, Routes } from 'react-router-dom';
import { ApenasLogado, ApenasVisitante } from './auth/Rotas';
import { AppShellDoTime } from './components/layout/AppShell';
import { BoasVindas } from './pages/auth/BoasVindas';
import { CriarConta } from './pages/auth/CriarConta';
import { Entrar } from './pages/auth/Entrar';
import { LinkDeConvite } from './pages/auth/LinkDeConvite';
import { Onboarding } from './pages/auth/Onboarding';
import { RecuperarSenha } from './pages/auth/RecuperarSenha';
import { VerificarEmail } from './pages/auth/VerificarEmail';

export default function App() {
  return (
    <Routes>
      <Route element={<ApenasVisitante />}>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/criar-conta" element={<CriarConta />} />
      </Route>
      <Route path="/r/:codigo" element={<LinkDeConvite />} />
      {/* Sem guard: as duas criam a sessão no meio do fluxo e cuidam do redirecionamento. */}
      <Route path="/verificar-email" element={<VerificarEmail />} />
      <Route path="/recuperar-senha" element={<RecuperarSenha />} />
      <Route element={<ApenasLogado />}>
        <Route path="/boas-vindas" element={<BoasVindas />} />
        <Route path="/onboarding" element={<Onboarding />} />
      </Route>
      <Route element={<ApenasLogado torcedor />}>
        <Route path="/*" element={<AppShellDoTime />} />
      </Route>
    </Routes>
  );
}
