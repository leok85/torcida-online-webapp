import { useNavigate } from 'react-router-dom';
import { Crest } from '../components/ui/Crest';
import { Icon } from '../components/ui/Icon';
import { autoresDosGols, infoDaPartida, seloDaPartida, separarJogos } from '../data/partidas';
import { useJogosDoClube } from '../partidas/JogosDoClube';
import ui from '../styles/ui.module.css';
import styles from './Inicio.module.css';

/** W01 · placar do clube: o jogo em andamento ou, sem jogo agora, o último resultado. */
export function CardPartida({ clubeNome }: { clubeNome: string }) {
  const navigate = useNavigate();
  const { jogos, erro, tentarDeNovo } = useJogosDoClube();
  const partida = jogos && separarJogos(jogos).destaque;
  const titulo = `Jogo do ${clubeNome}`;

  if (erro) {
    return (
      <section className={`${styles.live} ${styles.liveVazio}`} aria-label={titulo}>
        <p className={styles.vazioTexto}>Não deu para carregar o jogo agora. Verifique sua conexão.</p>
        <button type="button" className={styles.chatBtn} onClick={tentarDeNovo}>
          <Icon name="refresh" size={20} />
          Tentar de novo
        </button>
      </section>
    );
  }

  if (partida === undefined) {
    return (
      <section className={`${styles.live} ${styles.liveVazio}`} aria-label={titulo} aria-busy="true">
        <p className={styles.vazioTexto}>Carregando o jogo…</p>
      </section>
    );
  }

  if (partida === null) {
    return (
      <section className={`${styles.live} ${styles.liveVazio}`} aria-label={titulo}>
        <Icon name="sports_soccer" size={28} color="rgba(255, 255, 255, 0.55)" />
        <p className={styles.vazioTexto}>Os jogos do {clubeNome} aparecem aqui assim que a bola rolar.</p>
      </section>
    );
  }

  const aoVivo = partida.status === 'ao_vivo';
  const gols = autoresDosGols(partida.gols);

  return (
    <section className={styles.live} aria-label={titulo}>
      <div className={styles.liveMeta}>
        <span className={aoVivo ? styles.livePill : styles.endedPill}>
          {aoVivo && <span className={ui.liveDot} />}
          {seloDaPartida(partida)}
        </span>
        <span className={styles.liveInfo}>{infoDaPartida(partida)}</span>
      </div>
      <div className={styles.scoreboard}>
        <div className={styles.team}>
          <Crest width={60} height={68} tone="dark" clubeId={partida.mandante_id} />
          {partida.mandante_nome}
        </div>
        <div className={styles.center}>
          <div className={styles.score} aria-label={`Placar: ${partida.gols_mandante ?? 0} a ${partida.gols_visitante ?? 0}`}>
            {partida.gols_mandante ?? 0} — {partida.gols_visitante ?? 0}
          </div>
          {gols.length > 0 && (
            <ul className={styles.scorer} aria-label="Gols">
              {gols.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
        </div>
        <div className={`${styles.team} ${styles.away}`}>
          <Crest width={60} height={68} tone="darkAway" clubeId={partida.visitante_id} />
          {partida.visitante_nome}
        </div>
      </div>
      <div className={styles.liveFoot}>
        {aoVivo ? (
          <button type="button" className={styles.chatBtn} onClick={() => navigate('/ao-vivo')}>
            <Icon name="forum" size={20} />
            Entrar no chat
          </button>
        ) : (
          <button type="button" className={styles.chatBtn} onClick={() => navigate('/pos-jogo')}>
            <Icon name="star" size={20} />
            Ver pós-jogo e notas
          </button>
        )}
      </div>
    </section>
  );
}
