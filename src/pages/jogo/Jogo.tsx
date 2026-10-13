import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Crest } from '../../components/ui/Crest';
import { Icon } from '../../components/ui/Icon';
import { Pitch, PitchRow } from '../../components/ui/Pitch';
import { Segmented } from '../../components/ui/Segmented';
import { Skeleton, TextoOculto } from '../../components/ui/Skeleton';
import {
  buscarDetalhes,
  iconeDoLance,
  linhasDoCampo,
  dataDoJogo,
  linhaDoTempo,
  linhasDosNumeros,
  momentoDoJogo,
  relogioDoJogo,
  partidaPorId,
  seloDoJogo,
  textoDoLance,
  type Detalhes,
} from '../../data/jogo';
import { autoresDosGols, infoDoResultado, resultadoPara, type Partida } from '../../data/partidas';
import ui from '../../styles/ui.module.css';
import { ChatDaTorcida } from './ChatDaTorcida';
import styles from './Jogo.module.css';

/** Ao vivo, o placar é relido a cada 30 s e os detalhes a cada 60 s (a função guarda por 90 s). */
export const ATUALIZAR_PARTIDA_MS = 30_000;
export const ATUALIZAR_DETALHES_MS = 60_000;

/** O jogo e os detalhes da BSD, relidos enquanto a bola rola. */
function useJogo(id: number) {
  const [partida, setPartida] = useState<Partida | null | undefined>(undefined);
  const [erro, setErro] = useState(false);
  const [detalhes, setDetalhes] = useState<Detalhes | null | undefined>(undefined);
  const [tentativa, setTentativa] = useState(0);
  const aoVivo = partida?.status === 'ao_vivo';

  useEffect(() => {
    let vivo = true;
    let timer: number | undefined;
    const carregar = () =>
      partidaPorId(id).then(
        (p) => {
          if (!vivo) return;
          setPartida(p);
          setErro(false);
          if (p?.status === 'ao_vivo') timer = window.setTimeout(carregar, ATUALIZAR_PARTIDA_MS);
        },
        () => {
          if (!vivo) return;
          // Falha numa atualização segue com o placar de antes; sem nada na tela, mostra o erro.
          setErro(true);
          timer = window.setTimeout(carregar, ATUALIZAR_PARTIDA_MS);
        },
      );
    void carregar();
    return () => {
      vivo = false;
      window.clearTimeout(timer);
    };
  }, [id, tentativa]);

  const temPartida = !!partida;
  useEffect(() => {
    if (!temPartida) return;
    let vivo = true;
    const carregar = () => buscarDetalhes(id).then((d) => vivo && setDetalhes((antes) => d ?? antes ?? null));
    void carregar();
    if (!aoVivo) return () => void (vivo = false);
    const timer = window.setInterval(carregar, ATUALIZAR_DETALHES_MS);
    return () => {
      vivo = false;
      window.clearInterval(timer);
    };
  }, [id, temPartida, aoVivo]);

  return { partida, erro: erro && !partida, detalhes, tentarDeNovo: () => setTentativa((t) => t + 1) };
}

// ---------- faixa do jogo ----------

const ABAS = [
  { id: 'pre', rotulo: 'Escalação e palpite', icone: 'how_to_reg', para: '/escalacao' },
  { id: 'aovivo', rotulo: 'Ao vivo e chat', icone: 'forum', para: null },
  { id: 'pos', rotulo: 'Pós-jogo e notas', icone: 'star_rate', para: '/pos-jogo' },
  { id: 'fotos', rotulo: 'Fotos', icone: 'photo_library', para: '/fotos' },
] as const;

