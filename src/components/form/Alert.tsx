import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import styles from './Alert.module.css';

const ICONS = { error: 'error', info: 'info', success: 'check_circle', warn: 'warning' };

type AlertProps = {
  tone?: keyof typeof ICONS;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
};

export function Alert({ tone = 'error', title, children, actions }: AlertProps) {
  return (
    <div className={`${styles.alert} ${styles[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={ICONS[tone]} size={21} className={styles.icon} />
      <div className={styles.body}>
        {title && <div className={styles.title}>{title}</div>}
        {children && <div className={styles.text}>{children}</div>}
        {/* Os botões aqui devem usar fullWidth={false}. */}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
