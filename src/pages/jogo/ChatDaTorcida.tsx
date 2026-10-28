import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BloqueioPainel } from '../../assinatura/Bloqueio';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/ui/Avatar';
import { Icon } from '../../components/ui/Icon';
import { MENSAGEM_DO_ERRO, TAMANHO_MAXIMO, useChat } from '../../data/chat';
import { urlDaFoto } from '../../data/conta';
import { chatAberto } from '../../data/jogo';
import type { Partida } from '../../data/partidas';
import styles from './Jogo.module.css';
import { motivoParaNaoPublicar, useMinhasRestricoes } from '../../data/restricoes';

const NUMERO = new Intl.NumberFormat('pt-BR');

/** Emojis do seletor do chat, em grupos; só os que aparecem bem em qualquer sistema. */
export const GRUPOS_DE_EMOJI = [
  { nome: 'Jogo', emojis: ['⚽', '🏆', '🥇', '🧤', '👟', '🏟️', '📣', '🎉'] },
  { nome: 'Torcida', emojis: ['🔥', '👏', '🙌', '💪', '🚀', '❤️', '💔', '🙏'] },
  { nome: 'Reações', emojis: ['😂', '🤣', '😍', '🥳', '😎', '🤩', '😅', '😉', '😱', '😤', '😡', '🤬', '😭', '🤦', '👍', '👎'] },
];
export const EMOJIS = GRUPOS_DE_EMOJI.flatMap((g) => g.emojis);