/** Faixa "← Jogos" com o selo, o confronto e as abas do jogo; pós-jogo só abre depois do apito final. */
function FaixaDoJogo({ partida }: { partida: Partida | null }) {
  const selo = partida ? seloDoJogo(partida) : null;
  return (
    <div className={styles.faixa}>
      <Link to="/jogos" className={styles.voltar} aria-label="Voltar para Jogos">
        <Icon name="arrow_back" size={19} />
        Jogos
      </Link>
      <span className={styles.divisor} />
      {partida && selo && (
        <>
          <span className={selo.tom === 'aoVivo' ? `${styles.selo} ${styles.seloAoVivo}` : styles.selo}>{selo.selo}</span>
          <div className={styles.faixaTitulo}>
            <strong>
              {partida.mandante_nome} {partida.gols_mandante ?? 0} x {partida.gols_visitante ?? 0} {partida.visitante_nome}
            </strong>
            {selo.sub && <span>{selo.sub}</span>}
          </div>
        </>
      )}
      <div className={styles.abas}>
        {ABAS.map((a) => {
          const livre = a.id !== 'pos' || partida?.status === 'encerrada';
          const conteudo = (
            <>
              <Icon name={livre ? a.icone : 'lock'} size={18} />
              {a.rotulo}
            </>
          );
          if (!a.para) {
            return (
              <span key={a.id} className={`${styles.aba} ${styles.abaAtual}`} aria-current="page">
                {conteudo}
              </span>
            );
          }
          return livre ? (
            <Link key={a.id} to={a.para} className={styles.aba}>
              {conteudo}
            </Link>
          ) : (
            <span key={a.id} className={`${styles.aba} ${styles.abaBloqueada}`} aria-disabled="true" title="Abre no apito final">
              {conteudo}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------- blocos da página ----------

const RESULTADO = { V: 'VITÓRIA', E: 'EMPATE', D: 'DERROTA' } as const;

/** Placar no centro com o selo (ao vivo com o relógio, ou encerrado com o resultado), os gols e a linha do tempo. */
function Placar({ partida, clubeId }: { partida: Partida; clubeId: number | null }) {
  const aoVivo = partida.status === 'ao_vivo';
  const encerrada = partida.status === 'encerrada';
  const penaltis = partida.penaltis_mandante !== null && partida.penaltis_visitante !== null;
  const golsCasa = autoresDosGols(partida.gols.filter((g) => g.mandante));
  const golsFora = autoresDosGols(partida.gols.filter((g) => !g.mandante));
  const relogio = relogioDoJogo(partida);
  const tempo = linhaDoTempo(partida);
  const meuJogo = clubeId !== null && (partida.mandante_id === clubeId || partida.visitante_id === clubeId);
  const resultado = encerrada && meuJogo ? resultadoPara(partida, clubeId!) : null;
  const metade = (feito: number, atual: boolean) => ({
    background: atual ? `linear-gradient(90deg, var(--red) 0 ${feito}%, transparent ${feito}%)` : feito ? 'rgba(255, 255, 255, 0.55)' : 'transparent',
  });
  return (
    <div className={styles.bar}>
      <div className={styles.barInfo}>
        {encerrada && (
          <>
            {infoDoResultado(partida)}
            <br />
            {dataDoJogo(partida)}
          </>
        )}
      </div>
      <div className={styles.barCentro}>
        <div className={styles.confronto}>
          <div className={styles.timeCasa}>
            <span className={styles.nomeTime}>{partida.mandante_nome}</span>
            <Crest width={44} height={50} tone="dark" clubeId={partida.mandante_id} />
          </div>
          <div className={styles.score} aria-label={`Placar: ${partida.gols_mandante ?? 0} a ${partida.gols_visitante ?? 0}`}>
            <span>{partida.gols_mandante ?? 0}</span>
            <span className={styles.scoreX}>x</span>
            <span>{partida.gols_visitante ?? 0}</span>
          </div>
          <div className={styles.timeFora}>
            <Crest width={44} height={50} tone="darkAway" clubeId={partida.visitante_id} />
            <span className={styles.nomeTime}>{partida.visitante_nome}</span>
          </div>
        </div>

        {aoVivo ? (
          <div className={styles.seloVivo}>
            <span className={styles.seloPonto} />
            <span className={styles.seloTexto}>AO VIVO</span>
            <span className={styles.relogio}>
              {relogio.minuto}
              {relogio.periodo && <span>{relogio.periodo}</span>}
            </span>
          </div>
        ) : (
          <div className={styles.seloFim}>
            <Icon name="sports" size={16} color="rgba(255, 255, 255, 0.8)" />
            <span className={styles.seloTexto}>{encerrada ? 'ENCERRADO' : momentoDoJogo(partida).toUpperCase()}</span>
            {resultado && <span className={`${styles.resultado} ${styles[`resultado${resultado}`]}`}>{RESULTADO[resultado]}</span>}
          </div>
        )}
        {penaltis && (
          <div className={styles.penaltis}>
            Pênaltis {partida.penaltis_mandante} x {partida.penaltis_visitante}
          </div>
        )}

        {aoVivo
          ? partida.gols.length > 0 && (
              <div className={styles.golsAoVivo} aria-label="Gols">
                <Icon name="sports_soccer" size={15} />
                {[...golsCasa, ...golsFora].join(' · ')}
              </div>
            )
          : partida.gols.length > 0 && (
              <div className={styles.golsFim}>
                <ul aria-label={`Gols do ${partida.mandante_nome}`}>
                  {golsCasa.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
                <Icon name="sports_soccer" size={15} />
                <ul aria-label={`Gols do ${partida.visitante_nome}`}>
                  {golsFora.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
      </div>
      <div />

      <div className={styles.tempo} aria-hidden="true">
        <span>0'</span>
        <div className={styles.tempoTrilho}>
          <div style={metade(tempo.primeiro, tempo.emAndamento === 1)} />
          <div style={metade(tempo.segundo, tempo.emAndamento === 2)} />
        </div>
        <span>90'</span>
      </div>
    </div>
  );
}

function Escalacao({ partida, detalhes, clubeId }: { partida: Partida; detalhes: Detalhes | null | undefined; clubeId: number | null }) {
  const [lado, setLado] = useState<'mandante' | 'visitante'>(partida.visitante_id === clubeId ? 'visitante' : 'mandante');
  const escalacao = detalhes?.escalacoes?.[lado];
  const linhas = escalacao ? linhasDoCampo(escalacao, detalhes!.lances, lado === 'mandante') : null;
  return (
    <div className={`${styles.col} ${styles.colEscalacao}`}>
      <div className={styles.colHead}>
        <h3 className={`${ui.titleLg} ${styles.colTitulo}`}>Escalação</h3>
        <Segmented
          options={[
            { id: 'mandante', label: partida.mandante_nome },
            { id: 'visitante', label: partida.visitante_nome },
          ]}
          value={lado}
          onChange={setLado}
        />
      </div>
      {linhas && <div className={styles.fonte}>Escalação oficial{escalacao?.formacao ? ` · ${escalacao.formacao}` : ''}</div>}
      {detalhes === undefined ? (
        <Skeleton h={396} r={14} />
      ) : linhas ? (
        <>
          <Pitch className={styles.campo}>
            {linhas.map((linha, i) => (
              <PitchRow key={i}>
                {linha.map((j) => (
                  <div key={j.id} className={styles.slot}>
                    <div className={styles.shirt}>{j.numero ?? ''}</div>
                    <div className={styles.player} title={j.nome}>
                      {j.nome}
                    </div>
                    <div className={styles.tag}>{j.tag}</div>
                  </div>
                ))}
              </PitchRow>
            ))}
          </Pitch>
        </>
      ) : (
        <p className={styles.vazio}>A escalação oficial aparece cerca de 1 h antes do jogo.</p>
      )}
    </div>
  );
}

function Numeros({ partida, detalhes }: { partida: Partida; detalhes: Detalhes | null | undefined }) {
  const linhas = detalhes?.estatisticas ? linhasDosNumeros(detalhes.estatisticas) : null;
  return (
    <section className={styles.panel} aria-labelledby="titulo-numeros">
      <h3 id="titulo-numeros" className={styles.panelTitle}>
        Números da partida
      </h3>
      {detalhes === undefined ? (
        <Skeleton h={160} r={10} />
      ) : !linhas?.length ? (
        <p className={styles.vazio}>{partida.status === 'agendada' ? 'Os números aparecem quando a bola rolar.' : 'Os números deste jogo ainda não chegaram.'}</p>
      ) : (
        <>
          {linhas.map((s) => (
            <div key={s.rotulo} className={styles.stat}>
              <div className={styles.statHead}>
                <span>{s.casa}</span>
                <span className={styles.statLabel}>{s.rotulo}</span>
                <span>{s.fora}</span>
              </div>
              <div className={styles.bars} aria-hidden="true">
                <div className={styles.barHome}>
                  <div className={styles.barFill} style={{ width: s.barraCasa }} />
                </div>
                <div className={styles.barAway}>
                  <div className={styles.barFill} style={{ width: s.barraFora }} />
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function Lances({ partida, detalhes }: { partida: Partida; detalhes: Detalhes | null | undefined }) {
  return (
    <section className={styles.panel} aria-labelledby="titulo-lances">
      <h3 id="titulo-lances" className={`${styles.panelTitle} ${styles.tight}`}>
        Lances do jogo
      </h3>
      {detalhes === undefined ? (
        <Skeleton h={90} r={10} />
      ) : !detalhes?.lances.length ? (
        <p className={styles.vazio}>{partida.status === 'agendada' ? 'Gols, cartões e substituições aparecem aqui durante o jogo.' : 'Nenhum lance ainda.'}</p>
      ) : (
        <ul className={styles.lances}>
          {detalhes.lances.map((l, i) => {
            const { icone, cor } = iconeDoLance(l);
            return (
              <li key={`${l.minuto}-${i}`} className={styles.event}>
                <span className={styles.eventMin}>{l.minuto}'</span>
                <Icon name={icone} size={19} color={cor} />
                <span className={styles.eventText}>{textoDoLance(l)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** W02 · Jogo · ao vivo e chat: placar, escalação, números, lances e o chat da torcida, ao vivo ou depois do jogo. */
export function Jogo() {
  const { id: param } = useParams();
  const id = Number(param);
  const { perfil } = useAuth();
  const { partida, erro, detalhes, tentarDeNovo } = useJogo(id);

  if (!Number.isInteger(id) || id <= 0 || partida === null) {
    return (
      <div className={styles.page}>
        <FaixaDoJogo partida={null} />
        <div className={styles.aviso}>
          <Icon name="sports_soccer" size={28} color="var(--muted)" />
          <p>Não achamos esse jogo.</p>
          <Link to="/jogos" className={ui.btnBlue}>
            Ver os jogos
          </Link>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className={styles.page}>
        <FaixaDoJogo partida={null} />
        <div className={styles.aviso}>
          <Icon name="cloud_off" size={28} color="var(--muted)" />
          <p>Não deu para carregar o jogo. Verifique sua conexão.</p>
          <button type="button" className={ui.btnBlue} onClick={tentarDeNovo}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  if (!partida) {
    return (
      <div className={styles.page} aria-busy="true">
        <TextoOculto>Carregando o jogo…</TextoOculto>
        <FaixaDoJogo partida={null} />
        <div className={styles.bar}>
          <Skeleton tom="escuro" w={420} h={52} r={11} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <FaixaDoJogo partida={partida} />
      <Placar partida={partida} clubeId={perfil?.time_id ?? null} />
      <div className={styles.grid}>
        <Escalacao key={partida.id} partida={partida} detalhes={detalhes} clubeId={perfil?.time_id ?? null} />
        <div className={styles.colStack}>
          <Numeros partida={partida} detalhes={detalhes} />
          <Lances partida={partida} detalhes={detalhes} />
          {partida.status === 'encerrada' && (
            <Link to="/pos-jogo" className={styles.notas}>
              <Icon name="star_rate" size={26} color="var(--primary)" />
              <div className={styles.notasTexto}>
                <strong>Dê suas notas e vote no MVP</strong>
                <span>até +120 XP</span>
              </div>
              <Icon name="chevron_right" size={22} color="var(--primary)" />
            </Link>
          )}
        </div>
        <ChatDaTorcida partida={partida} />
      </div>
    </div>
  );
}
