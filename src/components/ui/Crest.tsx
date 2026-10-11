import styles from './Crest.module.css';

type CrestProps = {
  width: number;
  height: number;
  tone?: 'dark' | 'darkAway' | 'light' | 'lightHome';
};

export function Crest({ width, height, tone = 'light' }: CrestProps) {
  const stripe = width >= 60 ? 5 : width <= 24 ? 3 : 4;
  const top = Math.round(width * 0.15);
  const bottom = Math.round(width * 0.43);
  return (
    <div
      className={`${styles.crest} ${styles[tone]}`}
      style={{
        width,
        height,
        borderRadius: `${top}px ${top}px ${bottom}px ${bottom}px`,
        background: `repeating-linear-gradient(135deg, var(--a) 0 ${stripe}px, var(--b) ${stripe}px ${stripe * 2}px)`,
      }}
      aria-hidden="true"
    />
  );
}
