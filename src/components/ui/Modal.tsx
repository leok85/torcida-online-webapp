import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import styles from './Modal.module.css';

type ModalProps = {
  titulo: string;
  /** Texto abaixo do título, no cabeçalho escuro. */
  subtitulo?: ReactNode;
  onFechar: () => void;
  /** Rodapé com os botões. */
  rodape?: ReactNode;
  largura?: number;
  children: ReactNode;
};

/** Janela sobre a tela, com o cabeçalho escuro dos modais do web app. Fecha no Esc, no X e clicando fora. */
export function Modal({ titulo, subtitulo, onFechar, rodape, largura = 520, children }: ModalProps) {
  const tituloId = useId();
  const janela = useRef<HTMLDivElement>(null);
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    janela.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar.current();
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('keydown', tecla);
      antes?.focus?.();
    };
  }, []);

  // No body: fora da área principal (que corta o position: fixed) e escurecendo também o menu lateral.
  return createPortal(
    <div className={styles.fundo} onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div ref={janela} className={styles.janela} style={{ width: largura }} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1}>
        <div className={styles.topo}>
          <div className={styles.textos}>
            <h2 id={tituloId} className={styles.titulo}>
              {titulo}
            </h2>
            {subtitulo && <p className={styles.subtitulo}>{subtitulo}</p>}
          </div>
          <button type="button" className={styles.fechar} aria-label="Fechar" onClick={onFechar}>
            <Icon name="close" size={21} />
          </button>
        </div>
        <div className={styles.corpo}>{children}</div>
        {rodape && <div className={styles.rodape}>{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}
