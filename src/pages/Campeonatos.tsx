import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Crest } from '../components/ui/Crest';
import { Icon } from '../components/ui/Icon';
import { Modal } from '../components/ui/Modal';
import { Carregando, Skeleton, SkeletonEscudo } from '../components/ui/Skeleton';
import {
  aproveitamento,
  atualizacaoDaTabela,
  dadosDosCampeonatos,
  diaCurto,
  ehAmistoso,
  formaDaLinha,
  montarCampeonatos,
  resumoDaTabela,
  type Campeonato,
  type Competicao,
  type EtapaDoCaminho,
  type LinhaDaTabela,
} from '../data/campeonatos';
import { resultadoPara, type Partida } from '../data/partidas';
import { useJogosDoClube } from '../partidas/JogosDoClube';
import { ListaDeResultados } from '../partidas/ListaDeResultados';
import ui from '../styles/ui.module.css';
import styles from './Campeonatos.module.css';

const ICONE_DO_FORMATO: Record<Competicao['formato'], string> = {
  pontos_corridos: 'format_list_numbered',
  mata_mata: 'account_tree',
  grupos_mata_mata: 'public',
};

const ROTULO_RESULTADO = { V: 'Vitória', E: 'Empate', D: 'Derrota' };

/** Cor da faixa da zona na tabela: vaga continental/classificação em verde, segunda copa em azul, queda em vermelho. */
function corDaZona(linha: Pick<LinhaDaTabela, 'zona' | 'zona_tipo'>) {
  if (!linha.zona) return null;
  if (linha.zona_tipo === 'relegation' || /rebaixamento/i.test(linha.zona)) return 'var(--red)';
  if (/sul-americana|europa league|conference/i.test(linha.zona)) return 'var(--primary)';
  return 'var(--green)';
}

const placar = (p: Partida) =>
  p.status === 'agendada' ? `${p.mandante_nome} x ${p.visitante_nome}` : `${p.mandante_nome} ${p.gols_mandante ?? 0} x ${p.gols_visitante ?? 0} ${p.visitante_nome}`;

function useDadosDosCampeonatos(ligaIds: number[]) {
  const chave = ligaIds.join(',');
  const [estado, setEstado] = useState<{ chave: string; dados?: Awaited<ReturnType<typeof dadosDosCampeonatos>>; erro?: boolean } | null>(null);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!chave) return;
    let ativo = true;
    dadosDosCampeonatos(chave.split(',').map(Number)).then(
      (dados) => ativo && setEstado({ chave, dados }),
      () => ativo && setEstado({ chave, erro: true }),
    );
    return () => {
      ativo = false;
    };
  }, [chave, tentativa]);
  const atual = estado?.chave === chave ? estado : null;
  return { dados: atual?.dados, erro: !!atual?.erro, tentarDeNovo: () => setTentativa((t) => t + 1) };
}