/** Botão do composer que abre a grade de emojis; escolher um insere no cursor e fecha a grade. */
function SeletorDeEmoji({ onEscolher }: { onEscolher: (emoji: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className={styles.emojiCaixa}>
      <button type="button" className={styles.iconBtn} aria-label="Inserir emoji" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <Icon name="mood" size={21} />
      </button>
      {aberto && (
        <div className={styles.emojis} role="group" aria-label="Emojis">
          {GRUPOS_DE_EMOJI.map((g) => (
            <div key={g.nome} role="group" aria-label={g.nome} className={styles.emojiGrupo}>
              <span className={styles.emojiTitulo} aria-hidden="true">
                {g.nome}
              </span>
              <div className={styles.emojiGrade}>
                {g.emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={styles.emoji}
                    aria-label={e}
                    onClick={() => {
                      onEscolher(e);
                      setAberto(false);
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Coluna "Chat da torcida" (W02): só membros, e cada torcida no seu chat. */
export function ChatDaTorcida({ partida }: { partida: Partida }) {
  const { assinante, perfil } = useAuth();
  const clubeId = perfil?.time_id ?? null;
  const daTorcida = clubeId !== null && (partida.mandante_id === clubeId || partida.visitante_id === clubeId);
  const ativo = !!assinante && daTorcida;
  const { mensagens, erroAoCarregar, online, total, enviar } = useChat(partida.id, clubeId, perfil?.id ?? null, ativo);
  const aberto = chatAberto(partida);
  // Silenciado ou suspenso lê, mas não escreve: o campo dá lugar ao aviso (o banco barra de qualquer jeito).
  const { restricoes, recarregar: reler } = useMinhasRestricoes(ativo && aberto);
  const bloqueio = motivoParaNaoPublicar(restricoes);

  const [rascunho, setRascunho] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const noFim = useRef(true);

  // Entra onde está o cursor (ou no fim), sem passar do limite; o foco volta para o campo depois do emoji.
  function inserirEmoji(emoji: string) {
    const el = campo.current;
    const inicio = el?.selectionStart ?? rascunho.length;
    const fim = el?.selectionEnd ?? rascunho.length;
    const novo = rascunho.slice(0, inicio) + emoji + rascunho.slice(fim);
    if (novo.length > TAMANHO_MAXIMO) return;
    setRascunho(novo);
    setErro(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(inicio + emoji.length, inicio + emoji.length);
    });
  }

  // Desce para a mensagem nova só se a pessoa já estava no fim (não puxa quem está lendo o histórico).
  useEffect(() => {
    const el = lista.current;
    if (el && noFim.current) el.scrollTop = el.scrollHeight;
  }, [mensagens?.length]);

  async function mandar(e: FormEvent) {
    e.preventDefault();
    const texto = rascunho.trim();
    if (!texto || enviando) return;
    setEnviando(true);
    setErro(null);
    noFim.current = true;
    const r = await enviar(texto);
    setEnviando(false);
    if (r.ok) setRascunho('');
    else if (r.erro === 'silenciado' || r.erro === 'suspenso') reler(); // o campo dá lugar ao aviso com o prazo
    else setErro(MENSAGEM_DO_ERRO[r.erro]);
  }

  return (
    <section className={styles.chat} aria-labelledby="titulo-chat">
      <div className={styles.chatHead}>
        <Icon name="forum" size={20} color="var(--primary)" />
        <h3 id="titulo-chat" className={styles.chatTitle}>
          Chat da torcida
        </h3>
        {ativo && aberto && online !== null && <div className={styles.online}>{NUMERO.format(online)} online</div>}
        {ativo && !aberto && total !== null && (
          <div className={styles.online}>
            {NUMERO.format(total)} {total === 1 ? 'mensagem' : 'mensagens'} · encerrado
          </div>
        )}
      </div>

      {!assinante ? (
        <BloqueioPainel texto="O chat da torcida é para membros. O placar continua liberado para todo mundo." />
      ) : !daTorcida ? (
        <p className={styles.chatAviso}>O chat é da torcida dos times em campo.</p>
      ) : (
        <>
          <div
            ref={lista}
            className={styles.messages}
            role="log"
            aria-label="Mensagens da torcida"
            aria-busy={mensagens === null && !erroAoCarregar}
            onScroll={(e) => {
              const el = e.currentTarget;
              noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
          >
            {erroAoCarregar && <p className={styles.chatAviso}>Não deu para carregar o chat. Verifique sua conexão.</p>}
            {mensagens?.length === 0 && (
              <p className={styles.chatAviso}>{aberto ? 'Ninguém falou ainda. Abre a conversa!' : 'Ninguém falou neste jogo.'}</p>
            )}
            {mensagens?.map((m) =>
              m.autor_id === perfil?.id ? (
                <div key={m.id} className={`${styles.msg} ${styles.mine}`}>
                  <div className={styles.bubble}>{m.texto}</div>
                </div>
              ) : (
                <div key={m.id} className={styles.msg}>
                  <Avatar size={30} iconSize={17} foto={urlDaFoto(m.autor_foto)} />
                  <div>
                    <div className={styles.author}>{m.autor_apelido}</div>
                    <div className={styles.bubble}>{m.texto}</div>
                  </div>
                </div>
              ),
            )}
          </div>
          {aberto && bloqueio ? (
            <div className={styles.chatFechado} role="status">
              <Icon name="block" size={20} color="var(--muted)" />
              <span>{bloqueio}</span>
            </div>
          ) : aberto ? (
            <form className={styles.composer} onSubmit={mandar}>
              <div className={styles.composerCampo}>
                <input
                  ref={campo}
                  className={styles.input}
                  value={rascunho}
                  onChange={(e) => {
                    setRascunho(e.target.value);
                    setErro(null);
                  }}
                  placeholder="Manda a real pra torcida"
                  aria-label="Mensagem para a torcida"
                  maxLength={TAMANHO_MAXIMO}
                />
                {erro && (
                  <div className={styles.chatErro} role="alert">
                    {erro}
                  </div>
                )}
              </div>
              <SeletorDeEmoji onEscolher={inserirEmoji} />
              <button type="submit" className={styles.sendBtn} aria-label="Enviar" disabled={!rascunho.trim() || enviando}>
                <Icon name="send" size={21} />
              </button>
            </form>
          ) : (
            <div className={styles.chatFechado}>
              <Icon name="lock" size={20} color="var(--muted)" />
              <span>Chat encerrado com o apito final. As mensagens ficam disponíveis para leitura.</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
