import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useJogosDoClube } from '../../partidas/JogosDoClube';
import { NAV_CLUB, NAV_MAIN, type NavItem } from '../../routes';
import { Icon } from '../ui/Icon';
import ui from '../../styles/ui.module.css';
import styles from './Sidebar.module.css';

function NavEntry({ item }: { item: NavItem }) {
  const { assinante } = useAuth();
  const { jogos } = useJogosDoClube();
  const { pathname } = useLocation();
  const bloqueado = item.premium && !assinante;
  const emCampo = item.aoVivo && !!jogos?.some((p) => p.status === 'ao_vivo');
  const dentro = (rota: string) => pathname === rota || pathname.startsWith(`${rota}/`);
  // Início só fica marcado na própria página; Jogos também nas telas de um jogo.
  const ativo = item.path === '/' ? pathname === '/' : dentro(item.path) || !!item.ativoEm?.some(dentro);
  return (
    <Link
      to={item.path}
      aria-current={ativo ? 'page' : undefined}
      aria-label={[item.label, bloqueado && 'só para membros', emCampo && 'jogo ao vivo'].filter(Boolean).join(', ')}
      className={ativo ? `${styles.item} ${styles.active}` : styles.item}>
      <Icon name={item.icon} size={21} />
      <span className={styles.label}>{item.label}</span>
      {emCampo && (
        <span className={ui.liveDot} title="Jogo ao vivo">
          <span className={styles.srOnly}>jogo ao vivo</span>
        </span>
      )}
      {bloqueado ? (
        <span className={styles.lock} title="Só para membros">
          <Icon name="lock" size={15} />
          <span className={styles.srOnly}>só para membros</span>
        </span>
      ) : (
        item.badge && <span className={styles.badge}>{item.badge}</span>
      )}
    </Link>
  );
}

export function Sidebar({ onInvite }: { onInvite: () => void }) {
  return (
    <aside className={styles.sidebar}>
      <Link to="/" className={styles.brand}>
        <img src="/logo-horizontal-light.png" alt="Torcida Online" width={170} height={47} className={styles.logo} />
      </Link>
      <nav className={styles.nav}>
        {NAV_MAIN.map((item) => (
          <NavEntry key={item.path} item={item} />
        ))}
        <div className={styles.sep} />
        <div className={styles.section}>CLUBE</div>
        {NAV_CLUB.map((item) => (
          <NavEntry key={item.path} item={item} />
        ))}
      </nav>
      <div className={styles.footer}>
        <button type="button" className={styles.invite} onClick={onInvite}>
          <Icon name="group_add" size={20} color="var(--green-neon)" />
          <span className={styles.inviteText}>
            <strong>Convidar amigos</strong>
            <span>+100 XP por amigo</span>
          </span>
          <Icon name="chevron_right" size={18} color="rgba(255, 255, 255, 0.6)" />
        </button>
      </div>
    </aside>
  );
}
