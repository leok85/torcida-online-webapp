import type { ReactNode } from 'react';
import { Icon } from '../../components/ui/Icon';
import { SITE } from '../../data/common';
import styles from './AuthLayout.module.css';

type AuthLayoutProps = {
  title: string;
  subtitle?: ReactNode;
  /** Ex.: "Passo 1 de 3 · dados de acesso". */
  step?: string;
  onBack?: () => void;
  /** Troca de modo no pé do cartão, ex.: "Primeira vez aqui? Criar conta". */
  footer?: ReactNode;
  children: ReactNode;
};

/** Tela 5a do "WebApp Login" no Claude Design: tudo dentro de um cartão branco sobre o fundo escuro. */
export function AuthLayout({ title, subtitle, step, onBack, footer, children }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true">
        <span>A torcida</span>
        <span className={styles.backdropGreen}>joga junto</span>
      </div>

      <main className={styles.main}>
        <div className={styles.card}>
          {(onBack || step) && (
            <div className={styles.top}>
              {onBack && (
                <button type="button" className={styles.back} onClick={onBack} aria-label="Voltar">
                  <Icon name="arrow_back" size={20} />
                </button>
              )}
              {step && <div className={styles.step}>{step}</div>}
            </div>
          )}
          <img src="/logo-horizontal.png" alt="Torcida Online" className={styles.logo} />
          <div className={styles.head}>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {children}
          {footer && <div className={styles.footer}>{footer}</div>}
        </div>
      </main>

      <nav className={styles.links}>
        <a href={SITE.termos} target="_blank" rel="noreferrer">
          Termos de uso
        </a>
        <a href={SITE.privacidade} target="_blank" rel="noreferrer">
          Privacidade
        </a>
        <a href={SITE.suporte} target="_blank" rel="noreferrer">
          Suporte
        </a>
      </nav>
    </div>
  );
}
