import type { ReactNode } from 'react';
import { Icon } from '../../components/ui/Icon';
import { SITE } from '../../data/common';
import styles from './AuthLayout.module.css';

const RECURSOS = [
  { icon: 'how_to_reg', text: 'Palpite no placar e monte a escalação antes do jogo' },
  { icon: 'forum', text: 'Uma sala por partida, com o lance a lance em tempo real' },
  { icon: 'leaderboard', text: 'Missões, XP e ranking da torcida do seu clube' },
];

type AuthLayoutProps = {
  title: string;
  subtitle?: ReactNode;
  /** Ex.: "Passo 1 de 3 · dados de acesso". */
  step?: string;
  onBack?: () => void;
  footer?: ReactNode;
  children: ReactNode;
};

export function AuthLayout({ title, subtitle, step, onBack, footer, children }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <aside className={styles.hero}>
        <div className={styles.brand}>
          <img src="/icon-color.png" alt="" className={styles.brandIcon} />
          <div className={styles.brandName}>
            Torcida
            <br />
            Online
          </div>
        </div>
        <div className={styles.heroBody}>
          <div className={styles.kicker}>A arquibancada no seu bolso</div>
          <h2 className={styles.heroTitle}>
            Seu time.
            <br />
            Sua torcida.
            <br />
            <em>Seu nível.</em>
          </h2>
          <ul className={styles.features}>
            {RECURSOS.map((r) => (
              <li key={r.icon} className={styles.feature}>
                <span className={styles.featureIcon}>
                  <Icon name={r.icon} size={20} />
                </span>
                {r.text}
              </li>
            ))}
          </ul>
        </div>
        <nav className={styles.heroFoot}>
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
      </aside>

      <div className={styles.side}>
        <main className={styles.main}>
          <div className={styles.panel}>
            <div className={styles.compactBrand}>
              <img src="/icon-color.png" alt="" />
              Torcida Online
            </div>
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
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            {children}
          </div>
        </main>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>
  );
}
