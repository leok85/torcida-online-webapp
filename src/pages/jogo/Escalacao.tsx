import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Crest } from '../../components/ui/Crest';
import { Icon } from '../../components/ui/Icon';
import { Pitch, PitchRow } from '../../components/ui/Pitch';
import { Skeleton, TextoOculto } from '../../components/ui/Skeleton';
import { ELIGIBLE, FORMACAO_PADRAO, FORMATIONS, GOALKEEPER_SLOT, escalar, linhasDaFormacao, resolveLineup, slotsFor, type Escalacao } from '../../data/lineup';
import {
  MENSAGEM_DO_PALPITE,
  FECHA_ANTES_MS,
  buscarElencos,
  buscarMaisVotada,
  buscarMeuPalpite,
  buscarPalpitesDaTorcida,
  descricaoDoJogador,
  enviarPalpite,
  lembrarPalpite,
  lesionado,
  temLembrete,
  situacaoDoPalpite,
  type Autor,
  type Elencos,
  type ErroDoPalpite,
  type JogadorDoElenco,
  type MaisVotada,
  type Palpite,
  type PlacarDaTorcida,
  type SituacaoDoPalpite,
} from '../../data/palpite';
import { diaEHoraDe, horaDe, type Partida } from '../../data/partidas';
import { useJogosDoClube } from '../../partidas/JogosDoClube';
import ui from '../../styles/ui.module.css';
import { FaixaDoJogo, useJogo } from './Jogo';
import jogo from './Jogo.module.css';
import styles from './Escalacao.module.css';

const MAX_GOLS = 9;
/** De quanto em quanto tempo a tela confere se o palpite fechou (15 min antes do início). */
export const CONFERIR_FECHAMENTO_MS = 30_000;

function Stepper({ valor, onChange, time, travado }: { valor: number; onChange: (v: number) => void; time: string; travado: boolean }) {
  return (
    <div className={styles.stepper}>
      {!travado && (
        <button type="button" className={styles.step} aria-label={`Menos um gol do ${time}`} disabled={valor <= 0} onClick={() => onChange(valor - 1)}>
          <Icon name="remove" size={18} />
        </button>
      )}
      <div className={styles.goals} aria-label={`Gols do ${time}: ${valor}`}>
        {valor}
      </div>
      {!travado && (
        <button type="button" className={styles.stepUp} aria-label={`Mais um gol do ${time}`} disabled={valor >= MAX_GOLS} onClick={() => onChange(valor + 1)}>
          <Icon name="add" size={18} />
        </button>
      )}
    </div>
  );
}

