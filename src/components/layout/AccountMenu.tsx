import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { urlDaFoto } from '../../data/conta';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { Progress } from '../ui/Progress';
import styles from './AccountMenu.module.css';
import { useMeuXp } from '../../xp/MeuXp';

type AccountMenuProps = {
  onClose: () => void;
  onOpenInvite: () => void;
  onOpenNotif: () => void;
};

export function AccountMenu({ onClose, onOpenInvite, onOpenNotif }: AccountMenuProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { perfil, assinante, sair } = useAuth();
  const { regras } = useMeuXp();
  const items = [
    { id: 'perfil', label: 'Meu perfil', sub: 'nível, conquistas e histórico', icon: 'person', action: () => { navigate('/perfil'); onClose(); } },
    {
      id: 'assinatura',
      label: 'Minha assinatura',
      sub: assinante ? 'membro · tudo liberado' : 'seja membro e libere tudo',
      icon: 'workspace_premium',
      action: () => { navigate('/conta/assinatura'); onClose(); },
    },
    { id: 'convite', label: 'Convidar amigos', sub: `+${regras.convite_aceito} XP por amigo`, icon: 'group_add', action: onOpenInvite },
    { id: 'conta', label: 'Dados da conta', sub: 'nome, e-mail e senha', icon: 'badge', action: () => { navigate('/conta/dados'); onClose(); } },
    { id: 'notif', label: 'Preferências de notificação', sub: 'o que você recebe', icon: 'notifications_active', action: onOpenNotif },
    {
      id: 'time',
      label: 'Trocar de time',
      sub: 'uma única vez · vira-casaca',
      icon: 'swap_horiz',
      danger: true,
      action: () => { navigate('/conta/time'); onClose(); },
    },
    {
      id: 'feedback',
      label: 'Enviar feedback',
      sub: `+${regras.feedback} XP por envio`,
      icon: 'lightbulb',
      // A tela de origem já marca a área do feedback.
      action: () => { navigate('/conta/feedback', { state: { de: pathname } }); onClose(); },
    },
  ];

  return (
    <div className={styles.menu} role="menu">
      <div className={styles.head}>
        <Avatar size={46} iconSize={25} level={24} foto={urlDaFoto(perfil?.foto)} />
        <div className={styles.info}>
          <div className={styles.nick}>{perfil?.apelido}</div>
          <div className={styles.meta}>{perfil?.clube?.nome} · 12º na temporada</div>
          <Progress value="62%" height={6} />
        </div>
      </div>
      <div className={styles.list}>
        {items.map((i) => (
          <button key={i.id} type="button" role="menuitem" className={i.danger ? `${styles.item} ${styles.danger}` : styles.item} onClick={i.action}>
            <Icon name={i.icon} size={21} className={styles.icon} />
            <div className={styles.text}>
              <div className={styles.label}>{i.label}</div>
              <div className={styles.sub}>{i.sub}</div>
            </div>
          </button>
        ))}
      </div>
      <div className={styles.list}>
        <button type="button" role="menuitem" className={`${styles.item} ${styles.logout}`} onClick={sair}>
          <Icon name="logout" size={21} className={styles.icon} />
          <div className={styles.label}>Sair</div>
        </button>
      </div>
    </div>
  );
}
