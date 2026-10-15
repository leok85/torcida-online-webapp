import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';
import { Skeleton, TextoOculto } from '../../components/ui/Skeleton';
import {
  ATUALIZAR_GALERIA_MS,
  ETIQUETAS,
  FOTOS_POR_JOGO,
  LEGENDA_MAX,
  MENSAGEM_DA_FOTO,
  MOMENTO_DO_JOGO,
  buscarFotos,
  curtirFoto,
  denunciarFoto,
  enviarFotoDaTorcida,
  janelaDaFoto,
  joinhasAbertos,
  problemaDoArquivo,
  reduzirFoto,
  type ErroDaFoto,
  type Etiqueta,
  type FotoDaTorcida,
} from '../../data/fotos';
import type { Partida } from '../../data/partidas';
import ui from '../../styles/ui.module.css';
import { FaixaDoJogo, useJogo } from './Jogo';
import jogo from './Jogo.module.css';
import styles from './Fotos.module.css';
import { useMeuXp } from '../../xp/MeuXp';

const numero = (n: number) => n.toLocaleString('pt-BR');
const megas = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
const placarDe = (p: Partida) =>
  p.status === 'agendada' ? `${p.mandante_nome} × ${p.visitante_nome}` : `${p.mandante_nome} ${p.gols_mandante ?? 0} x ${p.gols_visitante ?? 0} ${p.visitante_nome}`;

/** Galeria do jogo, relida enquanto os joinhas estão abertos. */
function useGaleria(partida: Partida | null | undefined, aberta: boolean) {
  const [fotos, setFotos] = useState<FotoDaTorcida[] | null | undefined>(undefined);
  const id = partida?.id;
  const carregar = useCallback(async () => {
    if (!id) return;
    const novas = await buscarFotos(id);
    setFotos((antes) => novas ?? antes ?? null);
  }, [id]);
  useEffect(() => {
    void carregar();
    if (!aberta) return;
    const timer = window.setInterval(carregar, ATUALIZAR_GALERIA_MS);
    return () => window.clearInterval(timer);
  }, [carregar, aberta]);
  return { fotos, setFotos, recarregar: carregar };
}

// ---------- envio ----------

type Etapa = { tipo: 'escolher' } | { tipo: 'detalhes'; arquivo: File; previa: string | null } | { tipo: 'enviado' };

