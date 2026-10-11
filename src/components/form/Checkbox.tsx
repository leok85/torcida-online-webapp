import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import styles from './Checkbox.module.css';

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  muted?: boolean;
};

export function Checkbox({ checked, onChange, children, muted }: CheckboxProps) {
  return (
    <label className={muted ? `${styles.row} ${styles.muted}` : styles.row}>
      <input type="checkbox" className={styles.input} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.box} aria-hidden="true">
        <Icon name="check" size={16} />
      </span>
      <span className={styles.label}>{children}</span>
    </label>
  );
}