function Tabela({
  titulo,
  linhas,
  clubeId,
  legenda = true,
  rodape,
}: {
  titulo: string;
  linhas: LinhaDaTabela[];
  clubeId: number;
  legenda?: boolean;
  rodape?: ReactNode;
}) {
  const zonas = [...new Map(linhas.filter((l) => l.zona).map((l) => [l.zona!, corDaZona(l)])).entries()];
  return (
    <section className={ui.cardFlush} aria-label={titulo}>
      <div className={ui.cardHeader}>
        <h3 className={ui.titleLg}>{titulo}</h3>
        {legenda && zonas.length > 0 && (
          <div className={styles.legend}>
            {zonas.map(([zona, cor]) => (
              <div key={zona} className={styles.legendItem}>
                <span className={styles.mark} style={{ background: cor ?? undefined }} />
                {zona}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={styles.head} aria-hidden="true">
        <span className={styles.w26}>#</span>
        <span className={styles.w26} />
        <span className={styles.name}>time</span>
        <span className={styles.num}>pts</span>
        <span className={styles.narrow}>j</span>
        <span className={styles.num}>sg</span>
      </div>
      <ol className={styles.lista}>
        {linhas.map((l) => {
          const sg = l.gols_pro - l.gols_contra;
          return (
            <li
              key={`${l.grupo}-${l.clube_id}`}
              className={l.clube_id === clubeId ? `${styles.row} ${styles.me}` : styles.row}
              aria-current={l.clube_id === clubeId ? 'true' : undefined}
            >
              <div className={styles.pos}>
                <span className={styles.mark} style={{ background: corDaZona(l) ?? 'transparent' }} title={l.zona ?? undefined} />
                {l.posicao}
              </div>
              <Crest width={26} height={30} clubeId={l.clube_id} />
              <span className={styles.name}>{l.clube_nome ?? `Time ${l.clube_id}`}</span>
              <span className={styles.pts}>{l.pontos}</span>
              <span className={`${styles.narrow} ${styles.stat}`}>{l.jogos}</span>
              <span className={`${styles.num} ${styles.stat}`}>{sg > 0 ? `+${sg}` : sg}</span>
            </li>
          );
        })}
      </ol>
      {rodape}
    </section>
  );
}

const sinal = (n: number) => (n > 0 ? `+${n}` : String(n));

/** W10 · a classificação inteira da liga numa janela, com v/e/d, gols, aproveitamento e os últimos 5. */
function TabelaCompleta({ c, clubeId, onFechar }: { c: Campeonato; clubeId: number; onFechar: () => void }) {
  const zonas = [...new Map(c.tabela.filter((l) => l.zona).map((l) => [l.zona!, corDaZona(l)])).entries()];
  const rodada = c.rodada ? (c.rodadas ? `rodada ${c.rodada} de ${c.rodadas}` : `rodada ${c.rodada}`) : null;
  const sub = [rodada, atualizacaoDaTabela(c.tabela)].filter(Boolean).join(' · ');
  return (
    <Modal rotulo={`${c.nome} · classificação`} onFechar={onFechar} largura={960}>
      <div className={styles.tcTopo}>
        <div className={styles.tcTitulos}>
          <h2 className={styles.tcTitulo}>{c.nome} · classificação</h2>
          {sub && <div className={styles.tcSub}>{sub}</div>}
        </div>
        <button type="button" className={styles.tcFechar} aria-label="Fechar" onClick={onFechar}>
          <Icon name="close" size={21} />
        </button>
      </div>
      <div className={styles.tcCabeca} aria-hidden="true">
        <span className={styles.tcPos}>#</span>
        <span className={styles.tcTime}>time</span>
        <span className={styles.tc42}>pts</span>
        <span className={styles.tc34}>j</span>
        <span className={styles.tc34}>v</span>
        <span className={styles.tc34}>e</span>
        <span className={styles.tc34}>d</span>
        <span className={styles.tc38}>gp</span>
        <span className={styles.tc38}>gc</span>
        <span className={styles.tc42}>sg</span>
        <span className={styles.tc42}>%</span>
        <span className={styles.tcUltimos}>últimos 5</span>
      </div>
      <ol className={styles.tcLista}>
        {c.tabela.map((l) => {
          const eu = l.clube_id === clubeId;
          const forma = formaDaLinha(l.forma);
          return (
            <li key={l.clube_id} className={eu ? `${styles.tcLinha} ${styles.tcEu}` : styles.tcLinha} aria-current={eu ? 'true' : undefined}>
              <span className={styles.tcPos}>
                <span className={styles.tcMarca} style={{ background: corDaZona(l) ?? 'transparent' }} title={l.zona ?? undefined} />
                {l.posicao}
              </span>
              <span className={styles.tcTime}>
                <Crest width={22} height={26} clubeId={l.clube_id} />
                <span className={styles.tcNome}>{l.clube_nome ?? `Time ${l.clube_id}`}</span>
              </span>
              <span className={`${styles.tc42} ${styles.tcPts}`}>{l.pontos}</span>
              <span className={styles.tc34}>{l.jogos}</span>
              <span className={styles.tc34}>{l.vitorias}</span>
              <span className={styles.tc34}>{l.empates}</span>
              <span className={styles.tc34}>{l.derrotas}</span>
              <span className={styles.tc38}>{l.gols_pro}</span>
              <span className={styles.tc38}>{l.gols_contra}</span>
              <span className={styles.tc42}>{sinal(l.gols_pro - l.gols_contra)}</span>
              <span className={styles.tc42}>{aproveitamento(l)}%</span>
              <span className={styles.tcUltimos} aria-label={forma.length ? `Últimos 5: ${forma.join(' ')}` : undefined}>
                {forma.map((r, i) => (
                  <span key={i} className={`${styles.tcResultado} ${styles[`r${r}`]}`} title={ROTULO_RESULTADO[r]}>
                    {r}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      {zonas.length > 0 && (
        <div className={styles.tcLegenda}>
          {zonas.map(([zona, cor]) => (
            <div key={zona} className={styles.tcZona}>
              <span className={styles.mark} style={{ background: cor ?? undefined }} />
              {zona}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ListaDeJogos({ jogos, clubeId }: { jogos: Partida[]; clubeId: number }) {
  if (!jogos.length) return <p className={styles.vazio}>Sem jogos do clube nesta fase.</p>;
  return (
    <ul className={styles.jogos}>
      {jogos.map((p) => {
        const r = p.status === 'encerrada' ? resultadoPara(p, clubeId) : null;
        return (
          <li key={p.id} className={styles.jogo}>
            {r ? (
              <span className={`${styles.result} ${styles[`r${r}`]}`} title={ROTULO_RESULTADO[r]}>
                {r}
              </span>
            ) : (
              <span className={styles.resultVazio} />
            )}
            <span className={styles.jogoPlacar}>
              {placar(p)}
              {p.penaltis_mandante != null && ` (${p.penaltis_mandante} x ${p.penaltis_visitante} pên.)`}
            </span>
            <span className={styles.jogoData}>
              {p.jogo_de_ida ? 'volta · ' : ''}
              {p.rodada && !p.fase?.startsWith('round') ? `R${p.rodada} · ` : ''}
              {diaCurto(p.inicio)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Caminho({ etapas, clubeId }: { etapas: EtapaDoCaminho[]; clubeId: number }) {
  const [aberta, setAberta] = useState<string | null>(null);
  return (
    <section className={ui.cardFlush} aria-label="Caminho até a final">
      <div className={ui.cardHeader}>
        <h3 className={ui.titleLg}>Caminho até a final</h3>
      </div>
      <ol className={styles.caminho}>
        {etapas.map((e) => {
          const icone = e.estado === 'concluida' ? (e.resultado === 'D' ? 'cancel' : 'check_circle') : e.estado === 'atual' ? 'radio_button_checked' : 'radio_button_unchecked';
          const situacao =
            e.resultado === 'V' ? 'classificado' : e.resultado === 'D' ? 'eliminado' : e.estado === 'atual' ? 'em disputa' : e.estado === 'futura' ? 'a disputar' : '';
          const podeAbrir = e.jogos.length > 0 || e.tabela.length > 0;
          const id = `etapa-${e.fase}`;
          return (
            <li key={e.fase} className={`${styles.etapa} ${styles[e.estado]} ${e.resultado === 'D' ? styles.eliminada : ''}`}>
              <div className={styles.etapaLinha}>
                <Icon name={icone} size={20} />
                <span className={styles.etapaNome}>{e.nome}</span>
                {situacao && <span className={styles.etapaSituacao}>{situacao}</span>}
                {podeAbrir && (
                  <button
                    type="button"
                    className={styles.verJogos}
                    aria-expanded={aberta === e.fase}
                    aria-controls={id}
                    aria-label={`${aberta === e.fase ? 'Fechar' : 'Ver'} jogos de ${e.nome}`}
                    onClick={() => setAberta((a) => (a === e.fase ? null : e.fase))}
                  >
                    {aberta === e.fase ? 'Fechar' : 'Ver jogos'}
                  </button>
                )}
              </div>
              {aberta === e.fase && (
                <div id={id} className={styles.etapaDetalhe}>
                  {e.tabela.length > 0 && (
                    <Tabela titulo={e.jogos.find((p) => p.grupo)?.grupo ?? e.nome} linhas={e.tabela} clubeId={clubeId} legenda={false} />
                  )}
                  <ListaDeJogos jogos={e.jogos} clubeId={clubeId} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DetalhePontosCorridos({ c, clubeId }: { c: Campeonato; clubeId: number }) {
  const [completa, setCompleta] = useState(false);
  const resumo = resumoDaTabela(c.tabela, clubeId);
  return (
    <div className={styles.detalhe}>
      {completa && <TabelaCompleta c={c} clubeId={clubeId} onFechar={() => setCompleta(false)} />}
      {c.tabela.length > 0 ? (
        <Tabela
          titulo={c.rodada ? `${c.nome} · rodada ${c.rodada}` : c.nome}
          linhas={resumo}
          clubeId={clubeId}
          rodape={
            <button type="button" className={styles.verCompleta} onClick={() => setCompleta(true)}>
              Ver tabela completa
              <Icon name="arrow_forward" size={18} />
            </button>
          }
        />
      ) : (
        <section className={ui.card}>
          <p className={styles.vazio}>A tabela aparece aqui assim que a BSD publicar a classificação.</p>
        </section>
      )}
      <div className={styles.stack}>
        <section className={ui.card} aria-label="Próximos jogos">
          <h3 className={ui.titleLg}>Próximos jogos</h3>
          {c.proximos.length ? (
            <ul className={styles.proximos}>
              {c.proximos.map((p) => (
                <li key={p.id} className={styles.proximo}>
                  <span className={styles.rodada}>{p.rodada ? `R${p.rodada}` : ''}</span>
                  <span className={styles.proximoNome}>{placar(p)}</span>
                  <span className={styles.proximoData}>{diaCurto(p.inicio)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.vazio}>Nenhum jogo marcado.</p>
          )}
        </section>
        <section className={ui.cardFlush} aria-labelledby="titulo-ultimos-jogos">
          <div className={ui.cardHeader}>
            <h3 id="titulo-ultimos-jogos" className={ui.titleLg}>
              Últimos jogos
            </h3>
          </div>
          {c.resultados.length ? (
            <ListaDeResultados partidas={c.resultados} clubeId={clubeId} />
          ) : (
            <p className={styles.semResultados}>Ainda sem jogos.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function DetalheMataMata({ c, clubeId, haJogoAoVivo }: { c: Campeonato; clubeId: number; haJogoAoVivo: boolean }) {
  const atual = c.faseAtual;
  const fase = atual && !atual.tabela.length ? atual : null;
  return (
    <div className={styles.detalhe}>
      <div className={styles.stack}>
        {c.encerrado && (
          <section className={c.campeao ? styles.campeao : styles.fimDeCampanha} aria-label="Campanha">
            <Icon name={c.campeao ? 'emoji_events' : 'flag'} size={30} color={c.campeao ? 'var(--gold)' : undefined} />
            <div>
              <div className={styles.campanhaTitulo}>
                {c.destaque} {c.complemento}
              </div>
              {c.rodape && <div className={styles.campanhaTexto}>{c.rodape}</div>}
            </div>
          </section>
        )}
        {fase && (
          <section className={ui.cardDark} aria-label="Fase atual">
            <div className={styles.cupLabel}>{c.nome} · fase atual</div>
            <div className={styles.cupPhase}>{fase.nome}</div>
            <ListaDeJogos jogos={fase.jogos} clubeId={clubeId} />
            {c.proximo && c.proximo.fase === fase.fase && c.proximo.status === 'agendada' && !haJogoAoVivo && (
              <Link to={`/jogo/${c.proximo.id}/escalacao`} className={styles.palpitar}>
                {`Palpitar ${c.proximo.jogo_de_ida ? 'na volta' : fase.jogos.length > 1 ? 'na ida' : 'no jogo'}`}
                <Icon name="arrow_forward" size={18} />
              </Link>
            )}
          </section>
        )}
        {atual && atual.tabela.length > 0 && !c.encerrado && (
          <Tabela titulo={atual.jogos.find((p) => p.grupo)?.grupo ?? atual.nome} linhas={atual.tabela} clubeId={clubeId} />
        )}
      </div>
      <Caminho etapas={c.caminho} clubeId={clubeId} />
    </div>
  );
}

/** W10 · competições do clube na temporada: um card por campeonato e o detalhe do escolhido. */
export function Campeonatos() {
  const { perfil } = useAuth();
  const clubeId = perfil?.time_id ?? 0;
  const clubeNome = perfil?.clube?.nome ?? 'Seu clube';
  const ligaPrincipal = perfil?.clube?.liga_id ?? null;
  const { jogos, erro: erroJogos, tentarDeNovo: tentarJogos } = useJogosDoClube();
  const ligaIds = useMemo(() => {
    const ids = new Set<number>();
    if (ligaPrincipal) ids.add(ligaPrincipal);
    for (const p of jogos ?? []) if (p.liga_id && !ehAmistoso(p.liga_nome)) ids.add(p.liga_id);
    return [...ids].sort((a, b) => a - b);
  }, [jogos, ligaPrincipal]);
  const { dados, erro, tentarDeNovo } = useDadosDosCampeonatos(jogos ? ligaIds : []);
  const [escolhido, setEscolhido] = useState<number | null>(null);

  const campeonatos = useMemo(
    () => (jogos && dados ? montarCampeonatos(jogos, dados.competicoes, dados.tabelas, clubeId, ligaPrincipal) : null),
    [jogos, dados, clubeId, ligaPrincipal],
  );
  const haJogoAoVivo = !!jogos?.some((p) => p.status === 'ao_vivo');
  const selecionado = campeonatos?.find((c) => c.ligaId === escolhido) ?? campeonatos?.[0] ?? null;

  const subtitulo = campeonatos
    ? `${clubeNome} está em ${campeonatos.length} ${campeonatos.length === 1 ? 'competição' : 'competições'} na temporada`
    : '';

  let corpo: React.ReactNode;
  if (erro || erroJogos) {
    corpo = (
      <div className={`${ui.card} ${styles.aviso}`}>
        <p>Não deu para carregar os campeonatos agora. Verifique sua conexão.</p>
        <button type="button" className={styles.tentar} onClick={() => (erroJogos ? tentarJogos() : tentarDeNovo())}>
          Tentar de novo
        </button>
      </div>
    );
  } else if (!campeonatos) {
    // Skeleton do W10 · carregando: cards das competições, a tabela e os cards do lado.
    corpo = (
      <Carregando rotulo="Carregando os campeonatos…">
        <div className={styles.cards}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.comp}>
              <span className={styles.compTopo}>
                <Skeleton w={36} h={36} r={10} />
                <span className={styles.compNomes}>
                  <Skeleton w={140} h={12} r="pilula" />
                  <Skeleton w={100} h={8} r="pilula" />
                </span>
              </span>
              <span className={styles.compSituacao}>
                <Skeleton w={70} h={24} r={6} />
                <Skeleton w={90} h={10} r="pilula" />
              </span>
              <span className={styles.compRodape}>
                <Skeleton w="80%" h={10} r="pilula" />
              </span>
            </div>
          ))}
        </div>
        <div className={styles.detalhe}>
          <section className={ui.cardFlush}>
            <div className={ui.cardHeader}>
              <Skeleton w={220} h={16} r="pilula" />
              <Skeleton w={160} h={9} r="pilula" />
            </div>
            <ol className={styles.lista}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <li key={i} className={styles.row}>
                  <Skeleton w={20} h={12} r={4} />
                  <SkeletonEscudo width={26} height={30} />
                  <Skeleton w="40%" h={12} r="pilula" style={{ flex: 1, maxWidth: 220 }} />
                  <span style={{ flex: 1 }} />
                  <Skeleton w={90} h={10} r="pilula" />
                </li>
              ))}
            </ol>
          </section>
          <div className={styles.stack}>
            <section className={ui.card}>
              <Skeleton w={140} h={16} r="pilula" />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} w="90%" h={11} r="pilula" style={{ marginTop: 16 }} />
              ))}
            </section>
            <section className={ui.card}>
              <Skeleton w={100} h={16} r="pilula" />
              <div className={styles.form}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} w={24} h={24} r={6} />
                ))}
              </div>
            </section>
          </div>
        </div>
      </Carregando>
    );
  } else if (!campeonatos.length) {
    corpo = (
      <div className={ui.card}>
        <p className={styles.vazio}>As competições do {clubeNome} aparecem aqui assim que a temporada começar.</p>
      </div>
    );
  } else {
    corpo = (
      <>
        <div className={styles.cards} role="tablist" aria-label="Competições">
          {campeonatos.map((c) => {
            const ativo = c.ligaId === selecionado?.ligaId;
            return (
              <button
                key={c.ligaId}
                type="button"
                role="tab"
                aria-selected={ativo}
                aria-controls="detalhe-campeonato"
                className={ativo ? `${styles.comp} ${styles.compAtiva}` : styles.comp}
                onClick={() => setEscolhido(c.ligaId)}
              >
                <span className={styles.compTopo}>
                  <span className={c.campeao ? `${styles.compIcone} ${styles.compIconeOuro}` : styles.compIcone}>
                    <Icon name={c.campeao ? 'emoji_events' : ICONE_DO_FORMATO[c.formato]} size={20} />
                  </span>
                  <span className={styles.compNomes}>
                    <span className={styles.compNome}>{c.nome}</span>
                    <span className={styles.compFormato}>{c.rotuloFormato}</span>
                  </span>
                </span>
                <span className={styles.compSituacao}>
                  <span className={c.campeao ? `${styles.compDestaque} ${styles.ouro}` : styles.compDestaque}>{c.destaque}</span>
                  <span className={styles.compComplemento}>{c.complemento}</span>
                </span>
                {c.rodape && (
                  <span className={styles.compRodape}>
                    <Icon name={c.proximo ? 'calendar_month' : 'flag'} size={16} />
                    {c.rodape}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {selecionado && (
          <div id="detalhe-campeonato" role="tabpanel" aria-label={selecionado.nome}>
            {selecionado.formato === 'pontos_corridos' ? (
              <DetalhePontosCorridos c={selecionado} clubeId={clubeId} />
            ) : (
              <DetalheMataMata c={selecionado} clubeId={clubeId} haJogoAoVivo={haJogoAoVivo} />
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div className={styles.page}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Campeonatos</h2>
        {subtitulo && <span className={ui.pageSub}>{subtitulo}</span>}
      </div>
      {corpo}
    </div>
  );
}