/** W07 · janela de envio: escolher a foto, marcar o momento, legenda, confirmar as regras e enviar. */
function EnviarFoto({
  partida,
  clubeId,
  usuarioId,
  enviadas,
  onFechar,
  onEnviada,
}: {
  partida: Partida;
  clubeId: number;
  usuarioId: string;
  enviadas: number;
  onFechar: () => void;
  onEnviada: () => void;
}) {
  const { regras } = useMeuXp();
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'escolher' });
  const [etiqueta, setEtiqueta] = useState<Etiqueta | null>(null);
  const [legenda, setLegenda] = useState('');
  const [ok, setOk] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const [total, setTotal] = useState(enviadas);

  const previa = etapa.tipo === 'detalhes' ? etapa.previa : null;
  useEffect(() => () => void (previa && URL.revokeObjectURL?.(previa)), [previa]);

  function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    const erro = problemaDoArquivo(arquivo);
    setProblema(erro);
    if (erro) return;
    setEtapa({ tipo: 'detalhes', arquivo, previa: URL.createObjectURL?.(arquivo) ?? null });
  }

  const pode = !!etiqueta && ok && !enviando;
  const limite = enviando ? 'enviando…' : !etiqueta ? 'escolha o momento do jogo' : !ok ? 'confirme as regras' : 'pronto para enviar';

  async function enviar() {
    if (etapa.tipo !== 'detalhes' || !etiqueta || !ok) return;
    setEnviando(true);
    setProblema(null);
    let r: Awaited<ReturnType<typeof enviarFotoDaTorcida>>;
    try {
      const imagem = await reduzirFoto(etapa.arquivo);
      r = await enviarFotoDaTorcida(partida.id, clubeId, usuarioId, imagem, etiqueta, legenda);
    } catch {
      r = { ok: false, erro: 'falha' };
    }
    setEnviando(false);
    if (!r.ok) return setProblema(MENSAGEM_DA_FOTO[r.erro]);
    setTotal((t) => t + 1);
    setEtapa({ tipo: 'enviado' });
    onEnviada();
  }

  return (
    <Modal rotulo={etapa.tipo === 'enviado' ? 'Foto publicada' : 'Enviar foto'} onFechar={onFechar} largura={560}>
      <div className={styles.envioTopo}>
        <div className={styles.envioTitulos}>
          <h2 className={styles.envioTitulo}>{etapa.tipo === 'enviado' ? 'Tudo certo' : 'Enviar foto'}</h2>
          <div className={styles.envioSub}>
            {placarDe(partida)} · {total} de {FOTOS_POR_JOGO} fotos neste jogo
          </div>
        </div>
        <button type="button" className={styles.fechar} aria-label="Fechar" onClick={onFechar}>
          <Icon name="close" size={21} />
        </button>
      </div>

      {etapa.tipo === 'escolher' && (
        <div className={styles.escolher}>
          <button
            type="button"
            className={arrastando ? `${styles.soltar} ${styles.soltarAtivo}` : styles.soltar}
            onClick={() => entrada.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              escolher(e.dataTransfer.files[0]);
            }}
          >
            <span className={styles.soltarIcone}>
              <Icon name="add_photo_alternate" size={28} color="var(--primary)" />
            </span>
            <strong>Arraste a foto aqui ou clique para escolher</strong>
            <span>JPG ou PNG · até 10 MB</span>
          </button>
          <input
            ref={entrada}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={styles.arquivo}
            data-testid="arquivo-da-foto-da-torcida"
            onChange={(e) => {
              escolher(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {problema && (
            <p className={styles.problema} role="alert">
              {problema}
            </p>
          )}
          <p className={styles.dica}>
            <Icon name="info" size={18} color="var(--muted)" />
            <span>Vale foto sua do jogo: estádio, bar, sofá. Nada de imagem da transmissão.</span>
          </p>
        </div>
      )}

      {etapa.tipo === 'detalhes' && (
        <>
          <div className={styles.detalhes}>
            <div className={styles.previa}>
              {previa ? <img src={previa} alt="Prévia da foto" /> : null}
              <span className={styles.nomeDoArquivo}>
                {etapa.arquivo.name} · {megas(etapa.arquivo.size)}
              </span>
              <button type="button" className={styles.trocar} onClick={() => setEtapa({ tipo: 'escolher' })}>
                <Icon name="sync" size={16} />
                Trocar
              </button>
            </div>
            <div>
              <div className={styles.rotulo} id="momento-da-foto">
                Momento do jogo
              </div>
              <div className={styles.momentos} role="radiogroup" aria-labelledby="momento-da-foto">
                {ETIQUETAS.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={etiqueta === m} className={styles.momento} onClick={() => setEtiqueta(m)}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={styles.rotuloLegenda} htmlFor="legenda-da-foto">
                <span>
                  Legenda <span className={styles.opcional}>(opcional)</span>
                </span>
                <span className={styles.contador}>
                  {legenda.length}/{LEGENDA_MAX}
                </span>
              </label>
              <input
                id="legenda-da-foto"
                className={styles.legenda}
                value={legenda}
                maxLength={LEGENDA_MAX}
                placeholder="Arquibancada lotada no 2º gol"
                onChange={(e) => setLegenda(e.target.value.slice(0, LEGENDA_MAX))}
              />
            </div>
            <label className={styles.regras}>
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
              <Icon name={ok ? 'check_box' : 'check_box_outline_blank'} size={21} color={ok ? 'var(--primary)' : 'var(--muted-2)'} />
              <span>A foto é minha e segue as regras da comunidade</span>
            </label>
            {problema && (
              <p className={styles.problema} role="alert">
                {problema}
              </p>
            )}
          </div>
          <div className={styles.envioRodape}>
            <span className={styles.limite}>{limite}</span>
            <button type="button" className={styles.enviar} disabled={!pode} onClick={enviar}>
              <Icon name="upload" size={19} />
              Enviar foto
            </button>
          </div>
        </>
      )}

      {etapa.tipo === 'enviado' && (
        <div className={styles.enviado}>
          <span className={styles.enviadoIcone}>
            <Icon name="check" size={32} color="var(--green-dark)" />
          </span>
          <strong>Foto publicada</strong>
          <p>Ela já está no mural deste jogo. As mais curtidas entram nas melhores fotos.</p>
          <span className={styles.xp}>
            <Icon name="bolt" size={16} />
            +{regras.foto_enviada} XP
          </span>
          <div className={styles.enviadoBotoes}>
            <button type="button" className={styles.verMural} onClick={onFechar}>
              Ver no mural
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------- galeria ----------

function Joinha({ foto, aberto, onCurtir, grande = false }: { foto: FotoDaTorcida; aberto: boolean; onCurtir: (f: FotoDaTorcida) => void; grande?: boolean }) {
  const pode = aberto && !foto.minha;
  const rotulo = foto.minha ? `Sua foto · ${foto.curtidas} joinhas` : `${foto.eu_curti ? 'Tirar joinha' : 'Dar joinha'} · ${foto.curtidas} joinhas`;
  return (
    <button
      type="button"
      className={`${grande ? styles.joinhaCampea : styles.joinha} ${foto.eu_curti ? styles.joinhaDado : ''}`}
      aria-pressed={foto.eu_curti}
      aria-label={rotulo}
      disabled={!pode}
      onClick={() => onCurtir(foto)}
    >
      <Icon name={foto.eu_curti || grande ? 'thumb_up' : 'thumb_up_off_alt'} size={grande ? 20 : 19} />
      <span>{numero(foto.curtidas)}</span>
    </button>
  );
}

function Denunciar({ foto, onDenunciar, grande = false }: { foto: FotoDaTorcida; onDenunciar: (f: FotoDaTorcida) => void; grande?: boolean }) {
  if (foto.minha) return null;
  return (
    <button type="button" className={grande ? styles.denunciarCampea : styles.denunciar} title="Denunciar" aria-label={`Denunciar a foto de ${foto.autor_apelido}`} onClick={() => onDenunciar(foto)}>
      <Icon name="flag" size={grande ? 19 : 17} />
    </button>
  );
}

function Imagem({ foto, altura }: { foto: FotoDaTorcida; altura: number }) {
  return foto.url ? (
    <img className={styles.imagem} style={{ height: altura }} src={foto.url} alt={foto.legenda || `Foto de ${foto.autor_apelido}`} loading="lazy" />
  ) : (
    <div className={styles.semImagem} style={{ height: altura }} />
  );
}

/** W07 · fotos da torcida de um jogo: a foto campeã, como ganhar XP e o mural. */
export function FotosDoJogo() {
  const { regras } = useMeuXp();
  const { id: param } = useParams();
  const id = Number(param);
  const { perfil } = useAuth();
  const { partida, erro, tentarDeNovo } = useJogo(id);
  const [agora, setAgora] = useState(() => new Date());
  const aberto = !!partida && joinhasAbertos(partida, agora);
  const { fotos, setFotos, recarregar } = useGaleria(partida, aberto);
  const [enviando, setEnviando] = useState(false);
  const [denunciando, setDenunciando] = useState<FotoDaTorcida | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const timer = window.setInterval(() => setAgora(new Date()), ATUALIZAR_GALERIA_MS);
    return () => window.clearInterval(timer);
  }, [aberto]);

  const clubeId = perfil?.time_id ?? null;
  const doJogo = !!partida && (clubeId === partida.mandante_id || clubeId === partida.visitante_id);
  const janela = partida ? janelaDaFoto(partida, agora) : null;
  const minhas = (fotos ?? []).filter((f) => f.minha);
  const jaEnviouNaJanela = !!janela && minhas.some((f) => f.momento === janela);
  const podeEnviar = doJogo && !!janela && !jaEnviouNaJanela && fotos !== undefined;
  const motivo = !doJogo
    ? 'As fotos são da torcida dos times em campo.'
    : !janela
      ? 'O envio abre 1 h antes do apito e fecha 1 h depois.'
      : jaEnviouNaJanela
        ? `Você já enviou a foto do ${MOMENTO_DO_JOGO[janela] === 'ao vivo' ? 'jogo ao vivo' : MOMENTO_DO_JOGO[janela]}.`
        : null;

  async function curtir(foto: FotoDaTorcida) {
    setAviso(null);
    const r = await curtirFoto(foto.id);
    if (!r.ok) return setAviso(MENSAGEM_DA_FOTO[r.erro]);
    setFotos((lista) => lista?.map((f) => (f.id === foto.id ? { ...f, eu_curti: r.curtida, curtidas: Math.max(0, f.curtidas + (r.curtida ? 1 : -1)) } : f)));
  }

  async function confirmarDenuncia() {
    if (!denunciando) return;
    const foto = denunciando;
    setDenunciando(null);
    const r = await denunciarFoto(foto.id);
    if (!r.ok) return setAviso(MENSAGEM_DA_FOTO[r.erro as ErroDaFoto]);
    setFotos((lista) => lista?.filter((f) => f.id !== foto.id));
    setAviso('Denúncia enviada. A foto não aparece mais para você.');
  }

  if (!Number.isInteger(id) || id <= 0 || partida === null || erro) {
    return (
      <div className={styles.page}>
        <FaixaDoJogo partida={null} atual="fotos" />
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
        <FaixaDoJogo partida={null} atual="fotos" />
      </div>
    );
  }

  const [campea, ...mural] = fotos ?? [];
  const sub = [placarDe(partida), janela ? MOMENTO_DO_JOGO[janela] : null, fotos ? `${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}` : null].filter(Boolean).join(' · ');

  return (
    <div className={styles.page}>
      <FaixaDoJogo partida={partida} atual="fotos" />
      <div className={styles.corpo}>
        <div className={styles.cabecalho}>
          <h2 className={ui.pageTitle}>Fotos da torcida</h2>
          <span className={ui.pageSub}>{sub}</span>
          <div className={ui.spacer} />
          <button type="button" className={styles.enviarFoto} disabled={!podeEnviar} title={motivo ?? undefined} onClick={() => setEnviando(true)}>
            <Icon name="add_a_photo" size={20} />
            Enviar foto · +{regras.foto_enviada} XP
          </button>
        </div>
        {motivo && doJogo && <p className={styles.motivo}>{motivo}</p>}
        {aviso && (
          <p className={styles.aviso} role="status">
            {aviso}
          </p>
        )}

        {!doJogo ? (
          <div className={jogo.aviso}>
            <Icon name="photo_library" size={28} color="var(--muted)" />
            <p>As fotos são da torcida dos times em campo.</p>
          </div>
        ) : (
          <>
            <div className={styles.topo}>
              {fotos === undefined ? (
                <Skeleton h={420} r={16} />
              ) : campea ? (
                <section className={styles.campea} aria-label={aberto ? 'Mais curtida até agora' : 'Foto campeã do jogo'}>
                  <div className={styles.campeaFaixa}>
                    <Icon name="emoji_events" size={19} color="var(--gold)" />
                    <span className={styles.campeaRotulo}>{aberto ? 'Mais curtida até agora' : 'Foto campeã do jogo'}</span>
                    <span className={styles.campeaXp}>
                      <Icon name="bolt" size={15} />
                      +{regras.foto_campea} XP
                    </span>
                  </div>
                  <Imagem foto={campea} altura={300} />
                  <div className={styles.campeaRodape}>
                    <span className={styles.avatarCampea}>
                      <Icon name="person" size={20} color="var(--gold)" />
                    </span>
                    <div className={styles.campeaTexto}>
                      <span className={styles.autorCampea}>{campea.minha ? `${campea.autor_apelido} (você)` : campea.autor_apelido}</span>
                      {campea.legenda && <span className={styles.legendaCampea}>{campea.legenda}</span>}
                    </div>
                    <Joinha foto={campea} aberto={aberto} onCurtir={curtir} grande />
                    <Denunciar foto={campea} onDenunciar={setDenunciando} grande />
                  </div>
                </section>
              ) : (
                <section className={styles.vazio} aria-label="Mural vazio">
                  <Icon name="photo_camera" size={30} color="var(--muted)" />
                  <strong>Nenhuma foto ainda</strong>
                  <span>{janela ? 'Seja o primeiro da torcida a mandar uma foto deste jogo.' : 'O envio abre 1 h antes do apito.'}</span>
                </section>
              )}
              <div className={styles.lado}>
                <section className={styles.comoGanhar} aria-labelledby="como-ganhar">
                  <h3 id="como-ganhar" className={styles.comoGanharTitulo}>
                    Como ganhar XP aqui
                  </h3>
                  <ul className={styles.regrasXp}>
                    <li>
                      <Icon name="add_a_photo" size={19} color="var(--primary)" />
                      <span className={styles.regraXp}>Enviar foto</span>
                      <strong>+{regras.foto_enviada} XP</strong>
                    </li>
                    <li>
                      <Icon name="emoji_events" size={19} color="var(--gold)" />
                      <span className={styles.regraXp}>Foto mais votada</span>
                      <strong>+{regras.foto_campea} XP</strong>
                    </li>
                  </ul>
                </section>
                <div className={styles.janelas}>
                  <Icon name="lock_clock" size={19} color="var(--muted)" />
                  <span>O envio abre 1 h antes do apito e fecha 1 h depois. Três fotos por partida, uma por janela.</span>
                </div>
              </div>
            </div>

            {mural.length > 0 && (
              <ul className={styles.mural} aria-label="Mural de fotos">
                {mural.map((f) => (
                  <li key={f.id} className={styles.cartao}>
                    <div className={styles.cartaoImagem}>
                      <Imagem foto={f} altura={180} />
                      <span className={styles.etiqueta}>{f.etiqueta}</span>
                      <Joinha foto={f} aberto={aberto} onCurtir={curtir} />
                    </div>
                    <div className={styles.cartaoTexto}>
                      <div className={styles.cartaoAutor}>
                        <span>{f.minha ? `${f.autor_apelido} (você)` : f.autor_apelido}</span>
                        <Denunciar foto={f} onDenunciar={setDenunciando} />
                      </div>
                      {f.legenda && <p>{f.legenda}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {enviando && perfil && clubeId && (
        <EnviarFoto
          partida={partida}
          clubeId={clubeId}
          usuarioId={perfil.id}
          enviadas={minhas.length}
          onFechar={() => setEnviando(false)}
          onEnviada={() => void recarregar()}
        />
      )}
      {denunciando && (
        <Modal rotulo="Denunciar foto" onFechar={() => setDenunciando(null)} largura={420}>
          <div className={styles.denuncia}>
            <h2 className={styles.envioTitulo}>Denunciar foto?</h2>
            <p>A foto de {denunciando.autor_apelido} some para você agora. Com 3 denúncias ela sai do mural de todos.</p>
            <div className={styles.denunciaBotoes}>
              <button type="button" className={styles.cancelar} onClick={() => setDenunciando(null)}>
                Cancelar
              </button>
              <button type="button" className={styles.confirmarDenuncia} onClick={confirmarDenuncia}>
                Denunciar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
