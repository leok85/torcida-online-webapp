import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/ui/Icon';
import { Carregando, Skeleton } from '../components/ui/Skeleton';
import { Striped } from '../components/ui/Striped';
import { usadoHa } from '../data/conta';
import {
  apagarComentario,
  buscarComentarios,
  buscarNoticia,
  buscarNoticias,
  comentarNoticia,
  COMENTARIOS_POR_PAGINA,
  contarCliqueNoOriginal,
  curtirComentario,
  curtirNoticia,
  iniciais,
  lerNoticia,
  MENSAGEM_DA_NOTICIA,
  nomeDoAutor,
  NOTICIAS_POR_PAGINA,
  TEXTO_MAXIMO,
  type ComentarioDaNoticia,
  type ErroDaNoticia,
  type Noticia,
  type OrdemDosComentarios,
  type ResumoDaNoticia,
} from '../data/noticias';
import { motivoParaNaoPublicar, useMinhasRestricoes } from '../data/restricoes';
import ui from '../styles/ui.module.css';
import { useMeuXp } from '../xp/MeuXp';
import styles from './Noticias.module.css';

const NUMERO = new Intl.NumberFormat('pt-BR');
const ORDENS: { valor: OrdemDosComentarios; rotulo: string }[] = [
  { valor: 'relevantes', rotulo: 'Relevantes' },
  { valor: 'recentes', rotulo: 'Recentes' },
];
const contagem = (n: number, um: string, varios: string) => `${NUMERO.format(n)} ${n === 1 ? um : varios}`;
const restrito = (erro: ErroDaNoticia) => erro === 'silenciado' || erro === 'suspenso';

/** Lista das notícias, paginada pela data de publicação ("Carregar mais"). */
function useListaDeNoticias() {
  const [estado, setEstado] = useState<{ itens?: ResumoDaNoticia[]; fim?: boolean; erro?: boolean } | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [mais, setMais] = useState<'carregando' | 'erro' | null>(null);

  useEffect(() => {
    let vivo = true;
    buscarNoticias().then(
      (itens) => vivo && setEstado({ itens, fim: itens.length < NOTICIAS_POR_PAGINA }),
      () => vivo && setEstado({ erro: true }),
    );
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  async function carregarMais() {
    const ultima = estado?.itens?.at(-1);
    if (!ultima || mais === 'carregando') return;
    setMais('carregando');
    try {
      const novas = await buscarNoticias(ultima);
      setEstado((e) => (e?.itens ? { ...e, itens: [...e.itens, ...novas.filter((n) => !e.itens!.some((x) => x.id === n.id))], fim: novas.length < NOTICIAS_POR_PAGINA } : e));
      setMais(null);
    } catch {
      setMais('erro');
    }
  }

  return {
    itens: estado?.itens,
    fim: !!estado?.fim,
    erro: !!estado?.erro,
    mais,
    carregarMais,
    tentarDeNovo: () => setTentativa((t) => t + 1),
    /** Contadores mudados na notícia aberta (curtida, comentário) também valem na lista. */
    atualizar: (id: string, campos: (n: ResumoDaNoticia) => Partial<ResumoDaNoticia>) =>
      setEstado((e) => (e?.itens ? { ...e, itens: e.itens.map((n) => (n.id === id ? { ...n, ...campos(n) } : n)) } : e)),
  };
}

type Contadores = Pick<Noticia, 'curti' | 'curtidas' | 'comentarios'>;

/** A notícia aberta: undefined carregando, null quando não existe ou não é para mim. */
function useNoticia(id: string | null) {
  const [estado, setEstado] = useState<{ id: string; noticia?: Noticia | null; erro?: boolean } | null>(null);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    buscarNoticia(id).then(
      (noticia) => vivo && setEstado({ id, noticia }),
      () => vivo && setEstado({ id, erro: true }),
    );
    return () => {
      vivo = false;
    };
  }, [id, tentativa]);
  const atual = id && estado?.id === id ? estado : null;
  return {
    noticia: atual?.noticia,
    erro: !!atual?.erro,
    tentarDeNovo: () => setTentativa((t) => t + 1),
    /** Só mexe se a aberta ainda for `id`: a resposta de uma notícia não pode cair em outra. */
    atualizar: (alvo: string, campos: (n: Contadores) => Partial<Contadores>) =>
      setEstado((e) => (e?.id === alvo && e.noticia ? { ...e, noticia: { ...e.noticia, ...campos(e.noticia) } } : e)),
  };
}

