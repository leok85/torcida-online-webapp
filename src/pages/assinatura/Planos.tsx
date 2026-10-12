import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { anualPorMes, BENEFICIOS, formatarPreco, lerMoeda, lerPlano, PRECOS, type Plano } from '../../assinatura/planos';
import { Icon } from '../../components/ui/Icon';
import { Passos } from './Passos';
import styles from './Assinatura.module.css';

/** W13 · escolha do plano. O site chega aqui com ?plano=anual|mensal&moeda=BRL|USD|EUR. */
export function Planos() {
  const { assinante } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const moeda = lerMoeda(params.get('moeda'));
  const [plano, setPlano] = useState<Plano>(lerPlano(params.get('plano')));

  if (assinante) return <Navigate to="/conta/assinatura" replace />;

  const precos = PRECOS[moeda];
  const opcoes = [
    {
      id: 'anual' as const,
      nome: 'Anual',
      tag: 'MAIS ESCOLHIDO',
      preco: formatarPreco(anualPorMes(moeda), moeda),
      detalhe: `${formatarPreco(precos.anual, moeda)} por ano · 2 meses grátis`,
    },
    { id: 'mensal' as const, nome: 'Mensal', tag: '', preco: formatarPreco(precos.mensal, moeda), detalhe: 'renova todo mês · sem fidelidade' },
  ];
  const resumo = plano === 'anual' ? `Plano anual · ${formatarPreco(precos.anual, moeda)} por ano` : `Plano mensal · ${formatarPreco(precos.mensal, moeda)} por mês`;

  return (
    <div className={styles.pagePlanos}>
      <div className={styles.cabecalho}>
        <h2>Seja membro</h2>
        <span>Um plano libera tudo no app e no web app, com o mesmo login.</span>
      </div>
      <Passos atual={1} />

      <div className={styles.planos} role="radiogroup" aria-label="Plano">
        {opcoes.map((o) => {
          const marcado = o.id === plano;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={marcado}
              className={marcado ? `${styles.plano} ${styles.marcado}` : styles.plano}
              onClick={() => setPlano(o.id)}
            >
              <span className={styles.nomeLinha}>
                <span className={styles.radio}>{marcado && <Icon name="check" size={15} />}</span>
                <span className={styles.nome}>{o.nome}</span>
                {o.tag && <span className={styles.tag}>{o.tag}</span>}
              </span>
              <span className={styles.preco}>
                {o.preco}
                <span className={styles.porMes}>/mês</span>
              </span>
              <span className={styles.detalhe}>{o.detalhe}</span>
            </button>
          );
        })}
      </div>

      <section className={styles.liberam}>
        <h3 className={styles.liberamTitulo}>Os dois planos liberam</h3>
        <ul className={styles.beneficios}>
          {BENEFICIOS.map((b) => (
            <li key={b.titulo}>
              <Icon name={b.icone} size={21} color="var(--green)" />
              <div>
                <div className={styles.beneficio}>{b.titulo}</div>
                <div className={styles.beneficioTexto}>{b.texto}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.barra}>
        <div className={styles.barraTexto}>
          <strong>{resumo}</strong>
          <span>Renova automaticamente. Cancele quando quiser, aqui no web app.</span>
        </div>
        <button type="button" className={styles.agoraNao} onClick={() => navigate('/')}>
          Agora não
        </button>
        <button type="button" className={styles.continuar} onClick={() => navigate(`/assinar/pagamento?plano=${plano}&moeda=${moeda}`)}>
          Continuar para pagamento
          <Icon name="arrow_forward" size={19} />
        </button>
      </div>
    </div>
  );
}
