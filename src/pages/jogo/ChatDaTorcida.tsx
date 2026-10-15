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

/** Coluna "Chat da torcida" (W02): só membros, e cada torcida no seu chat. */
export function ChatDaTorcida({ partida }: { partida: Partida }) {
  const { assinante, perfil } = useAuth();
  const clubeId = perfil?.time_id ?? null;
  const daTorcida = clubeId !== null && (partida.mandante_id === clubeId || partida.visitante_id === clubeId);
  const ativo = !!assinante && daTorcida;
  const { mensagens, erroAoCarregar, online, total, enviar } = useChat(partida.id, clubeId, perfil?.id ?? null, ativo);
  const aberto = chatAberto(partida);
  // Silenciado ou suspenso lê, mas não escreve: o campo dá lugar ao aviso (o banco barra de qualquer jeito).
  const bloqueio = motivoParaNaoPublicar(useMinhasRestricoes(ativo && aberto));

  const [rascunho, setRascunho] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const noFim = useRef(true);

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
