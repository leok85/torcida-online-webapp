import type { ReactNode } from 'react';
import styles from './Pitch.module.css';

type PitchProps = { size?: 'md' | 'lg'; background?: string; className?: string; children: ReactNode };

/** Meio-campo de ataque visto de cima, com as linhas desenhadas em CSS. */
export function Pitch({ size = 'md', background = 'var(--pitch)', className, children }: PitchProps) {
  const classes = [styles.pitch, size === 'lg' && styles.lg, className].filter(Boolean).join(' ');
  return (
    <div className={classes} style={{ background }}>
      <div className={styles.bands} />
      <div className={styles.outline} />
      <div className={styles.centerCircle} />
      <div className={styles.centerDot} />
      <div className={styles.bigBox} />
      <div className={styles.smallBox} />
      <div className={styles.spot} />
      <div className={styles.arc} />
      <div className={styles.cornerLeft} />
      <div className={styles.cornerRight} />
      {children}
    </div>
  );
}

export function PitchRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}
