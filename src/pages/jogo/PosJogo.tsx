import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/ui/Icon';
import { Skeleton, TextoOculto } from '../../components/ui/Skeleton';
import {
  avaliacao,
  buscarNotas,
  enviarNotas,
  formatarNota,
  MENSAGEM_DAS_NOTAS,
  minutosParaFechar,
  mvpDe,
  notasAbertas,
  quemJogou,
  type NotaDaTorcida,
  type QuemJogou,
} from '../../data/notas';
import type { Partida } from '../../data/partidas';
import { supabase } from '../../lib/supabase';
import ui from '../../styles/ui.module.css';
import { FaixaDoJogo, Placar, useJogo } from './Jogo';
import jogo from './Jogo.module.css';
import styles from './PosJogo.module.css';
import { useMeuXp } from '../../xp/MeuXp';

/** Com a janela aberta, as médias e o relógio são relidos a cada 30 s. */
export const ATUALIZAR_NOTAS_MS = 30_000;

/** Relógio da janela: atualiza a cada 30 s enquanto as notas estão abertas. */
function useAgora(ativo: boolean) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    if (!ativo) return;
    const timer = window.setInterval(() => setAgora(new Date()), ATUALIZAR_NOTAS_MS);
    return () => window.clearInterval(timer);
  }, [ativo]);
  return agora;
}

/** Médias da torcida (com a minha nota), relidas enquanto a janela está aberta. */
function useNotas(partida: Partida | null | undefined, abertas: boolean) {
  const [notas, setNotas] = useState<NotaDaTorcida[] | null | undefined>(undefined);
  const id = partida?.id;
  const carregar = useCallback(async () => {
    if (!id) return;
    const n = await buscarNotas(id);
    setNotas((antes) => n ?? antes ?? null);
  }, [id]);
  useEffect(() => {
    if (!id || partida?.status !== 'encerrada') return;
    void carregar();
    if (!abertas) return;
    const timer = window.setInterval(carregar, ATUALIZAR_NOTAS_MS);
    return () => window.clearInterval(timer);
  }, [id, partida?.status, abertas, carregar]);
  return { notas, recarregar: carregar };
}

/** Quantas mensagens o torcedor mandou no chat do jogo (para o item de XP). */
function useMinhasMensagens(partidaId: number | undefined, usuarioId: string | undefined) {
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    if (!partidaId || !usuarioId) return;
    let vivo = true;
    supabase
      .from('mensagens_chat')
      .select('id', { count: 'exact', head: true })
      .eq('partida_id', partidaId)
      .eq('autor_id', usuarioId)
      .then(({ count }) => vivo && setTotal(count ?? 0));
    return () => {
      vivo = false;
    };
  }, [partidaId, usuarioId]);
  return total;
}

// ---------- Seu XP neste jogo ----------

