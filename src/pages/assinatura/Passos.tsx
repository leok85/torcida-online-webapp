import { Icon } from '../../components/ui/Icon';
import styles from './Assinatura.module.css';

const PASSOS = ['Plano', 'Pagamento'];

export function Passos({ atual }: { atual: 1 | 2 }) {
  return (
    <ol className={styles.passos} aria-label="Etapas da assinatura">
      {PASSOS.map((nome, i) => {
        const n = i + 1;
        const feito = n < atual;
        return (
          <li key={nome} className={n <= atual ? styles.passoAtivo : styles.passo} aria-current={n === atual ? 'step' : undefined}>
            <span className={feito ? `${styles.passoNumero} ${styles.passoFeito}` : styles.passoNumero}>
              {feito ? <Icon name="check" size={14} /> : n}
            </span>
            {nome}
          </li>
        );
      })}
    </ol>
  );
}
