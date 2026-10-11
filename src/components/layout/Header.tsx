import { useAuth } from '../../auth/AuthContext';
import { clubePorId, paisPorCodigo } from '../../data/clubes';
import { Avatar } from '../ui/Avatar';
import { Crest } from '../ui/Crest';
import { Icon } from '../ui/Icon';
import { FLAG } from '../../data/common';
import styles from './Header.module.css';

type HeaderProps = {
  notifOpen: boolean;
  accountOpen: boolean;
  onToggleNotif: () => void;
  onToggleAccount: () => void;
};

export function Header({ notifOpen, accountOpen, onToggleNotif, onToggleAccount }: HeaderProps) {
  const { perfil } = useAuth();
  const clube = clubePorId(perfil?.time_id);
  const pais = paisPorCodigo(perfil?.pais);
  return (
    <header className={styles.header}>
      <Crest width={34} height={38} tone="lightHome" />
      <div className={styles.club}>
        <div className={styles.clubName}>{clube?.nome}</div>
        <div className={styles.clubMeta}>
          {pais && <img src={FLAG(pais.bandeira)} alt="" className={styles.flag} />}
          <span>28.640 torcedores · 3º no Brasileirão</span>
        </div>
      </div>
      <label className={styles.search}>
        <Icon name="search" size={19} />
        <input className={styles.searchInput} type="search" placeholder="Buscar jogo, torcedor ou notícia" />
      </label>
      <div className={styles.coins}>
        <Icon name="monetization_on" size={18} />
        440
      </div>
      <div className={styles.level}>
        <Icon name="bolt" size={17} color="var(--green-light)" />
        NÍVEL 24
      </div>
      <button
        type="button"
        aria-label="Notificações"
        aria-expanded={notifOpen}
        className={notifOpen ? `${styles.bell} ${styles.open}` : styles.bell}
        onClick={onToggleNotif}
      >
        <Icon name="notifications" size={21} />
        <span className={styles.unread} />
      </button>
      <button
        type="button"
        aria-expanded={accountOpen}
        className={accountOpen ? `${styles.account} ${styles.open}` : styles.account}
        onClick={onToggleAccount}
      >
        <Avatar size={32} iconSize={19} level={24} />
        <span className={styles.who}>
          <span className={styles.nick}>{perfil?.apelido}</span>
          <span className={styles.rank}>12º · 5.910 XP</span>
        </span>
        <Icon name={accountOpen ? 'expand_less' : 'expand_more'} size={19} color="var(--muted)" />
      </button>
    </header>
  );
}