/** Imagem do feed (site externo): sem imagem, ou se ela não carregar, fica o listrado. */
function ImagemDoFeed({ src, className, reserva }: { src: string | null; className: string; reserva: ReactNode }) {
  const [falhou, setFalhou] = useState<string | null>(null);
  if (!src || falhou === src) return <>{reserva}</>;
  // Decorativa: o título já está no texto ao lado.
  return <img className={className} src={src} alt="" referrerPolicy="no-referrer" onError={() => setFalhou(src)} />;
}

/** W09 · notícias do clube: a aberta em destaque (com o site original, curtida, XP de leitura e comentários) e a lista ao lado. */
export function Noticias() {
  const { id = null } = useParams();
  const { perfil } = useAuth();
  const { xp, regras, recarregar: recarregarXp } = useMeuXp();
  const lista = useListaDeNoticias();
  const destaqueId = id ?? lista.itens?.[0]?.id ?? null;
  const aberta = useNoticia(destaqueId);
  const noticia = aberta.noticia;
  // Silenciado ou suspenso lê e (silenciado) curte, mas não comenta: o campo dá lugar ao aviso.
  const { restricoes, recarregar: reler } = useMinhasRestricoes(!!perfil);
  const bloqueio = motivoParaNaoPublicar(restricoes);
  const [aviso, setAviso] = useState<string | null>(null);
  // Qual notícia está aberta agora, para respostas atrasadas não mexerem na tela de outra.
  const abertaAgora = useRef(destaqueId);
  useEffect(() => {
    abertaAgora.current = destaqueId;
    setAviso(null);
  }, [destaqueId]);

  // Leitura (XP): só quando a pessoa abre a notícia (id na rota) ou vai ao site original. Entrar em /noticias não lê.
  // Uma chamada por notícia (o ref segura re-render e StrictMode); se falhar, sai do ref para tentar ao reabrir.
  const lidas = useRef(new Set<string>());
  const [ganho, setGanho] = useState<{ id: string; xp: number } | null>(null);
  function ler(n: Noticia) {
    if (n.li || lidas.current.has(n.id)) return;
    lidas.current.add(n.id);
    void lerNoticia(n.id).then((creditado) => {
      if (creditado === null) return void lidas.current.delete(n.id);
      setGanho({ id: n.id, xp: creditado });
      if (creditado > 0) recarregarXp();
    });
  }
  useEffect(() => {
    if (id && noticia) ler(noticia);
    // ler e recarregarXp mudam a cada render; a leitura só depende da notícia aberta pela rota.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, noticia?.id]);

  function mudarContadores(alvo: string, campos: (n: Contadores) => Partial<Contadores>) {
    aberta.atualizar(alvo, campos);
    lista.atualizar(alvo, campos);
  }

  // Curtida em andamento por notícia: o segundo clique antes da resposta é ignorado.
  const curtindo = useRef(new Set<string>());
  async function curtir() {
    if (!noticia || curtindo.current.has(noticia.id)) return;
    const alvo = noticia.id;
    curtindo.current.add(alvo);
    setAviso(null);
    try {
      const r = await curtirNoticia(alvo);
      if (!r.ok) {
        if (restrito(r.erro)) reler();
        if (abertaAgora.current === alvo) setAviso(MENSAGEM_DA_NOTICIA[r.erro]);
        return;
      }
      mudarContadores(alvo, () => ({ curti: r.curti, curtidas: r.curtidas }));
    } finally {
      curtindo.current.delete(alvo);
    }
  }

  function irAoOriginal(n: Noticia) {
    contarCliqueNoOriginal(n.id);
    ler(n);
  }

  const cabecalho = (
    <div className={ui.pageHead}>
      <h2 className={ui.pageTitle}>Notícias do clube</h2>
    </div>
  );

  // Sem notícia escolhida, o destaque é a mais recente: a página depende da lista.
  if (!id && lista.erro) {
    return (
      <div className={styles.page}>
        {cabecalho}
        <ErroDeCarga texto="Não deu para carregar as notícias. Verifique sua conexão." onTentar={lista.tentarDeNovo} />
      </div>
    );
  }
  if (!id && lista.itens?.length === 0) {
    return (
      <div className={styles.page}>
        {cabecalho}
        <div className={`${ui.card} ${styles.aviso}`}>
          <Icon name="newspaper" size={28} color="var(--muted)" />
          <p>Ainda não há notícias do seu clube.</p>
        </div>
      </div>
    );
  }

  const outras = (lista.itens ?? []).filter((n) => n.id !== destaqueId);
  const xpDaLeitura = noticia && ganho?.id === noticia.id ? ganho.xp : null;

  let destaque: ReactNode;
  if (aberta.erro) {
    destaque = <ErroDeCarga texto="Não deu para carregar a notícia. Verifique sua conexão." onTentar={aberta.tentarDeNovo} />;
  } else if (noticia === null) {
    destaque = (
      <div className={`${ui.card} ${styles.aviso}`}>
        <Icon name="newspaper" size={28} color="var(--muted)" />
        <p>Notícia não encontrada. Ela pode ter saído do ar ou ser de outra torcida.</p>
        <Link to="/noticias" className={ui.btnBlue}>
          Ver as notícias
        </Link>
      </div>
    );
  } else if (!noticia) {
    destaque = (
      <Carregando rotulo="Carregando a notícia…" className={ui.cardFlush}>
        <Skeleton h={320} r={0} />
        <div className={styles.article}>
          <Skeleton w={160} h={14} />
          <Skeleton h={30} style={{ marginTop: 12 }} />
          <Skeleton w="70%" h={14} style={{ marginTop: 14 }} />
          <Skeleton w="90%" h={14} style={{ marginTop: 8 }} />
        </div>
      </Carregando>
    );
  } else {
    destaque = (
      <article className={ui.cardFlush} aria-labelledby="titulo-da-noticia">
        <ImagemDoFeed key={noticia.id} src={noticia.imagem_url} className={styles.capa} reserva={<Striped height={320} stripe={10} />} />
        <div className={styles.article}>
          <div className={styles.tagRow}>
            <span className={styles.fonte}>{noticia.fonte}</span>
            <span className={styles.ago}>· {usadoHa(noticia.publicada_em)}</span>
          </div>
          <h3 id="titulo-da-noticia" className={styles.headline}>
            {noticia.titulo}
          </h3>
          {noticia.resumo && <p className={styles.lead}>{noticia.resumo}</p>}
          {/* O link já vai no <a> (nada de pop-up bloqueado); o clique (também o do meio) só é contado, sem esperar. */}
          <a
            className={styles.original}
            href={noticia.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => irAoOriginal(noticia)}
            onAuxClick={(e) => e.button === 1 && irAoOriginal(noticia)}
          >
            Ler no site
            <Icon name="open_in_new" size={17} />
          </a>
          <div className={styles.engage}>
            <div className={styles.metric} role="img" aria-label={contagem(noticia.comentarios, 'comentário', 'comentários')}>
              <Icon name="forum" size={18} />
              {NUMERO.format(noticia.comentarios)}
            </div>
            <button
              type="button"
              aria-pressed={noticia.curti}
              aria-label={`Curtir a notícia (${contagem(noticia.curtidas, 'curtida', 'curtidas')})`}
              className={noticia.curti ? `${styles.like} ${styles.on}` : styles.like}
              onClick={() => void curtir()}
            >
              <Icon name="favorite" size={18} filled={noticia.curti} />
              {NUMERO.format(noticia.curtidas)}
            </button>
            <div className={ui.spacer} />
            {xpDaLeitura ? (
              <div className={styles.readXp} role="status">
                <Icon name="bolt" size={16} />+{xpDaLeitura} XP pela leitura
              </div>
            ) : noticia.li || xpDaLeitura === 0 ? (
              <div className={styles.lida}>
                <Icon name="done_all" size={16} />
                Lida
              </div>
            ) : (
              <div className={styles.readXp}>
                <Icon name="bolt" size={16} />+{regras.leitura_noticia} XP por ler
              </div>
            )}
          </div>
          {aviso && (
            <p className={styles.erro} role="alert">
              {aviso}
            </p>
          )}

          <Comentarios
            key={noticia.id}
            noticiaId={noticia.id}
            total={noticia.comentarios}
            eu={{ id: perfil?.id ?? '', apelido: nomeDoAutor(perfil?.apelido), nivel: xp?.nivel ?? 1 }}
            bloqueio={bloqueio}
            reler={reler}
            onTotal={(delta) => mudarContadores(noticia.id, (n) => ({ comentarios: Math.max(n.comentarios + delta, 0) }))}
          />
        </div>
      </article>
    );
  }

  return (
    <div className={styles.page}>
      {cabecalho}
      <div className={styles.grid}>
        {destaque}

        <div className={styles.lateral}>
          {lista.erro ? (
            <ErroDeCarga texto="Não deu para carregar as outras notícias." onTentar={lista.tentarDeNovo} />
          ) : !lista.itens ? (
            <Carregando rotulo="Carregando as notícias…" className={styles.lista}>
              {[0, 1, 2].map((i) => (
                <div key={i} className={styles.item}>
                  <Skeleton w={104} h={80} r={10} />
                  <div className={styles.itemTexto}>
                    <Skeleton h={14} />
                    <Skeleton w={140} h={10} style={{ marginTop: 8 }} />
                  </div>
                </div>
              ))}
            </Carregando>
          ) : (
            <>
              {outras.length > 0 && (
                <ul className={styles.lista} aria-label="Mais notícias">
                  {outras.map((n) => (
                    <li key={n.id}>
                      <Link to={`/noticias/${n.id}`} className={styles.item}>
                        <ImagemDoFeed src={n.imagem_url} className={styles.thumb} reserva={<Striped width={104} height={80} stripe={7} radius={10} />} />
                        <div className={styles.itemTexto}>
                          <div className={styles.itemTitle}>{n.titulo}</div>
                          <div className={styles.itemWhen}>
                            {n.fonte} · {usadoHa(n.publicada_em)} · {contagem(n.comentarios, 'comentário', 'comentários')}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {!lista.fim && (
                <button type="button" className={styles.more} onClick={() => void lista.carregarMais()} disabled={lista.mais === 'carregando'}>
                  {lista.mais === 'carregando' ? 'Carregando…' : 'Carregar mais notícias'}
                </button>
              )}
              {lista.mais === 'erro' && (
                <p className={styles.erro} role="alert">
                  Não deu para carregar mais notícias. Tente de novo.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ErroDeCarga({ texto, onTentar }: { texto: string; onTentar: () => void }) {
  return (
    <div className={`${ui.card} ${styles.aviso}`}>
      <Icon name="cloud_off" size={28} color="var(--muted)" />
      <p>{texto}</p>
      <button type="button" className={ui.btnBlue} onClick={onTentar}>
        Tentar de novo
      </button>
    </div>
  );
}

const trecho = (texto: string) => (texto.length > 40 ? `${texto.slice(0, 40)}…` : texto);

/** Comentários da notícia aberta: ordenação, campo (ou o aviso de silêncio/suspensão) e a conversa. */
function Comentarios({
  noticiaId,
  total,
  eu,
  bloqueio,
  reler,
  onTotal,
}: {
  noticiaId: string;
  total: number;
  /** Quem comenta: para mostrar o comentário novo mesmo se a releitura não o trouxer. */
  eu: { id: string; apelido: string; nivel: number };
  bloqueio: string | null;
  reler: () => void;
  onTotal: (delta: number) => void;
}) {
  const [ordem, setOrdem] = useState<OrdemDosComentarios>('relevantes');
  const [limite, setLimite] = useState(COMENTARIOS_POR_PAGINA);
  const [versao, setVersao] = useState(0);
  // `cheia`: a última busca voltou com tudo o que pediu, então pode haver mais.
  const [estado, setEstado] = useState<{ lista?: ComentarioDaNoticia[]; cheia?: boolean; erro?: boolean } | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Curtida e apagar em andamento por comentário: o segundo clique antes da resposta é ignorado.
  const emAndamento = useRef(new Set<string>());

  useEffect(() => {
    let vivo = true;
    buscarComentarios(noticiaId, ordem, limite).then(
      (lista) => vivo && setEstado({ lista, cheia: lista.length === limite }),
      () => vivo && setEstado({ erro: true }),
    );
    return () => {
      vivo = false;
    };
  }, [noticiaId, ordem, limite, versao]);

  const lista = estado?.lista;
  const mudar = (id: number, campos: Partial<ComentarioDaNoticia>) =>
    setEstado((e) => (e?.lista ? { ...e, lista: e.lista.map((c) => (c.id === id ? { ...c, ...campos } : c)) } : e));

  function recusado(e: ErroDaNoticia) {
    if (restrito(e)) reler();
    setErro(MENSAGEM_DA_NOTICIA[e]);
  }

  async function uma(chave: string, acao: () => Promise<void>) {
    if (emAndamento.current.has(chave)) return;
    emAndamento.current.add(chave);
    try {
      await acao();
    } finally {
      emAndamento.current.delete(chave);
    }
  }

  async function publicar(e: FormEvent) {
    e.preventDefault();
    const texto = rascunho.trim();
    if (!texto || enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await comentarNoticia(noticiaId, texto);
    if (!r.ok) {
      setEnviando(false);
      return recusado(r.erro); // silenciado/suspenso: o campo dá lugar ao aviso, e a mensagem explica o porquê
    }
    setRascunho('');
    onTotal(1);
    const meu: ComentarioDaNoticia = {
      id: r.id,
      autor_id: eu.id,
      apelido: eu.apelido,
      nivel: eu.nivel,
      texto,
      curtidas: 0,
      curti: false,
      meu: true,
      oculto: false,
      criado_em: new Date().toISOString(),
    };
    // Em "Relevantes" com a lista cheia, o novo (sem curtidas) pode não vir: entra no topo.
    try {
      const nova = await buscarComentarios(noticiaId, ordem, limite);
      setEstado({ lista: nova.some((c) => c.id === r.id) ? nova : [meu, ...nova], cheia: nova.length === limite });
    } catch {
      setEstado((atual) => ({ ...atual, lista: [meu, ...(atual?.lista ?? [])] }));
    }
    setEnviando(false);
  }

  const curtir = (c: ComentarioDaNoticia) =>
    uma(`curtir:${c.id}`, async () => {
      setErro(null);
      const r = await curtirComentario(c.id);
      if (!r.ok) return recusado(r.erro);
      mudar(c.id, { curti: r.curti, curtidas: r.curtidas });
    });

  const apagar = (c: ComentarioDaNoticia) =>
    uma(`apagar:${c.id}`, async () => {
      setErro(null);
      const r = await apagarComentario(c.id);
      if (!r.ok) return recusado(r.erro);
      setEstado((e) => (e?.lista ? { ...e, lista: e.lista.filter((x) => x.id !== c.id) } : e));
      if (!c.oculto) onTotal(-1);
    });

  return (
    <section className={styles.comments} aria-labelledby="titulo-comentarios">
      <div className={styles.commentsHead}>
        <h4 id="titulo-comentarios" className={ui.titleLg}>
          {contagem(total, 'comentário', 'comentários')}
        </h4>
        <div className={ui.spacer} />
        <div className={styles.sort} role="group" aria-label="Ordenar comentários">
          {ORDENS.map((o) => (
            <button
              key={o.valor}
              type="button"
              aria-pressed={o.valor === ordem}
              className={o.valor === ordem ? `${styles.filter} ${styles.active}` : styles.filter}
              onClick={() => setOrdem(o.valor)}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      </div>

      {bloqueio ? (
        <div className={styles.bloqueio} role="status">
          <Icon name="block" size={20} color="var(--muted)" />
          <span>{bloqueio}</span>
        </div>
      ) : (
        <form className={styles.compose} onSubmit={publicar}>
          <div className={styles.initials} aria-hidden="true">
            {iniciais(eu.apelido)}
          </div>
          <input
            className={styles.commentInput}
            value={rascunho}
            onChange={(e) => {
              setRascunho(e.target.value.slice(0, TEXTO_MAXIMO));
              setErro(null);
            }}
            placeholder="Escreva um comentário…"
            aria-label="Escreva um comentário"
          />
          <button type="submit" className={styles.publish} disabled={!rascunho.trim() || enviando}>
            Publicar
          </button>
        </form>
      )}
      {erro && (
        <p className={styles.erro} role="alert">
          {erro}
        </p>
      )}

      {estado?.erro ? (
        <div className={styles.semComentarios}>
          Não deu para carregar os comentários.{' '}
          <button type="button" className={styles.link} onClick={() => setVersao((v) => v + 1)}>
            Tentar de novo
          </button>
        </div>
      ) : !lista ? (
        <Carregando rotulo="Carregando os comentários…" className={styles.thread}>
          <Skeleton h={44} />
          <Skeleton h={44} />
        </Carregando>
      ) : lista.length === 0 ? (
        <p className={styles.semComentarios}>Ninguém comentou ainda. Abra a conversa!</p>
      ) : (
        <ul className={styles.thread} aria-label="Comentários">
          {lista.map((c) => {
            const nome = nomeDoAutor(c.apelido);
            return c.oculto ? (
              // Oculto pela moderação: só o autor recebe, para saber o que houve e poder apagar.
              <li key={c.id} className={styles.removed}>
                <Icon name="visibility_off" size={19} color="var(--muted-2)" />
                <div className={styles.removedText}>
                  Comentário removido pela moderação
                  <div>“{c.texto}” · só você vê este aviso.</div>
                </div>
                <button type="button" className={styles.link} aria-label={`Apagar meu comentário: ${trecho(c.texto)}`} onClick={() => void apagar(c)}>
                  Apagar
                </button>
              </li>
            ) : (
              <li key={c.id} className={styles.comment}>
                <div className={styles.initials} aria-hidden="true">
                  {iniciais(nome)}
                </div>
                <div className={styles.commentBody}>
                  <div className={styles.commentHead}>
                    {nome}
                    <span className={styles.lvl}>NV {c.nivel}</span>
                    <span className={styles.commentAgo}>{usadoHa(c.criado_em)}</span>
                  </div>
                  <p className={styles.commentText}>{c.texto}</p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      aria-pressed={c.curti}
                      aria-label={`Curtir o comentário de ${nome} (${contagem(c.curtidas, 'curtida', 'curtidas')})`}
                      className={c.curti ? `${styles.action} ${styles.on}` : styles.action}
                      onClick={() => void curtir(c)}
                    >
                      <Icon name="thumb_up" size={18} />
                      {NUMERO.format(c.curtidas)}
                    </button>
                    {c.meu && (
                      <button type="button" className={styles.apagar} aria-label={`Apagar meu comentário: ${trecho(c.texto)}`} onClick={() => void apagar(c)}>
                        <Icon name="delete" size={17} />
                        Apagar
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {estado?.cheia && (
        <button type="button" className={styles.more} onClick={() => setLimite((l) => l + COMENTARIOS_POR_PAGINA)}>
          Carregar mais comentários
        </button>
      )}
    </section>
  );
}
