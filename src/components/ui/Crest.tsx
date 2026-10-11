import { useState } from 'react';
import styles from './Crest.module.css';

/** Escudo do clube no bucket público `escudos` do Supabase (cópia dos escudos da BSD, pelo id do time). */
export const escudoUrl = (clubeId: number) => `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/escudos/clubes/${clubeId}.png`;

type CrestProps = {
  width: number;
  height: number;
  tone?: 'dark' | 'darkAway' | 'light' | 'lightHome';
  /** Com o id do clube, mostra o escudo real; se a imagem não carregar, volta para o escudo listrado. */
  clubeId?: number | null;
};

export function Crest({ width, height, tone = 'light', clubeId }: CrestProps) {
  const [falhou, setFalhou] = useState<number | null>(null);
  if (clubeId && falhou !== clubeId) {
    return (
      <img
        src={escudoUrl(clubeId)}
        alt=""
        width={width}
        height={height}
        className={styles.escudo}
        loading="lazy"
        onError={() => setFalhou(clubeId)}
      />
    );
  }
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
