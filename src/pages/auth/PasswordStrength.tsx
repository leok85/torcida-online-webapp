import { forcaDaSenha } from '../../auth/validacao';
import styles from './Auth.module.css';

export function PasswordStrength({ senha }: { senha: string }) {
  const forca = forcaDaSenha(senha);
  return (
    <div className={styles.strength} aria-live="polite">
      <div className={styles.strengthBars}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.strengthBar} style={i <= forca.nivel ? { background: forca.cor } : undefined} />
        ))}
      </div>
      <span className={styles.strengthLabel} style={{ color: forca.cor }}>
        {forca.rotulo}
      </span>
    </div>
  );
}