function XpDoJogo({ mensagens, enviou, abertas, minutos }: { mensagens: number | null; enviou: boolean; abertas: boolean; minutos: number }) {
  const { regras } = useMeuXp();
  // Cada mensagem rende o XP da regra, até o limite por jogo; sem mensagens, mostra o máximo possível (ou o de uma, sem limite).
  const limiteDoChat = regras.limites.mensagem_chat;
  const itens = [
    {
      icone: 'forum',
      titulo: 'Presença no chat',
      sub: mensagens ? `${mensagens} ${mensagens === 1 ? 'mensagem' : 'mensagens'}` : 'nenhuma mensagem',
      xp: regras.mensagem_chat * (mensagens ? Math.min(mensagens, limiteDoChat ?? mensagens) : (limiteDoChat ?? 1)),
      ok: !!mensagens,
    },
    {
      icone: 'star_rate',
      titulo: 'Notas dos jogadores',
      sub: enviou ? 'enviadas' : abertas ? `pendente · fecha em ${minutos} min` : 'não enviadas',
      xp: regras.notas,
      ok: enviou,
    },
  ];
  const total = itens.filter((i) => i.ok).reduce((soma, i) => soma + i.xp, 0);
  return (
    <section className={styles.xp} aria-labelledby="titulo-xp">
      <div className={styles.xpHead}>
        <h3 id="titulo-xp" className={ui.titleLg}>
          Seu XP neste jogo
        </h3>
        <span className={styles.xpSub}>Itens pendentes entram quando a janela fecha</span>
        <span className={styles.xpTotal}>+{total} XP</span>
      </div>
      <ul className={styles.xpItens}>
        {itens.map((i) => (
          <li key={i.titulo} className={i.ok ? `${styles.xpItem} ${styles.xpOk}` : styles.xpItem}>
            <Icon name={i.icone} size={20} />
            <div className={styles.xpTexto}>
              <strong>{i.titulo}</strong>
              <span>{i.sub}</span>
            </div>
            <span className={styles.xpValor}>+{i.xp}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- MVP ----------

function Mvp({ abertas, minutos, notas, jogadores }: { abertas: boolean; minutos: number; notas: NotaDaTorcida[] | null | undefined; jogadores: QuemJogou[] }) {
  if (abertas) {
    return (
      <section className={styles.mvpAberto} aria-label="MVP da partida">
        <div className={styles.mvpTopo}>
          <Icon name="military_tech" size={20} color="var(--gold)" />
          <span className={styles.mvpRotulo}>MVP da partida</span>
          <span className={styles.relogio}>
            <Icon name="timer" size={13} />
            sai em {minutos} min
          </span>
        </div>
        <div className={styles.mvpEspera}>
          <span className={styles.ampulheta}>
            <Icon name="hourglass_top" size={26} color="var(--gold)" />
          </span>
          <p>Sai quando as notas fecharem. Vence a maior média da torcida.</p>
        </div>
      </section>
    );
  }
  const mvp = notas ? mvpDe(notas) : null;
  const jogador = mvp ? jogadores.find((j) => j.id === mvp.jogador_id) : undefined;
  return (
    <section className={mvp ? styles.mvp : `${styles.mvp} ${styles.mvpVazio}`} aria-label="MVP da partida">
      <span className={styles.medalha}>
        <Icon name="military_tech" size={30} color="var(--gold)" />
      </span>
      <div>
        <div className={styles.mvpRotulo}>MVP da partida</div>
        {mvp ? (
          <>
            <div className={styles.mvpNome}>
              {jogador?.numero != null ? `${jogador.numero} · ` : ''}
              {jogador?.nome ?? 'Jogador'}
            </div>
            <div className={styles.mvpMeta}>
              nota média {formatarNota(mvp.media)} · {mvp.minha ? `sua nota ${mvp.minha}` : 'você não deu nota'}
            </div>
          </>
        ) : (
          <div className={styles.mvpMeta}>Ninguém deu nota neste jogo.</div>
        )}
      </div>
    </section>
  );
}

// ---------- Suas notas ----------

function SuasNotas({
  partida,
  jogadores,
  notas,
  abertas,
  minutos,
  aoEnviar,
}: {
  partida: Partida;
  jogadores: QuemJogou[];
  notas: NotaDaTorcida[] | null | undefined;
  abertas: boolean;
  minutos: number;
  aoEnviar: () => Promise<void>;
}) {
  const { regras } = useMeuXp();
  const salvas = useMemo(() => new Map((notas ?? []).filter((n) => n.minha).map((n) => [n.jogador_id, n.minha!])), [notas]);
  const [rascunho, setRascunho] = useState<Map<number, number>>(new Map());
  const [aberto, setAberto] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const nota = (id: number) => rascunho.get(id) ?? salvas.get(id) ?? 0;
  const pendentes = [...rascunho].filter(([id, n]) => salvas.get(id) !== n);
  // Abre no primeiro jogador ainda sem nota.
  const expandido = aberto ?? jogadores.find((j) => !nota(j.id))?.id ?? null;

  function escolher(id: number, n: number) {
    // Continua aberto para ajustar a nota; o próximo abre quando a pessoa tocar nele.
    setAberto(id);
    setRascunho((r) => new Map(r).set(id, n));
    setEnviado(false);
    setErro(null);
  }

  async function enviar() {
    if (!pendentes.length) return;
    setEnviando(true);
    setErro(null);
    const r = await enviarNotas(
      partida.id,
      pendentes.map(([jogador, n]) => ({ jogador, nota: n })),
    );
    setEnviando(false);
    if (!r.ok) {
      setErro(MENSAGEM_DAS_NOTAS[r.erro]);
      return;
    }
    await aoEnviar();
    setRascunho(new Map());
    setEnviado(true);
    setAberto(null);
  }

  return (
    <section className={styles.card} aria-labelledby="titulo-suas-notas">
      <div className={styles.cardHead}>
        <h3 id="titulo-suas-notas" className={ui.titleLg}>
          Suas notas
        </h3>
        {abertas ? (
          <span className={styles.relogioGrande}>
            <Icon name="timer" size={15} />
            fecha em {minutos} min
          </span>
        ) : (
          <span className={styles.fechada}>
            <Icon name="lock" size={15} />
            fechada
          </span>
        )}
      </div>
      <p className={styles.dica}>Notas de 1 a 10. A janela fecha 1 h após o apito final.</p>

      {jogadores.length === 0 ? (
        <p className={styles.vazio}>A escalação deste jogo não chegou; sem ela não dá para dar notas.</p>
      ) : (
        <ul className={styles.jogadores}>
          {jogadores.map((j) => {
            const n = nota(j.id);
            const a = avaliacao(n);
            const meta = [j.posicao, `${j.minutos} min`].filter(Boolean).join(' · ');
            if (abertas && expandido === j.id) {
              return (
                <li key={j.id} className={styles.jogadorAberto}>
                  <div className={styles.jogador}>
                    <span className={styles.camisa}>{j.numero ?? ''}</span>
                    <div className={styles.jogadorInfo}>
                      <strong>{j.nome}</strong>
                      <span>
                        {meta} · {a.texto}
                      </span>
                    </div>
                    <span className={styles.nota} style={{ color: a.cor }}>
                      {n ? `${n},0` : '—'}
                    </span>
                  </div>
                  <div className={styles.escala} role="radiogroup" aria-label={`Nota de ${j.nome}`}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={v === n}
                        className={v <= n ? `${styles.ponto} ${styles.pontoCheio}` : styles.ponto}
                        style={v <= n ? { background: a.preenchido } : undefined}
                        onClick={() => escolher(j.id, v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </li>
              );
            }
            const conteudo = (
              <>
                <span className={styles.camisa}>{j.numero ?? ''}</span>
                <div className={styles.jogadorInfo}>
                  <strong>{j.nome}</strong>
                  <span>
                    {meta} · {n ? 'avaliado' : 'sem nota'}
                  </span>
                </div>
                <span className={styles.nota} style={{ color: a.cor }}>
                  {n ? `${n},0` : '—'}
                </span>
              </>
            );
            return (
              <li key={j.id}>
                {abertas ? (
                  <button type="button" className={styles.jogador} onClick={() => setAberto(j.id)} aria-label={`Dar nota para ${j.nome}`}>
                    {conteudo}
                  </button>
                ) : (
                  <div className={styles.jogador}>{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {erro && (
        <p className={styles.erro} role="alert">
          {erro}
        </p>
      )}
      {abertas && jogadores.length > 0 && (
        <button type="button" className={styles.enviar} disabled={!pendentes.length || enviando} onClick={enviar}>
          {enviando ? 'Enviando…' : enviado && !pendentes.length ? 'Avaliações enviadas' : `Enviar avaliações · +${regras.notas} XP`}
        </button>
      )}
    </section>
  );
}

// ---------- Média da torcida ----------

/** "Notas da partida": a sua, a nota TO (calculada com os números do jogador) e a média da torcida. */
function NotasDaPartida({
  jogadores,
  notas,
  notasTo,
  abertas,
}: {
  jogadores: QuemJogou[];
  notas: NotaDaTorcida[] | null | undefined;
  notasTo: Record<string, number>;
  abertas: boolean;
}) {
  const porJogador = new Map((notas ?? []).map((n) => [n.jogador_id, n]));
  const votantes = notas?.[0]?.votantes ?? 0;
  const mvp = !abertas && notas ? mvpDe(notas) : null;
  const linhas = [...jogadores].sort((a, b) => (porJogador.get(b.id)?.media ?? -1) - (porJogador.get(a.id)?.media ?? -1));
  return (
    <section className={styles.card} aria-labelledby="titulo-media">
      <div className={styles.cardHead}>
        <h3 id="titulo-media" className={ui.titleLg}>
          Notas da partida
        </h3>
        <span className={styles.votaram}>
          {votantes.toLocaleString('pt-BR')} {votantes === 1 ? 'votou' : 'votaram'}
        </span>
      </div>
      <p className={styles.explicaTo}>Nota TO é calculada pela Torcida Online com os números de cada jogador em campo.</p>
      {notas === undefined ? (
        <Skeleton h={220} r={10} />
      ) : (
        <ul className={styles.medias}>
          {linhas.map((j) => {
            const n = porJogador.get(j.id);
            const a = avaliacao(n ? Math.round(n.media) : null);
            return (
              <li key={j.id} className={styles.media}>
                <span className={styles.numero} style={{ background: a.fundo, color: a.cor }}>
                  {j.numero ?? ''}
                </span>
                <div className={styles.mediaInfo}>
                  {/* O ícone fica fora do <strong>: a fonte de ícones não tem negrito. */}
                  <div className={styles.mediaNome}>
                    <strong>{j.nome}</strong>
                    {mvp?.jogador_id === j.id && (
                      <>
                        <Icon name="military_tech" size={15} color="var(--gold)" />
                        <span className={styles.oculto}> (MVP)</span>
                      </>
                    )}
                  </div>
                  <span>{j.posicao ?? ''}</span>
                </div>
                <div className={n?.minha ? `${styles.sua} ${styles.suaDada}` : styles.sua}>
                  <span>SUA</span>
                  <strong>{n?.minha ?? '—'}</strong>
                </div>
                <div className={styles.to}>
                  <span>TO</span>
                  <strong>{notasTo[String(j.id)] !== undefined ? formatarNota(notasTo[String(j.id)]) : '—'}</strong>
                </div>
                <div className={styles.daTorcida}>
                  <strong style={{ color: a.cor }}>{n ? formatarNota(n.media) : '—'}</strong>
                  <span>TORCIDA</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** W04 · Jogo · pós-jogo e notas. */
export function PosJogo() {
  const { id: param } = useParams();
  const id = Number(param);
  const { perfil } = useAuth();
  const { partida, erro, detalhes, tentarDeNovo } = useJogo(id);
  const encerrada = partida?.status === 'encerrada';
  const agora = useAgora(!!partida && notasAbertas(partida));
  const abertas = !!partida && notasAbertas(partida, agora);
  const { notas, recarregar } = useNotas(partida, abertas);
  const mensagens = useMinhasMensagens(encerrada ? partida?.id : undefined, perfil?.id);

  const clubeId = perfil?.time_id ?? null;
  const mandante = partida ? (clubeId === partida.mandante_id ? true : clubeId === partida.visitante_id ? false : null) : null;
  const escalacao = detalhes?.escalacoes && mandante !== null ? detalhes.escalacoes[mandante ? 'mandante' : 'visitante'] : null;
  const jogadores = escalacao ? quemJogou(escalacao, detalhes!.lances, mandante!) : [];
  const minutos = partida ? minutosParaFechar(partida, agora) : 0;

  if (!Number.isInteger(id) || id <= 0 || partida === null || erro) {
    return (
      <div className={styles.page}>
        <FaixaDoJogo partida={null} atual="pos" />
        <div className={jogo.aviso}>
          <Icon name={erro ? 'cloud_off' : 'sports_soccer'} size={28} color="var(--muted)" />
          <p>{erro ? 'Não deu para carregar o jogo. Verifique sua conexão.' : 'Não achamos esse jogo.'}</p>
          {erro ? (
            <button type="button" className={ui.btnBlue} onClick={tentarDeNovo}>
              Tentar de novo
            </button>
          ) : (
            <Link to="/jogos" className={ui.btnBlue}>
              Ver os jogos
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (!partida) {
    return (
      <div className={styles.page} aria-busy="true">
        <TextoOculto>Carregando o jogo…</TextoOculto>
        <FaixaDoJogo partida={null} atual="pos" />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <FaixaDoJogo partida={partida} atual="pos" />
      <Placar partida={partida} clubeId={clubeId} />
      <div className={styles.corpo}>
        {!encerrada ? (
          <div className={jogo.aviso}>
            <Icon name="lock_clock" size={28} color="var(--muted)" />
            <p>As notas abrem no apito final.</p>
            <Link to={`/jogo/${partida.id}`} className={ui.btnBlue}>
              Ver o jogo
            </Link>
          </div>
        ) : mandante === null ? (
          <div className={jogo.aviso}>
            <Icon name="star_rate" size={28} color="var(--muted)" />
            <p>As notas são da torcida dos times em campo.</p>
          </div>
        ) : (
          <>
            <div className={styles.topo}>
              <XpDoJogo mensagens={mensagens} enviou={(notas ?? []).some((n) => n.minha)} abertas={abertas} minutos={minutos} />
              <Mvp abertas={abertas} minutos={minutos} notas={notas} jogadores={jogadores} />
            </div>
            <div className={styles.grid}>
              {detalhes === undefined ? (
                <Skeleton h={320} r={16} />
              ) : (
                <SuasNotas partida={partida} jogadores={jogadores} notas={notas} abertas={abertas} minutos={minutos} aoEnviar={recarregar} />
              )}
              <NotasDaPartida jogadores={jogadores} notas={notas} notasTo={detalhes?.notas ?? {}} abertas={abertas} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
