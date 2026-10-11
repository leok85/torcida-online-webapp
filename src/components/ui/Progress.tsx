import styles from './Progress.module.css';

type ProgressProps = {
  value: string;
  height?: number;
  fill?: string;
  track?: string;
  square?: boolean;
  className?: string;
};

export function Progress({ value, height = 10, fill = 'var(--xp-gradient)', track, square, className }: ProgressProps) {
  return (
    <div className={className ? `${styles.track} ${className}` : styles.track} style={{ height, background: track }}>
      <div className={styles.fill} style={{ width: value, background: fill, borderRadius: square ? 0 : undefined }} />
    </div>
  );
}
