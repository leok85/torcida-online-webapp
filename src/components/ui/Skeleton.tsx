import type { CSSProperties, ReactNode } from 'react';
import styles from './Skeleton.module.css';

type Tom = 'claro' | 'escuro';

type SkeletonProps = {
  /** Largura em px ou em qualquer unidade CSS ('100%', '8rem'). */
  w?: number | string;
  h?: number | string;
  /** Raio em px; 'pilula' para etiquetas e textos curtos. */
  r?: number | 'pilula';
  /** 'escuro' para cards com fundo escuro (blocos em branco translúcido). */
  tom?: Tom;
  className?: string;
  style?: CSSProperties;
};

/** Bloco de carregamento no formato do conteúdo, com um brilho passando (parado quando o sistema pede menos animação). */
export function Skeleton({ w = '100%', h = 12, r = 6, tom = 'claro', className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.bloco} ${tom === 'escuro' ? styles.escuro : ''} ${className ?? ''}`}
      style={{ width: w, height: h, borderRadius: r === 'pilula' ? 999 : r, ...style }}
    />
  );
}

/** Escudo de carregamento, no mesmo formato do Crest. */
export function SkeletonEscudo({ width, height, tom = 'claro' }: { width: number; height: number; tom?: Tom }) {
  const topo = Math.round(width * 0.15);
  const base = Math.round(width * 0.43);
  return (
    <span
      aria-hidden="true"
      className={`${styles.bloco} ${tom === 'escuro' ? styles.escuro : ''}`}
      style={{ width, height, borderRadius: `${topo}px ${topo}px ${base}px ${base}px` }}
    />
  );
}

/**
 * Área carregando: avisa leitores de tela uma vez (aria-busy + texto oculto) e desenha os blocos.
 * Use em volta dos Skeletons de cada tela.
 */
export function Carregando({ rotulo, children, className, as: Tag = 'div', ...resto }: { rotulo: string; children: ReactNode; className?: string; as?: 'div' | 'section' } & Record<`aria-${string}`, string>) {
  return (
    <Tag className={className} aria-busy="true" {...resto}>
      <span className={styles.srOnly}>{rotulo}</span>
      {children}
    </Tag>
  );
}

/** Texto só para leitores de tela (ex.: "Carregando o jogo…" dentro de uma área com aria-busy). */
export function TextoOculto({ children }: { children: ReactNode }) {
  return <span className={styles.srOnly}>{children}</span>;
}
