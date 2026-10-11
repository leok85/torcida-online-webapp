import type { ButtonHTMLAttributes } from 'react';
import { Icon } from '../ui/Icon';
import styles from './Button.module.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'success' | 'neutral';
  loading?: boolean;
  icon?: string;
  iconRight?: string;
  /** Ocupa toda a largura do container (padrão). */
  fullWidth?: boolean;
};

export function Button({ variant = 'primary', loading, icon, iconRight, fullWidth = true, className, disabled, type = 'button', children, ...rest }: ButtonProps) {
  const cls = [styles[variant], fullWidth && styles.block, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : icon && <Icon name={icon} size={20} />}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={20} />}
    </button>
  );
}
