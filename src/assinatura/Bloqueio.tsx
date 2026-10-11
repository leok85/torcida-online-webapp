import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/ui/Icon';
import { NAV_MAIN } from '../routes';
import { anualPorMes, BENEFICIOS, formatarPreco } from './planos';
import styles from './Bloqueio.module.css';

/** Rotas só para assinantes: quem não é vê o bloqueio no lugar da página, sem trocar de endereço. */
export function ApenasAssinante() {
  const { assinante } = useAuth();
  const { pathname } = useLocation();
  if (assinante) return <Outlet />;
  const recurso = NAV_MAIN.find((i) => i.path === pathname);
  return <Bloqueio titulo={recurso?.label ?? 'Este recurso'} icone={recurso?.icon ?? 'lock'} />;
}

export function Bloqueio({ titulo, icone }: { titulo: string; icone: string }) {
  return (
    <div className={styles.page}>
      <section className={styles.card} aria-labelledby="bloqueio-titulo">
        <div className={styles.head}>
          <div className={styles.selo}>
            <Icon name={icone} size={26} />
            <span className={styles.cadeado}>
              <Icon name="lock" size={14} />
            </span>
          </div>
          <div>
            <div className={styles.eyebrow}>SÓ PARA MEMBROS</div>
            <h2 id="bloqueio-titulo" className={styles.titulo}>
              {titulo}
            </h2>
            <p className={styles.texto}>Seja membro para liberar isso e tudo o mais, no app e no web app, com o mesmo login.</p>
          </div>
        </div>
        <ul className={styles.beneficios}>
          {BENEFICIOS.map((b) => (
            <li key={b.titulo}>
              <Icon name={b.icone} size={19} color="var(--green)" />
              <div>
                <div className={styles.beneficio}>{b.titulo}</div>
                <div className={styles.detalhe}>{b.texto}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className={styles.rodape}>
          <span className={styles.preco}>planos a partir de {formatarPreco(anualPorMes('BRL'), 'BRL')}/mês</span>
          <Link to="/assinar" className={styles.cta}>
            Ver planos
            <Icon name="arrow_forward" size={19} />
          </Link>
        </div>
      </section>
    </div>
  );
}

/** Versão compacta para um painel dentro de uma página livre (o chat do jogo ao vivo). */
export function BloqueioPainel({ texto }: { texto: string }) {
  return (
    <div className={styles.painel}>
      <span className={styles.painelIcone}>
        <Icon name="lock" size={22} />
      </span>
      <div className={styles.eyebrow}>SÓ PARA MEMBROS</div>
      <p className={styles.texto}>{texto}</p>
      <Link to="/assinar" className={styles.cta}>
        Ver planos
        <Icon name="arrow_forward" size={19} />
      </Link>
    </div>
  );
}
