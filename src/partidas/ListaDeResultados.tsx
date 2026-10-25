import { Link } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { diaEMes, infoDoResultado, resultadoPara, type Partida } from '../data/partidas';
import styles from '../pages/Jogos.module.css';

export const ROTULO_RESULTADO = { V: 'Vitória', E: 'Empate', D: 'Derrota' };

export const placarDe = (p: Partida) => `${p.mandante_nome} ${p.gols_mandante ?? 0} x ${p.gols_visitante ?? 0} ${p.visitante_nome}`;

export function Data({ inicio }: { inicio: string }) {
  const { dia, mes } = diaEMes(inicio);
  return (
    <div className={styles.data}>
      <span className={styles.dia}>{dia}</span>
      <span className={styles.mes}>{mes}</span>
    </div>
  );
}

/** Jogos encerrados (do mais recente ao mais antigo), com V/E/D do lado do clube e o caminho para as notas. */
export function ListaDeResultados({ partidas, clubeId }: { partidas: Partida[]; clubeId: number }) {
  return (
    <ul className={styles.lista}>
      {partidas.map((p) => {
        const r = resultadoPara(p, clubeId);
        const { dia, mes } = diaEMes(p.inicio);
        return (
          <li key={p.id}>
            <Link to={`/jogo/${p.id}/notas`} className={styles.linha} aria-label={`${ROTULO_RESULTADO[r]}: ${placarDe(p)}, ${dia} ${mes} · ${infoDoResultado(p)}`}>
              <Data inicio={p.inicio} />
              <span className={`${styles.resultado} ${styles[`r${r}`]}`} title={ROTULO_RESULTADO[r]}>
                {r}
              </span>
              <div className={styles.corpo}>
                <span className={styles.confronto}>{placarDe(p)}</span>
                <span className={styles.info}>{infoDoResultado(p)}</span>
              </div>
              <Icon name="chevron_right" size={20} color="var(--muted-2)" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
