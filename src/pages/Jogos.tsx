import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/ui/Icon';
import {
  aberturaDoPalpite,
  diaEMes,
  infoDoProximo,
  infoDoResultado,
  resultadoPara,
  separarJogos,
  type Partida,
} from '../data/partidas';
import { useJogosDoClube } from '../partidas/JogosDoClube';
import ui from '../styles/ui.module.css';
import styles from './Jogos.module.css';

/** Quantos jogos cada lista mostra. */
export const LIMITE_DA_LISTA = 5;

const ROTULO_RESULTADO = { V: 'Vitória', E: 'Empate', D: 'Derrota' };

function Data({ inicio }: { inicio: string }) {
  const { dia, mes } = diaEMes(inicio);
  return (
    <div className={styles.data}>
      <span className={styles.dia}>{dia}</span>
      <span className={styles.mes}>{mes}</span>
    </div>
  );
}

function FaixaAoVivo({ partida }: { partida: Partida }) {
  const minuto = partida.periodo === 'INT' ? 'INTERVALO' : partida.minuto != null ? `${partida.minuto}'` : null;
  return (
    <section className={styles.aoVivo} aria-label="Jogo ao vivo">
      <span className={styles.livePill}>
        <span className={ui.liveDot} />
        {minuto ? `AO VIVO · ${minuto}` : 'AO VIVO'}
      </span>
      <strong className={styles.placarAoVivo}>
        {partida.mandante_nome} {partida.gols_mandante ?? 0} — {partida.gols_visitante ?? 0} {partida.visitante_nome}
      </strong>
      <span className={styles.infoAoVivo}>{infoDoResultado(partida)}</span>
      <Link to="/ao-vivo" className={styles.entrar}>
        Entrar no jogo
        <Icon name="arrow_forward" size={18} />
      </Link>
    </section>
  );
}

/** W20 · jogos do clube: o ao vivo em destaque, os próximos (com a abertura do palpite) e os resultados. */
export function Jogos() {
  const { perfil } = useAuth();
  const { jogos, erro, tentarDeNovo } = useJogosDoClube();
  const clubeId = perfil?.time_id ?? 0;
  const clubeNome = perfil?.clube?.nome ?? 'seu clube';

  const cabecalho = (
    <div className={ui.pageHead}>
      <h2 className={ui.pageTitle}>Jogos do {clubeNome}</h2>
      <span className={ui.pageSub}>Temporada {new Date().getFullYear()}</span>
    </div>
  );

  if (erro) {
    return (
      <div className={ui.page}>
        {cabecalho}
        <div className={`${ui.card} ${styles.aviso}`}>
          <p>Não deu para carregar os jogos agora. Verifique sua conexão.</p>
          <button type="button" className={styles.tentar} onClick={tentarDeNovo}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  if (!jogos) {
    return (
      <div className={ui.page} aria-busy="true">
        {cabecalho}
        <p className={styles.carregando}>Carregando os jogos…</p>
      </div>
    );
  }

  const { aoVivo, proximos, resultados } = separarJogos(jogos);

  return (
    <div className={ui.page}>
      {cabecalho}
      {aoVivo && <FaixaAoVivo partida={aoVivo} />}
      <div className={styles.colunas}>
        <section className={ui.cardFlush} aria-labelledby="titulo-proximos">
          <div className={ui.cardHeader}>
            <h3 id="titulo-proximos" className={ui.titleLg}>
              Próximos
            </h3>
          </div>
          {proximos.length === 0 ? (
            <p className={styles.vazio}>Nenhum jogo marcado por enquanto.</p>
          ) : (
            <ul className={styles.lista}>
              {proximos.slice(0, LIMITE_DA_LISTA).map((p, i) => {
                const palpite = aberturaDoPalpite(proximos, i, !!aoVivo);
                const { dia, mes } = diaEMes(p.inicio);
                return (
                  <li key={p.id}>
                    <Link
                      to="/escalacao"
                      className={styles.linha}
                      aria-label={`${p.mandante_nome} × ${p.visitante_nome}, ${dia} ${mes} · ${infoDoProximo(p)} · ${palpite}`}
                    >
                      <Data inicio={p.inicio} />
                      <div className={styles.corpo}>
                        <span className={styles.confronto}>
                          {p.mandante_nome} × {p.visitante_nome}
                        </span>
                        <span className={styles.info}>{infoDoProximo(p)}</span>
                      </div>
                      <span className={palpite === 'palpite aberto' ? `${styles.palpite} ${styles.palpiteAberto}` : styles.palpite}>
                        {palpite}
                      </span>
                      <Icon name="chevron_right" size={20} color="var(--muted)" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={ui.cardFlush} aria-labelledby="titulo-resultados">
          <div className={ui.cardHeader}>
            <h3 id="titulo-resultados" className={ui.titleLg}>
              Resultados
            </h3>
          </div>
          {resultados.length === 0 ? (
            <p className={styles.vazio}>Nenhum resultado ainda.</p>
          ) : (
            <ul className={styles.lista}>
              {resultados.slice(0, LIMITE_DA_LISTA).map((p) => {
                const r = resultadoPara(p, clubeId);
                const { dia, mes } = diaEMes(p.inicio);
                const placar = `${p.mandante_nome} ${p.gols_mandante ?? 0} — ${p.gols_visitante ?? 0} ${p.visitante_nome}`;
                return (
                  <li key={p.id}>
                    <Link to="/pos-jogo" className={styles.linha} aria-label={`${ROTULO_RESULTADO[r]}: ${placar}, ${dia} ${mes} · ${infoDoResultado(p)}`}>
                      <Data inicio={p.inicio} />
                      <span className={`${styles.resultado} ${styles[`r${r}`]}`} title={ROTULO_RESULTADO[r]}>
                        {r}
                      </span>
                      <div className={styles.corpo}>
                        <span className={styles.confronto}>
                          {placar}
                        </span>
                        <span className={styles.info}>{infoDoResultado(p)}</span>
                      </div>
                      <Icon name="chevron_right" size={20} color="var(--muted)" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
