import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

type ModalProps = {
  /** Nome da janela para leitores de tela. */
  rotulo: string;
  onFechar: () => void;
  largura?: number;
  children: ReactNode;
};

/**
 * Janela sobre a tela: fundo escurecido, foco na janela e Esc ou clique fora para fechar.
 * O conteúdo (cabeçalho, botões) é de cada tela. Fica no body para escurecer também o menu lateral.
 */
export function Modal({ rotulo, onFechar, largura = 520, children }: ModalProps) {
  const janela = useRef<HTMLDivElement>(null);
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    if (!janela.current?.contains(document.activeElement)) janela.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar.current();
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('keydown', tecla);
      antes?.focus?.();
    };
  }, []);

  return createPortal(
    <div className={styles.fundo} onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div ref={janela} className={styles.janela} style={{ maxWidth: largura }} role="dialog" aria-modal="true" aria-label={rotulo} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
