import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent as TeclaReact } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  BONUS_DO_CONVITE,
  buscarConvidados,
  convitesRestantes,
  emailDeConviteValido,
  enviarConvites,
  LIMITE_DIARIO,
  linkDoConvite,
  mensagemDoConvite,
  reenviarConvite,
  type Convidado,
} from '../../convites/convites';
import { Icon } from '../ui/Icon';
import ui from '../../styles/ui.module.css';
import styles from './InviteModal.module.css';

// A fatia e o total de XP ainda não existem no banco: ficam fixos como o resto do XP do app.
const LADDER = [
  { id: 'e1', friends: '3 amigos', pct: '10%', flex: 3, done: true },
  { id: 'e2', friends: '5', pct: '12%', flex: 2 },
  { id: 'e3', friends: '10', pct: '15%', flex: 2 },
  { id: 'e4', friends: '25', pct: '20%', flex: 2 },
];

const VISUAL: Record<Convidado['estado'], { estado: string; xp: string; color: string; bg: string; icon: string }> = {
  ativo: { estado: 'Escolheu o clube · ativo', xp: `+${BONUS_DO_CONVITE}`, color: '#2A6E0D', bg: '#E1F4D8', icon: 'check' },
  sem_time: { estado: 'Cadastrou, ainda não escolheu time', xp: '—', color: '#8A5E06', bg: '#FFF4D6', icon: 'hourglass_top' },
  pendente: { estado: 'Convite por e-mail · aguardando cadastro', xp: '—', color: '#6E7C93', bg: '#EBF0F6', icon: 'schedule' },
};

type Etapa = 'fechado' | 'form' | 'enviado';

