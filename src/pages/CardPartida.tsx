import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Crest } from '../components/ui/Crest';
import { Icon } from '../components/ui/Icon';
import {
  autoresDosGols,
  contagemRegressiva,
  infoDaPartida,
  infoDaVespera,
  infoDoProximo,
  infoDoResultado,
  momentoDoInicio,
  seloDaPartida,
  type Partida,
} from '../data/partidas';
import { useJogosDoClube } from '../partidas/JogosDoClube';
import ui from '../styles/ui.module.css';
import styles from './Inicio.module.css';

/** Relógio da contagem regressiva e do "há quanto tempo": atualiza a cada minuto. */
function useAgora() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return agora;
}

function Time({ id, nome, tom, gols }: { id: number; nome: string; tom: 'dark' | 'darkAway'; gols?: string[] }) {
  return (
    <div className={tom === 'dark' ? styles.team : `${styles.team} ${styles.away}`}>
      <Crest width={60} height={68} tone={tom} clubeId={id} />
      {nome}
      {gols && gols.length > 0 && (
        <ul className={styles.scorer} aria-label={`Gols do ${nome}`}>
          {gols.map((g) => (
            <li key={g}>
              <Icon name="sports_soccer" size={13} color="var(--green-light)" />
              {g}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Placar com os autores dos gols embaixo de cada time. */
function Placar({ jogo }: { jogo: Partida }) {
  return (
    <div className={styles.scoreboard}>
      <Time id={jogo.mandante_id} nome={jogo.mandante_nome} tom="dark" gols={autoresDosGols(jogo.gols.filter((g) => g.mandante))} />
      <div className={styles.score} aria-label={`Placar: ${jogo.gols_mandante ?? 0} a ${jogo.gols_visitante ?? 0}`}>
        {jogo.gols_mandante ?? 0} — {jogo.gols_visitante ?? 0}
      </div>
      <Time id={jogo.visitante_id} nome={jogo.visitante_nome} tom="darkAway" gols={autoresDosGols(jogo.gols.filter((g) => !g.mandante))} />
    </div>
  );
}

/** Faixa de baixo do card: o próximo jogo (ao vivo e encerrado) ou o último (véspera). */
function Faixa({ rotulo, titulo, info, children }: { rotulo: string; titulo: string; info: string; children: React.ReactNode }) {
  return (
    <div className={styles.faixa} aria-label={rotulo === 'PRÓXIMO' ? 'Próximo jogo' : 'Último jogo'} role="group">
      <span className={styles.faixaRotulo}>{rotulo}</span>
      <strong className={styles.faixaTitulo}>{titulo}</strong>
      <span className={styles.faixaInfo}>{info}</span>
      {children}
    </div>
  );
}

const confronto = (p: Partida) => `${p.mandante_nome} × ${p.visitante_nome}`;
const placar = (p: Partida) => `${p.mandante_nome} ${p.gols_mandante ?? 0} — ${p.gols_visitante ?? 0} ${p.visitante_nome}`;

/** W01 · card do clube em três momentos: ao vivo, encerrado (até a véspera do próximo) e véspera do próximo jogo. */
export function CardPartida({ clubeNome }: { clubeNome: string }) {
  const navigate = useNavigate();
  const agora = useAgora();
  const { jogos, erro, tentarDeNovo } = useJogosDoClube();
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

  if (!jogos) {
    return (
      <section className={`${styles.live} ${styles.liveVazio}`} aria-label={titulo} aria-busy="true">
        <p className={styles.vazioTexto}>Carregando o jogo…</p>
      </section>
    );
  }

  const momento = momentoDoInicio(jogos, agora);
  if (!momento) {
    return (
      <section className={`${styles.live} ${styles.liveVazio}`} aria-label={titulo}>
        <Icon name="sports_soccer" size={28} color="rgba(255, 255, 255, 0.55)" />
        <p className={styles.vazioTexto}>Os jogos do {clubeNome} aparecem aqui assim que a bola rolar.</p>
      </section>
    );
  }

  if (momento.tipo === 'vespera') {
    const { jogo, ultimo } = momento;
    return (
      <section className={styles.live} aria-label={titulo}>
        <div className={styles.liveBody}>
          <div className={styles.liveMeta}>
            <span className={styles.nextPill}>PRÓXIMO JOGO</span>
            <span className={styles.liveInfo}>{infoDaVespera(jogo)}</span>
          </div>
          <div className={styles.scoreboard}>
            <Time id={jogo.mandante_id} nome={jogo.mandante_nome} tom="dark" />
            <div className={styles.center}>
              <div className={styles.countdown}>{contagemRegressiva(jogo.inicio, agora)}</div>
              <div className={styles.countdownSub}>para o apito inicial</div>
            </div>
            <Time id={jogo.visitante_id} nome={jogo.visitante_nome} tom="darkAway" />
          </div>
          <div className={styles.liveFoot}>
            <div className={styles.nota}>
              <Icon name="how_to_reg" size={19} color="var(--green-light)" />
              <span className={styles.notaTexto}>Palpite e escalação abertos até 15 min antes</span>
              <span className={styles.notaXp}>+80 XP</span>
            </div>
            <button type="button" className={styles.chatBtn} onClick={() => navigate('/escalacao')}>
              <Icon name="sports_soccer" size={20} />
              Dar palpite
            </button>
          </div>
        </div>
        {ultimo && (
          <Faixa rotulo="ÚLTIMO JOGO" titulo={placar(ultimo)} info={infoDoResultado(ultimo)}>
            <Link to="/pos-jogo" className={styles.faixaLink}>
              Notas e fotos
              <Icon name="arrow_forward" size={17} />
            </Link>
          </Faixa>
        )}
      </section>
    );
  }

  const { jogo, proximo } = momento;
  const aoVivo = momento.tipo === 'ao_vivo';

  return (
    <section className={styles.live} aria-label={titulo}>
      <div className={styles.liveBody}>
        <div className={styles.liveMeta}>
          <span className={aoVivo ? styles.livePill : styles.endedPill}>
            {aoVivo && <span className={ui.liveDot} />}
            {seloDaPartida(jogo, agora)}
          </span>
          <span className={styles.liveInfo}>{infoDaPartida(jogo)}</span>
        </div>
        <Placar jogo={jogo} />
        <div className={styles.liveFoot}>
          {aoVivo ? (
            <button type="button" className={styles.chatBtn} onClick={() => navigate('/ao-vivo')}>
              <Icon name="forum" size={20} />
              Entrar no chat
            </button>
          ) : (
            <>
              <button type="button" className={styles.chatBtn} onClick={() => navigate('/pos-jogo')}>
                <Icon name="star" size={20} />
                Dar notas
              </button>
              <button type="button" className={styles.outlineBtn} onClick={() => navigate('/ao-vivo')}>
                <Icon name="forum" size={20} />
                Chat
              </button>
              <button type="button" className={styles.outlineBtn} onClick={() => navigate('/fotos')}>
                <Icon name="photo_library" size={20} />
                Fotos
              </button>
            </>
          )}
        </div>
      </div>
      {proximo && (
        <Faixa rotulo="PRÓXIMO" titulo={confronto(proximo)} info={infoDoProximo(proximo)}>
          {aoVivo ? (
            <span className={styles.faixaBloqueio}>
              <Icon name="lock_clock" size={17} />
              Palpite abre no apito final
            </span>
          ) : (
            <Link to="/escalacao" className={styles.faixaLink}>
              Dar palpite
              <Icon name="arrow_forward" size={17} />
            </Link>
          )}
        </Faixa>
      )}
    </section>
  );
}
