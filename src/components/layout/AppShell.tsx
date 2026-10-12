import { useCallback, useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { ApenasAssinante } from '../../assinatura/Bloqueio';
import { useAuth } from '../../auth/AuthContext';
import { JogosDoClubeProvider } from '../../partidas/JogosDoClube';
import { AccountMenu } from './AccountMenu';
import { Header } from './Header';
import { InviteModal } from './InviteModal';
import { NotificationsPanel } from './NotificationsPanel';
import { Sidebar } from './Sidebar';
import { AoVivo } from '../../pages/AoVivo';
import { Campeonatos } from '../../pages/Campeonatos';
import { Clube } from '../../pages/Clube';
import { Escalacao } from '../../pages/Escalacao';
import { Fotos } from '../../pages/Fotos';
import { Inicio } from '../../pages/Inicio';
import { Jogos } from '../../pages/Jogos';
import { Loja } from '../../pages/Loja';
import { Missoes } from '../../pages/Missoes';
import { Noticias } from '../../pages/Noticias';
import { Perfil } from '../../pages/Perfil';
import { PosJogo } from '../../pages/PosJogo';
import { Ranking } from '../../pages/Ranking';
import { Cancelamento } from '../../pages/assinatura/Cancelamento';
import { MinhaAssinatura } from '../../pages/assinatura/MinhaAssinatura';
import { Pagamento } from '../../pages/assinatura/Pagamento';
import { Planos } from '../../pages/assinatura/Planos';
import { Retorno } from '../../pages/assinatura/Retorno';
import styles from './AppShell.module.css';

type Panel = 'notif' | 'account' | null;

export function AppShell() {
  const [panel, setPanel] = useState<Panel>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const { pathname } = useLocation();
  const { perfil } = useAuth();

  useEffect(() => setPanel(null), [pathname]);

  const togglePanel = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const openInvite = () => {
    setPanel(null);
    setInviteOpen(true);
  };
  const closeInvite = useCallback(() => setInviteOpen(false), []);

  return (
    <JogosDoClubeProvider clubeId={perfil?.time_id ?? null}>
    <div className={styles.app}>
      <Sidebar onInvite={openInvite} />
      <div className={styles.main}>
        <Header
          notifOpen={panel === 'notif'}
          accountOpen={panel === 'account'}
          onToggleNotif={() => togglePanel('notif')}
          onToggleAccount={() => togglePanel('account')}
        />
        <main className={styles.content}>
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/jogos" element={<Jogos />} />
            <Route path="/ao-vivo" element={<AoVivo />} />
            {/* Os mesmos itens marcados como premium em routes.ts. */}
            <Route element={<ApenasAssinante />}>
              <Route path="/escalacao" element={<Escalacao />} />
              <Route path="/pos-jogo" element={<PosJogo />} />
              <Route path="/missoes" element={<Missoes />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/fotos" element={<Fotos />} />
              <Route path="/loja" element={<Loja />} />
            </Route>
            <Route path="/noticias" element={<Noticias />} />
            <Route path="/campeonatos" element={<Campeonatos />} />
            <Route path="/clube" element={<Clube onInvite={openInvite} />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/assinar" element={<Planos />} />
            <Route path="/assinar/pagamento" element={<Pagamento />} />
            <Route path="/assinar/retorno" element={<Retorno />} />
            <Route path="/conta/assinatura" element={<MinhaAssinatura />} />
            <Route path="/conta/assinatura/cancelar" element={<Cancelamento />} />
            <Route path="*" element={<Inicio />} />
          </Routes>
        </main>
      </div>

      {panel === 'account' && (
        <AccountMenu onClose={() => setPanel(null)} onOpenInvite={openInvite} onOpenNotif={() => setPanel('notif')} />
      )}
      {panel === 'notif' && <NotificationsPanel onClose={() => setPanel(null)} />}
      {inviteOpen && <InviteModal onClose={closeInvite} />}
    </div>
    </JogosDoClubeProvider>
  );
}