export function InviteModal({ onClose }: { onClose: () => void }) {
  const { perfil } = useAuth();
  const apelido = perfil?.apelido ?? '';
  const clube = perfil?.clube?.nome_curto ?? perfil?.clube?.nome ?? null;
  const [copiado, setCopiado] = useState<'codigo' | 'link' | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const [convidados, setConvidados] = useState<Convidado[] | null>(null);
  const [restam, setRestam] = useState(LIMITE_DIARIO);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);

  const [etapa, setEtapa] = useState<Etapa>('fechado');
  const [lista, setLista] = useState<string[]>([]);
  const [texto, setTexto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ultimoEnvio, setUltimoEnvio] = useState(0);

  const carregar = useCallback(async () => {
    const [lista, restantes] = await Promise.all([buscarConvidados(), convitesRestantes()]);
    setConvidados(lista ?? []);
    setRestam(restantes);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer.current);
    };
  }, [onClose]);

  const copiar = (oque: 'codigo' | 'link') => {
    navigator.clipboard?.writeText(oque === 'codigo' ? apelido : linkDoConvite(apelido)).catch(() => {});
    setCopiado(oque);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopiado(null), 1600);
  };

  // ---------- convidar por e-mail ----------
  const pendentes = (convidados ?? []).filter((c) => c.estado === 'pendente').map((c) => c.chave);
  const validos = lista.filter(emailDeConviteValido);
  const invalido = lista.some((e) => !emailDeConviteValido(e));
  const pode = validos.length > 0 && !invalido && !enviando;
  const mensagemDeErro = invalido ? 'Corrija o e-mail marcado em vermelho' : erro;

  /** Separa o que foi digitado em e-mails; quem já recebeu convite não entra na lista. */
  function adicionar(valor = texto) {
    const novos = valor
      .split(/[,;\s]+/)
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x && !lista.includes(x));
    setTexto('');
    if (!novos.length) return;
    const repetido = novos.find((x) => pendentes.includes(x));
    setLista(lista.concat(novos.filter((x) => !pendentes.includes(x))).slice(0, restam));
    setErro(repetido ? `${repetido} já recebeu convite` : '');
  }

  function digitar(e: ChangeEvent<HTMLInputElement>) {
    const valor = e.target.value;
    if (/[,;]$/.test(valor)) adicionar(valor);
    else setTexto(valor);
  }

  function tecla(e: TeclaReact<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      adicionar();
    } else if (e.key === 'Backspace' && !texto && lista.length) {
      setLista(lista.slice(0, -1));
    }
  }

  async function enviar() {
    if (!pode) return;
    setEnviando(true);
    setErro('');
    const r = await enviarConvites(validos, mensagem);
    setEnviando(false);
    if (!r.ok) {
      setErro(mensagemDoConvite(r.erro));
      return;
    }
    setUltimoEnvio(r.dados.enviados.length);
    setLista(r.dados.falharam);
    setMensagem('');
    setEtapa(r.dados.falharam.length ? 'form' : 'enviado');
    if (r.dados.falharam.length) setErro(`Não deu para enviar para ${r.dados.falharam.join(', ')}. Tente de novo.`);
    void carregar();
  }

  async function reenviar(email: string) {
    setErroDaLista(null);
    const r = await reenviarConvite(email);
    if (!r.ok) {
      setErroDaLista(mensagemDoConvite(r.erro));
      return;
    }
    void carregar();
  }

  const ativos = (convidados ?? []).filter((c) => c.estado === 'ativo').length;
  const aguardando = (convidados ?? []).length - ativos;
  const formAberto = etapa === 'form';

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="invite-title" onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div className={styles.headText}>
            <h2 id="invite-title" className={styles.title}>
              Chame a torcida e ganhe junto
            </h2>
            <p className={styles.lead}>
              Cada amigo que entra pelo seu convite rende XP na hora, e você continua ganhando uma parte de tudo que ele fizer no app. A
              sua fatia não tira XP dele.
            </p>
          </div>
          <button type="button" className={styles.close} aria-label="Fechar" onClick={onClose}>
            <Icon name="close" size={21} />
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.col}>
            <div className={styles.codeCard}>
              <div className={styles.codeLabel}>Seu código</div>
              <div className={styles.code}>{apelido.toUpperCase()}</div>
              <button
                type="button"
                className={copiado === 'codigo' ? `${styles.copy} ${styles.copied}` : styles.copy}
                onClick={() => copiar('codigo')}
              >
                <Icon name="content_copy" size={19} />
                {copiado === 'codigo' ? 'Código copiado' : 'Copiar código'}
              </button>
              <div className={styles.shareRow}>
                <button
                  type="button"
                  className={formAberto ? `${styles.share} ${styles.shareOn}` : styles.share}
                  aria-expanded={formAberto}
                  onClick={() => setEtapa(formAberto ? 'fechado' : 'form')}
                >
                  <Icon name="mail" size={18} />
                  Convidar por e-mail
                </button>
                <button type="button" className={styles.share} onClick={() => copiar('link')}>
                  <Icon name="link" size={18} />
                  {copiado === 'link' ? 'Link copiado' : 'Copiar link'}
                </button>
              </div>
            </div>

            {formAberto && (
              <div className={styles.emailForm}>
                <div className={styles.emailHead}>
                  <div className={styles.emailTitle}>Convidar por e-mail</div>
                  <div className={styles.restam}>
                    {restam} de {LIMITE_DIARIO} hoje
                  </div>
                </div>
                <div>
                  <label className={styles.fieldLabel} htmlFor="convite-emails">
                    E-mails dos amigos
                  </label>
                  <div className={invalido ? `${styles.chips} ${styles.chipsErro}` : styles.chips}>
                    {lista.map((e) => (
                      <span key={e} className={emailDeConviteValido(e) ? styles.chip : `${styles.chip} ${styles.chipErro}`}>
                        {e}
                        <button type="button" className={styles.chipX} aria-label={`Tirar ${e}`} onClick={() => setLista(lista.filter((x) => x !== e))}>
                          <Icon name="close" size={16} />
                        </button>
                      </span>
                    ))}
                    <input
                      id="convite-emails"
                      className={styles.chipInput}
                      value={texto}
                      onChange={digitar}
                      onKeyDown={tecla}
                      onBlur={() => adicionar()}
                      placeholder={lista.length ? 'Adicionar outro' : 'amigo@email.com'}
                      type="email"
                      autoComplete="off"
                      disabled={restam === 0}
                    />
                  </div>
                  {mensagemDeErro ? (
                    <div className={styles.fieldErro} role="alert">
                      {mensagemDeErro}
                    </div>
                  ) : (
                    <div className={styles.fieldHint}>
                      {restam === 0 ? 'Você já mandou 10 convites hoje. Amanhã libera de novo.' : 'Separe por vírgula ou aperte Enter. Até 10 por dia.'}
                    </div>
                  )}
                </div>
                <div>
                  <label className={styles.fieldLabel} htmlFor="convite-mensagem">
                    Mensagem <span className={styles.optional}>(opcional)</span>
                  </label>
                  <textarea
                    id="convite-mensagem"
                    className={styles.textarea}
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    placeholder={clube ? `Bora torcer junto pelo ${clube}!` : 'Bora torcer junto!'}
                    maxLength={280}
                  />
                </div>
                <div className={styles.sendRow}>
                  <div className={styles.sendNote}>O e-mail sai da Torcida Online com seu apelido e seu link de convite.</div>
                  <button type="button" className={styles.send} disabled={!pode} onClick={enviar}>
                    <Icon name="send" size={18} />
                    {enviando ? 'Enviando…' : validos.length > 1 ? `Enviar ${validos.length} convites` : 'Enviar convite'}
                  </button>
                </div>
              </div>
            )}

            {etapa === 'enviado' && (
              <div className={styles.sent} role="status">
                <Icon name="mark_email_read" size={22} color="#2A6E0D" />
                <div className={styles.sentText}>
                  <div className={styles.sentTitle}>{ultimoEnvio > 1 ? `Convite enviado para ${ultimoEnvio} amigos` : 'Convite enviado'}</div>
                  <div className={styles.sentLead}>Eles aparecem em "Seus convidados" como pendentes até concluírem o cadastro.</div>
                </div>
                <button type="button" className={styles.more} onClick={() => setEtapa('form')}>
                  Convidar mais
                </button>
              </div>
            )}

            <div className={styles.box}>
              <div className={styles.boxHead}>
                <div className={ui.title}>Sua fatia de XP</div>
                <div className={styles.pct}>10% agora</div>
              </div>
              <p className={styles.muted}>A porcentagem sobe com o número de amigos ativos e vale para sempre.</p>
              <div className={styles.ladder}>
                {LADDER.map((s) => (
                  <div key={s.id} className={s.done ? `${styles.step} ${styles.stepDone}` : styles.step} style={{ flex: s.flex }}>
                    <div className={styles.stepBar} />
                    <div className={styles.stepFriends}>{s.friends}</div>
                    <div className={styles.stepPct}>{s.pct}</div>
                  </div>
                ))}
              </div>
              <div className={styles.tip}>
                <Icon name="trending_up" size={18} color="var(--green-dark)" />
                <div>
                  Mais <strong>2 amigos ativos</strong> e sua fatia vira 12%.
                </div>
              </div>
            </div>
          </div>
          <div className={styles.col}>
            <div className={styles.total}>
              <Icon name="bolt" size={26} color="var(--green-neon)" />
              <div>
                <div className={styles.totalValue}>1.840 XP</div>
                <div className={styles.totalText}>total já rendido pelos seus convites</div>
              </div>
            </div>
            <section className={styles.guests} aria-labelledby="convidados-titulo">
              <div className={styles.guestsHead}>
                <div id="convidados-titulo" className={ui.title}>
                  Seus convidados
                </div>
                {convidados && (
                  <div className={styles.guestsCount}>
                    {ativos} {ativos === 1 ? 'ativo' : 'ativos'} · {aguardando} {aguardando === 1 ? 'pendente' : 'pendentes'}
                  </div>
                )}
              </div>
              {erroDaLista && (
                <div className={styles.listErro} role="alert">
                  {erroDaLista}
                </div>
              )}
              {convidados?.length === 0 && <div className={styles.empty}>Ninguém ainda. Copie o link ou mande por e-mail para a torcida.</div>}
              <ul className={styles.guestList}>
                {convidados?.map((c) => {
                  const v = VISUAL[c.estado];
                  return (
                    <li key={c.chave} className={styles.guest}>
                      <div className={styles.guestIcon} style={{ background: v.bg }}>
                        <Icon name={v.icon} size={18} color={v.color} />
                      </div>
                      <div className={styles.guestInfo}>
                        <div className={styles.guestName}>{c.nome}</div>
                        <div className={styles.guestState}>{v.estado}</div>
                      </div>
                      {c.estado === 'pendente' &&
                        (c.reenviado ? (
                          <span className={styles.resent}>Reenviado</span>
                        ) : (
                          <button type="button" className={styles.resend} aria-label={`Reenviar para ${c.nome}`} onClick={() => reenviar(c.chave)}>
                            Reenviar
                          </button>
                        ))}
                      <div className={styles.guestXp} style={{ color: v.color }}>
                        {v.xp}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
            <div className={styles.note}>
              <Icon name="info" size={19} color="var(--gold)" />
              <div>O amigo precisa escolher um time e entrar em um jogo para o convite contar.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
