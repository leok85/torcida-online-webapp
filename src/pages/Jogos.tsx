import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/ui/Icon';
import { Carregando, Skeleton } from '../components/ui/Skeleton';
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
        {partida.mandante_nome} {partida.gols_mandante ?? 0} x {partida.gols_visitante ?? 0} {partida.visitante_nome}
      </strong>
      <span className={styles.infoAoVivo}>{infoDoResultado(partida)}</span>
      <Link to={`/jogo/${partida.id}`} className={styles.entrar}>
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
    // Skeleton do W20 · carregando: a faixa ao vivo (ainda não se sabe se há jogo) e as duas listas.
    const lista = (titulo: string) => (
      <section className={ui.cardFlush}>
        <div className={ui.cardHeader}>
          <h3 className={ui.titleLg}>{titulo}</h3>
        </div>
        <ul className={styles.lista}>
          {[0, 1, 2].map((i) => (
            <li key={i} className={styles.linha}>
              <span className={styles.data}>
                <Skeleton w={24} h={20} r={5} />
                <Skeleton w={22} h={8} r="pilula" style={{ marginTop: 4 }} />
              </span>
              <span className={styles.corpo}>
                <Skeleton w="62%" h={12} r="pilula" />
                <Skeleton w="44%" h={9} r="pilula" />
              </span>
              <Skeleton w={84} h={22} r="pilula" />
            </li>
          ))}
        </ul>
      </section>
    );
    return (
      <Carregando className={ui.page} rotulo="Carregando os jogos…">
        {cabecalho}
        <div className={styles.aoVivo}>
          <Skeleton tom="escuro" w={92} h={26} r="pilula" />
          <Skeleton tom="escuro" w={300} h={22} r={6} />
          <Skeleton tom="escuro" w={150} h={10} r="pilula" style={{ flex: 1, maxWidth: 150 }} />
          <span style={{ flex: 1 }} />
          <Skeleton tom="escuro" w={150} h={46} r={11} />
        </div>
        <div className={styles.colunas}>
          {lista('Próximos')}
          {lista('Resultados')}
        </div>
      </Carregando>
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
                      aria-label={`${p.mandante_nome} x ${p.visitante_nome}, ${dia} ${mes} · ${infoDoProximo(p)} · ${palpite}`}
                    >
                      <Data inicio={p.inicio} />
                      <div className={styles.corpo}>
                        <span className={styles.confronto}>
                          {p.mandante_nome} x {p.visitante_nome}
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
                const placar = `${p.mandante_nome} ${p.gols_mandante ?? 0} x ${p.gols_visitante ?? 0} ${p.visitante_nome}`;
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