/** Um select por gol do palpite: quem marca o 1º, o 2º... gol daquele time. */
function AutoresDoTime({
  time,
  gols,
  elenco,
  escolhas,
  onChange,
  travado,
}: {
  time: string;
  gols: number;
  elenco: JogadorDoElenco[];
  escolhas: (number | null)[];
  onChange: (indice: number, jogador: number | null) => void;
  travado: boolean;
}) {
  return (
    <div className={styles.autoresDoTime}>
      <div className={styles.autoresTitulo}>Gols do {time}</div>
      {Array.from({ length: gols }, (_, i) => {
        const valor = escolhas[i] ?? null;
        return (
          <div key={i} className={styles.autor}>
            <Icon name="sports_soccer" size={17} color={valor ? 'var(--green-dark)' : 'var(--line-3)'} />
            <div className={styles.selectAutor}>
              <select
                aria-label={`${i + 1}º gol do ${time}`}
                className={valor ? `${styles.select} ${styles.selectEscolhido}` : styles.select}
                value={valor ?? ''}
                disabled={travado}
                onChange={(e) => onChange(i, e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">{i + 1}º gol · escolher jogador</option>
                {elenco.map((j) => (
                  <option key={j.id} value={j.id} disabled={lesionado(j)}>
                    {i + 1}º gol · {j.nome}
                    {lesionado(j) ? ' (lesionado)' : ''}
                  </option>
                ))}
              </select>
              <Icon name="expand_more" size={20} color="var(--muted)" className={styles.setaSelect} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function autoresDe(palpite: Palpite | null, mandante: boolean) {
  return (palpite?.autores ?? []).filter((a) => a.mandante === mandante).map((a) => a.jogador);
}

/** O formulário (aberto) ou o que o torcedor mandou (fechado). */
function Formulario({
  partida,
  elencos,
  salvo,
  situacao,
  aoSalvar,
}: {
  partida: Partida;
  elencos: Elencos;
  salvo: Palpite | null;
  situacao: SituacaoDoPalpite;
  aoSalvar: (p: Palpite) => void;
}) {
  const { perfil } = useAuth();
  const mandante = perfil?.time_id === partida.mandante_id;
  const meuElenco = mandante ? elencos.mandante : elencos.visitante;
  const travado = situacao !== 'aberto';

  const [formacao, setFormacao] = useState(salvo?.formacao && FORMATIONS[salvo.formacao] ? salvo.formacao : FORMACAO_PADRAO);
  const [escolhas, setEscolhas] = useState<Escalacao>(salvo?.escalacao ?? {});
  const [vaga, setVaga] = useState(GOALKEEPER_SLOT);
  const [golsMandante, setGolsMandante] = useState(salvo?.gols_mandante ?? 0);
  const [golsVisitante, setGolsVisitante] = useState(salvo?.gols_visitante ?? 0);
  const [autoresMandante, setAutoresMandante] = useState<(number | null)[]>(() => autoresDe(salvo, true));
  const [autoresVisitante, setAutoresVisitante] = useState<(number | null)[]>(() => autoresDe(salvo, false));
  const [quemMarcaAberto, setQuemMarcaAberto] = useState(() => (salvo?.autores.length ?? 0) > 0);
  // Quem se lesionou depois do palpite sai da escalação: a tela avisa e pede para confirmar de novo.
  const [saiuLesionado] = useState(() =>
    Object.values(salvo?.escalacao ?? {})
      .map((id) => meuElenco.find((j) => j.id === id))
      .filter((j): j is JogadorDoElenco => !!j && lesionado(j))
      .map((j) => j.nome),
  );
  const [confirmado, setConfirmado] = useState(!!salvo && !saiuLesionado.length);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroDoPalpite | null>(null);

  const slots = useMemo(() => slotsFor(formacao), [formacao]);
  const lineup = useMemo(() => resolveLineup(slots, escolhas, meuElenco), [slots, escolhas, meuElenco]);
  const porId = useMemo(() => new Map(meuElenco.map((j) => [j.id, j])), [meuElenco]);

  const linhas = useMemo(() => linhasDaFormacao(slots), [slots]);

  const selecionada = slots.find((s) => s.id === vaga) ?? slots[0];
  const emCampo = new Set(Object.values(lineup));
  const opcoes = meuElenco.filter((j) => ELIGIBLE[selecionada.pos].includes(j.posicao));
  const completa = slots.every((s) => lineup[s.id] != null);

  const mudou = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setConfirmado(false);
    setErro(null);
  };

  const escolherFormacao = mudou((f: string) => {
    setFormacao(f);
    setEscolhas({});
    setVaga(GOALKEEPER_SLOT);
  });
  const escolherJogador = mudou((id: number) => setEscolhas(escalar(lineup, selecionada.id, id)));
  const mudarAutor = (lado: 'mandante' | 'visitante') =>
    mudou(({ i, jogador }: { i: number; jogador: number | null }) =>
      (lado === 'mandante' ? setAutoresMandante : setAutoresVisitante)((atual) => {
        const novo = [...atual];
        novo[i] = jogador;
        return novo;
      }),
    );

  async function confirmar() {
    const autores: Autor[] = [
      ...autoresMandante.slice(0, golsMandante).filter((j): j is number => j != null).map((jogador) => ({ mandante: true, jogador })),
      ...autoresVisitante.slice(0, golsVisitante).filter((j): j is number => j != null).map((jogador) => ({ mandante: false, jogador })),
    ];
    const palpite: Palpite = { formacao, escalacao: lineup, gols_mandante: golsMandante, gols_visitante: golsVisitante, autores };
    setEnviando(true);
    setErro(null);
    const r = await enviarPalpite(partida.id, palpite);
    setEnviando(false);
    if (r.ok) {
      setConfirmado(true);
      aoSalvar(palpite);
    } else setErro(r.erro);
  }

  const semGols = golsMandante === 0 && golsVisitante === 0;

  return (
    <>
      {!travado && saiuLesionado.length > 0 && (
        <div className={styles.avisoLesao} role="status">
          <Icon name="personal_injury" size={18} />
          {saiuLesionado.join(', ')} se {saiuLesionado.length > 1 ? 'lesionaram e saíram' : 'lesionou e saiu'} da sua escalação. Confira e confirme de novo.
        </div>
      )}
      <div className={styles.grid}>
        <section className={ui.card} aria-label="Escalação">
          {!travado && (
            <div className={styles.formations} role="group" aria-label="Formação">
              {Object.keys(FORMATIONS).map((f) => (
                <button key={f} type="button" aria-pressed={f === formacao} className={f === formacao ? `${styles.formation} ${styles.active}` : styles.formation} onClick={() => escolherFormacao(f)}>
                  {f}
                </button>
              ))}
            </div>
          )}
          {travado && <div className={styles.formacaoTravada}>Sua escalação · {formacao}</div>}
          <Pitch size="lg">
            {linhas.map((linha) => (
              <PitchRow key={linha[0].line}>
                {linha.map((slot) => {
                  const j = porId.get(lineup[slot.id]);
                  const conteudo = (
                    <>
                      <div className={styles.shirt}>{j?.numero ?? '?'}</div>
                      <div className={styles.name}>{j?.nome ?? 'vazio'}</div>
                      <div className={styles.pos}>{slot.pos}</div>
                    </>
                  );
                  return travado ? (
                    <div key={slot.id} className={styles.slot}>
                      {conteudo}
                    </div>
                  ) : (
                    <button
                      key={slot.id}
                      type="button"
                      aria-label={`${slot.pos}: ${j?.nome ?? 'vazio'}`}
                      aria-pressed={slot.id === vaga}
                      className={slot.id === vaga ? `${styles.slot} ${styles.active}` : styles.slot}
                      onClick={() => setVaga(slot.id)}
                    >
                      {conteudo}
                    </button>
                  );
                })}
              </PitchRow>
            ))}
          </Pitch>
        </section>

        <div className={styles.stack}>
          {!travado && (
            <section className={ui.card} aria-labelledby="quem-joga">
              <div className={styles.pickHead}>
                <h3 id="quem-joga" className={ui.title}>
                  Quem joga de {selecionada.pos}
                </h3>
                <div className={ui.goldPill}>
                  <Icon name="touch_app" size={15} />
                  clique no campo
                </div>
              </div>
              <p className={styles.hint}>Clique numa posição no campo e escolha o jogador. Se ele já estiver escalado, os dois trocam de lugar.</p>
              <div className={styles.options} role="group" aria-label="Jogadores para a posição">
                {opcoes.map((j) => {
                  const aqui = lineup[selecionada.id] === j.id;
                  const fora = lesionado(j);
                  const estado = fora ? null : aqui ? 'escalado aqui' : emCampo.has(j.id) ? 'já está em campo' : 'no banco';
                  return (
                    <button
                      key={j.id}
                      type="button"
                      disabled={fora}
                      aria-label={[`${j.nome}, ${descricaoDoJogador(j)}`, estado].filter(Boolean).join(' · ')}
                      className={aqui ? `${styles.option} ${styles.here}` : fora ? `${styles.option} ${styles.lesionado}` : styles.option}
                      onClick={() => escolherJogador(j.id)}
                    >
                      <div className={styles.num}>{j.numero ?? '–'}</div>
                      <div className={styles.optionTexto}>
                        <div className={styles.optionName}>{j.nome}</div>
                        <div className={styles.optionMeta}>
                          {[descricaoDoJogador(j), estado].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      {fora && (
                        <span className={styles.icLesao} title="Lesionado">
                          <Icon name="personal_injury" size={18} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className={ui.card} aria-labelledby="titulo-palpite">
            <h3 id="titulo-palpite" className={styles.guessTitle}>
              {travado ? 'Seu palpite' : 'Palpite do resultado'}
            </h3>
            <div className={styles.guess}>
              <div className={styles.side}>
                <Crest width={42} height={47} tone="lightHome" clubeId={partida.mandante_id} />
                <Stepper valor={golsMandante} onChange={mudou(setGolsMandante)} time={partida.mandante_nome} travado={travado} />
              </div>
              <div className={styles.times}>×</div>
              <div className={styles.side}>
                <Crest width={42} height={47} tone="light" clubeId={partida.visitante_id} />
                <Stepper valor={golsVisitante} onChange={mudou(setGolsVisitante)} time={partida.visitante_nome} travado={travado} />
              </div>
            </div>
            <div className={styles.rewardFirst}>
              <span>Placar exato</span>
              <strong>+240 XP</strong>
            </div>
            <div className={styles.reward}>
              <span>Só o vencedor</span>
              <strong>+60 XP</strong>
            </div>

            <div className={styles.quemMarca}>
              <button type="button" className={styles.quemMarcaTopo} aria-expanded={quemMarcaAberto} onClick={() => setQuemMarcaAberto((a) => !a)}>
                <span className={styles.quemMarcaTexto}>
                  <span className={styles.quemMarcaTitulo}>
                    Quem marca? <span className={styles.opcional}>(opcional)</span>
                  </span>
                  <span className={styles.quemMarcaSub}>+40 XP por autor de gol certo</span>
                </span>
                <Icon name={quemMarcaAberto ? 'expand_less' : 'expand_more'} size={22} color="var(--primary)" />
              </button>
              {quemMarcaAberto && (
                <div className={styles.autores}>
                  {golsMandante > 0 && (
                    <AutoresDoTime
                      time={partida.mandante_nome}
                      gols={golsMandante}
                      elenco={elencos.mandante}
                      escolhas={autoresMandante}
                      onChange={(i, jogador) => mudarAutor('mandante')({ i, jogador })}
                      travado={travado}
                    />
                  )}
                  {golsVisitante > 0 && (
                    <AutoresDoTime
                      time={partida.visitante_nome}
                      gols={golsVisitante}
                      elenco={elencos.visitante}
                      escolhas={autoresVisitante}
                      onChange={(i, jogador) => mudarAutor('visitante')({ i, jogador })}
                      travado={travado}
                    />
                  )}
                  {semGols && <p className={styles.semAutores}>Com placar 0 x 0 não há autores para palpitar.</p>}
                </div>
              )}
            </div>

            {erro && (
              <p className={styles.erro} role="alert">
                {MENSAGEM_DO_PALPITE[erro]}
              </p>
            )}
            {!travado && (
              <button
                type="button"
                className={confirmado ? `${styles.confirm} ${styles.confirmed}` : styles.confirm}
                disabled={enviando || confirmado || !completa}
                onClick={confirmar}
              >
                <Icon name="check" size={20} />
                {confirmado ? 'Escalação e palpite confirmados' : enviando ? 'Enviando…' : 'Confirmar escalação e palpite'}
              </button>
            )}
            {!travado && !completa && <p className={styles.semAutores}>Faltam jogadores no elenco para completar o time.</p>}
          </section>
        </div>
      </div>
    </>
  );
}

/** Aviso no lugar do formulário. */
function Aviso({ icone, texto, children }: { icone: string; texto: string; children?: ReactNode }) {
  return (
    <div className={jogo.aviso}>
      <Icon name={icone} size={28} color="var(--muted)" />
      <p>{texto}</p>
      {children}
    </div>
  );
}

const SUBTITULO: Record<Exclude<SituacaoDoPalpite, 'fechado'>, string> = {
  aberto: 'fecha 15 min antes',
  nao_abriu: 'abre quando o jogo anterior terminar',
};

/** Quando o palpite do jogo fecha: 15 min antes do início. */
const fechamentoDe = (p: Partida) => new Date(new Date(p.inicio).getTime() - FECHA_ANTES_MS);

/** Campo azul da escalação mais votada (W03 · palpite encerrado). */
function CampoMaisVotado({ mais }: { mais: MaisVotada & { formacao: string } }) {
  const porVaga = new Map(mais.jogadores.map((j) => [j.vaga, j]));
  return (
    <div className={styles.campoAzul}>
      {linhasDaFormacao(slotsFor(mais.formacao)).map((linha) => (
        <div key={linha[0].line} className={styles.linhaAzul}>
          {linha.map((s) => {
            const j = porVaga.get(s.id);
            return (
              <div key={s.id} className={styles.slotAzul}>
                <div className={styles.camisaAzul}>{j?.numero ?? ''}</div>
                <div className={styles.nomeAzul}>{j?.nome ?? '—'}</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** W03 · palpite encerrado sem envio: o prazo passou; a escalação e os placares da torcida, e o próximo palpite. */
function PalpiteEncerrado({ partida, jogos }: { partida: Partida; jogos: Partida[] }) {
  const [mais, setMais] = useState<MaisVotada | null | undefined>(undefined);
  const [placares, setPlacares] = useState<PlacarDaTorcida[] | null | undefined>(undefined);
  const proximo = jogos.find((p) => p.status === 'agendada' && p.id !== partida.id && p.inicio > partida.inicio) ?? null;
  const [lembrete, setLembrete] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    buscarMaisVotada(partida.id).then((m) => vivo && setMais(m));
    buscarPalpitesDaTorcida(partida.id).then((p) => vivo && setPlacares(p));
    return () => void (vivo = false);
  }, [partida.id]);

  const proximoId = proximo?.id;
  useEffect(() => {
    if (!proximoId) return;
    let vivo = true;
    temLembrete(proximoId).then((t) => vivo && setLembrete(t));
    return () => void (vivo = false);
  }, [proximoId]);

  async function alternarLembrete() {
    if (!proximo || lembrete === undefined) return;
    const novo = !lembrete;
    setLembrete(novo);
    if (!(await lembrarPalpite(proximo.id, novo))) setLembrete(!novo);
  }

  const hora = horaDe(new Date(partida.inicio));
  const agendada = partida.status === 'agendada';
  const semDados = (texto: string) => <p className={styles.semDados}>{texto}</p>;

  return (
    <div className={styles.encerradoPagina}>
      <section className={styles.semEnvio} aria-label="Palpite encerrado">
        <div className={styles.semEnvioIcone}>
          <Icon name="timer_off" size={24} color="var(--muted)" />
        </div>
        <div className={styles.semEnvioTexto}>
          <strong>Você não enviou escalação nem palpite para este jogo</strong>
          <span>
            {agendada
              ? `O prazo fecha 15 min antes do apito. O ao vivo e o chat abrem às ${hora}, e as notas no fim do jogo.`
              : 'O prazo fechou 15 min antes do apito.'}
          </span>
        </div>
        {agendada ? (
          <span className={styles.semEnvioAcao}>
            <Icon name="schedule" size={19} />
            Ao vivo abre às {hora}
          </span>
        ) : (
          <Link to={partida.status === 'encerrada' ? `/jogo/${partida.id}/notas` : `/jogo/${partida.id}`} className={styles.semEnvioAcao}>
            <Icon name={partida.status === 'encerrada' ? 'star_rate' : 'forum'} size={19} />
            {partida.status === 'encerrada' ? 'Ver notas do jogo' : 'Entrar no ao vivo'}
          </Link>
        )}
      </section>

      <div className={styles.grid}>
        <section className={styles.cardEncerrado} aria-labelledby="titulo-mais-votada">
          <div className={styles.cabecalhoEncerrado}>
            <h3 id="titulo-mais-votada" className={styles.tituloEncerrado}>
              Escalação mais votada
            </h3>
            {mais?.formacao && (
              <span className={styles.subEncerrado}>
                {mais.formacao} · {mais.votantes.toLocaleString('pt-BR')} torcedores
              </span>
            )}
          </div>
          {mais === undefined ? (
            <Skeleton h={380} r={14} />
          ) : mais?.formacao ? (
            <CampoMaisVotado mais={{ ...mais, formacao: mais.formacao }} />
          ) : (
            semDados(mais ? 'Não teve dados suficientes: a torcida não votou o bastante para montar a escalação.' : 'Não deu para carregar agora.')
          )}
        </section>

        <div className={styles.stack}>
          <section className={styles.cardEncerrado} aria-labelledby="titulo-placares">
            <h3 id="titulo-placares" className={`${styles.tituloEncerrado} ${styles.tituloPlacares}`}>
              Palpites da torcida
            </h3>
            {placares === undefined ? (
              <Skeleton h={140} r={10} />
            ) : placares?.length ? (
              <ul className={styles.placares}>
                {placares.map((p) => {
                  const pct = `${Math.round((p.votos / p.total) * 100)}%`;
                  return (
                    <li key={`${p.gols_mandante}x${p.gols_visitante}`} className={styles.placar}>
                      <span className={styles.placarGols}>
                        {p.gols_mandante} x {p.gols_visitante}
                      </span>
                      <span className={styles.barra}>
                        <span style={{ width: pct }} />
                      </span>
                      <span className={styles.pct}>{pct}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              semDados(placares ? 'Não teve dados suficientes: poucos palpites da torcida.' : 'Não deu para carregar agora.')
            )}
          </section>

          {proximo && (
            <section className={styles.proximo} aria-label="Próximo palpite">
              <Icon name="notifications_active" size={24} color="var(--primary)" />
              <div className={styles.proximoTexto}>
                <strong>
                  Próximo palpite: {proximo.mandante_nome} × {proximo.visitante_nome}
                </strong>
                <span>
                  {partida.status === 'encerrada' ? 'aberto' : 'abre no apito final'} · fecha {diaEHoraDe(fechamentoDe(proximo))}
                </span>
              </div>
              {partida.status === 'encerrada' ? (
                <Link to={`/jogo/${proximo.id}/escalacao`} className={styles.lembrete}>
                  <Icon name="how_to_reg" size={17} />
                  Palpitar
                </Link>
              ) : (
                <button
                  type="button"
                  className={lembrete ? `${styles.lembrete} ${styles.lembreteLigado}` : styles.lembrete}
                  aria-pressed={!!lembrete}
                  disabled={lembrete === undefined}
                  onClick={alternarLembrete}
                >
                  <Icon name={lembrete ? 'check' : 'notifications'} size={17} />
                  {lembrete ? 'Vamos avisar' : 'Me avise'}
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** W03 · escalação ideal e palpite de um jogo: só antes do jogo; depois fica para consulta. */
export function EscalacaoEPalpite() {
  const { id: param } = useParams();
  const id = Number(param);
  const { perfil } = useAuth();
  const { jogos } = useJogosDoClube();
  const { partida, erro, tentarDeNovo } = useJogo(id);
  const [elencos, setElencos] = useState<Elencos | null | undefined>(undefined);
  const [salvo, setSalvo] = useState<Palpite | null | undefined>(undefined);
  const [agora, setAgora] = useState(() => new Date());

  const clubeId = perfil?.time_id ?? null;
  const doJogo = !!partida && (clubeId === partida.mandante_id || clubeId === partida.visitante_id);
  const situacao = partida ? situacaoDoPalpite(partida, jogos ?? [], agora) : undefined;

  useEffect(() => {
    if (situacao !== 'aberto') return;
    const timer = window.setInterval(() => setAgora(new Date()), CONFERIR_FECHAMENTO_MS);
    return () => window.clearInterval(timer);
  }, [situacao]);

  const temPartida = !!partida;
  useEffect(() => {
    if (!temPartida || !doJogo) return;
    let vivo = true;
    buscarElencos(id).then((e) => vivo && setElencos(e));
    buscarMeuPalpite(id).then((p) => vivo && setSalvo(p === undefined ? null : p));
    return () => void (vivo = false);
  }, [id, temPartida, doJogo]);

  if (!Number.isInteger(id) || id <= 0 || partida === null || erro) {
    return (
      <div className={styles.page}>
        <FaixaDoJogo partida={null} atual="pre" />
        <Aviso icone={erro ? 'cloud_off' : 'sports_soccer'} texto={erro ? 'Não deu para carregar o jogo. Verifique sua conexão.' : 'Não achamos esse jogo.'}>
          {erro ? (
            <button type="button" className={ui.btnBlue} onClick={tentarDeNovo}>
              Tentar de novo
            </button>
          ) : (
            <Link to="/jogos" className={ui.btnBlue}>
              Ver os jogos
            </Link>
          )}
        </Aviso>
      </div>
    );
  }

  if (!partida || !situacao) {
    return (
      <div className={styles.page} aria-busy="true">
        <TextoOculto>Carregando o jogo…</TextoOculto>
        <FaixaDoJogo partida={null} atual="pre" />
      </div>
    );
  }

  const carregando = doJogo && (elencos === undefined || salvo === undefined || !jogos);

  return (
    <div className={styles.page}>
      <FaixaDoJogo partida={partida} atual="pre" />
      <div className={styles.corpo}>
        <div className={ui.pageHead}>
          <h2 className={ui.pageTitle}>Escalação ideal e palpite</h2>
          <span className={ui.pageSub}>
            {partida.mandante_nome} × {partida.visitante_nome} ·{' '}
            {situacao === 'fechado' ? `fechou às ${horaDe(fechamentoDe(partida))}` : SUBTITULO[situacao]}
          </span>
          <div className={ui.spacer} />
          {situacao === 'fechado' ? (
            <div className={styles.encerrado}>
              <Icon name="lock" size={15} />
              Encerrado
            </div>
          ) : (
            <div className={ui.xpPill}>+80 XP</div>
          )}
        </div>

        {!doJogo ? (
          <Aviso icone="how_to_reg" texto="O palpite é da torcida dos times em campo." />
        ) : carregando ? (
          <div className={styles.grid}>
            <Skeleton h={560} r={16} />
            <Skeleton h={420} r={16} />
          </div>
        ) : !elencos ? (
          <Aviso icone="cloud_off" texto="Não deu para carregar os elencos agora. Tente de novo em instantes." />
        ) : situacao === 'nao_abriu' ? (
          <Aviso icone="lock_clock" texto="O palpite deste jogo abre quando o jogo anterior terminar.">
            <Link to="/jogos" className={ui.btnBlue}>
              Ver os jogos
            </Link>
          </Aviso>
        ) : situacao === 'fechado' && !salvo ? (
          <PalpiteEncerrado partida={partida} jogos={jogos ?? []} />
        ) : (
          <>
            {situacao === 'fechado' && (
              <div className={styles.fechado} role="status">
                <Icon name="lock" size={18} />
                O palpite fechou 15 min antes do início. Sua escalação e seu palpite ficam aqui para consulta.
              </div>
            )}
            <Formulario
              // Ao fechar, o formulário vira leitura com o que foi salvo.
              key={situacao}
              partida={partida}
              elencos={elencos}
              salvo={salvo ?? null}
              situacao={situacao}
              aoSalvar={setSalvo}
            />
          </>
        )}
      </div>
    </div>
  );
}
