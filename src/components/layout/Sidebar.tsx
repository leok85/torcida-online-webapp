import { Link, NavLink } from 'react-router-dom';
import { NAV_CLUB, NAV_MAIN, type NavItem } from '../../routes';
import { Icon } from '../ui/Icon';
import ui from '../../styles/ui.module.css';
import styles from './Sidebar.module.css';

function NavEntry({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) => (isActive ? `${styles.item} ${styles.active}` : styles.item)}
    >
      <Icon name={item.icon} size={21} />
      <span className={styles.label}>{item.label}</span>
      {item.live && <span className={ui.liveDot} />}
      {item.badge && <span className={styles.badge}>{item.badge}</span>}
    </NavLink>
  );
}

export function Sidebar({ onInvite }: { onInvite: () => void }) {
  return (
    <aside className={styles.sidebar}>
      <Link to="/" className={styles.brand}>
        <img src="/icon-color.png" alt="" className={styles.brandIcon} />
        <div className={styles.brandName}>
          Torcida
          <br />
          Online
        </div>
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
        <div className={styles.invite}>
          <div className={styles.inviteHead}>
            <Icon name="group_add" size={20} color="var(--green-neon)" />
            Chame a torcida
          </div>
          <p className={styles.inviteText}>+100 XP por amigo que entra, e 10% de todo o XP que ele ganhar.</p>
          <button type="button" className={styles.inviteBtn} onClick={onInvite}>
            Convidar amigos
          </button>
          <div className={styles.inviteStats}>
            <span>3 amigos ativos</span>
            <span>1.840 XP rendidos</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
