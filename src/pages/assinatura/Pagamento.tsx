import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { formatarPreco, lerMoeda, lerPlano, PRECOS } from '../../assinatura/planos';
import { Icon } from '../../components/ui/Icon';
import ui from '../../styles/ui.module.css';
import { Passos } from './Passos';
import styles from './Assinatura.module.css';

/**
 * W14 · pagamento. Enquanto a conta do Stripe não existe, mostra o plano escolhido e avisa que o pagamento
 * online ainda não abriu. Cartão (W14), Pix (W15), aprovado (W16) e recusado (W17) entram com o Stripe.
 */
export function Pagamento() {
  const { assinante } = useAuth();
  const [params] = useSearchParams();
  const plano = lerPlano(params.get('plano'));
  const moeda = lerMoeda(params.get('moeda'));

  if (assinante) return <Navigate to="/conta/assinatura" replace />;

  const valor = formatarPreco(PRECOS[moeda][plano], moeda);
  return (
    <div className={styles.page}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Pagamento</h2>
      </div>
      <Passos atual={2} />
      <section className={styles.aviso}>
        <Icon name="schedule" size={28} color="var(--primary)" />
        <div>
          <h3 className={ui.title}>O pagamento online abre em breve</h3>
          <p>
            Você escolheu o plano {plano} por {valor}
            {plano === 'anual' ? ' por ano' : ' por mês'}. Assim que abrir, você assina por aqui com cartão ou Pix, e a
            liberação vale para o mesmo login no app.
          </p>
          <Link to={`/assinar?plano=${plano}&moeda=${moeda}`} className={styles.link}>
            Voltar aos planos
          </Link>
        </div>
      </section>
    </div>
  );
}
