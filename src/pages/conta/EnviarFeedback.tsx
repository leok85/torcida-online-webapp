import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Alert } from '../../components/form/Alert';
import { Icon } from '../../components/ui/Icon';
import { Carregando, Skeleton } from '../../components/ui/Skeleton';
import {
  AREAS,
  areaDaRota,
  dadosDoNavegador,
  diaEMes,
  ENVIOS_COM_XP_POR_SEMANA,
  enviarFeedback,
  enviosComXpNaSemana,
  ESTADOS,
  meusFeedbacks,
  problemaDoAnexo,
  rotuloDoTipo,
  TEXTO_MAX,
  TEXTO_MIN,
  TIPOS,
  TIPOS_DE_ANEXO,
  XP_POR_ENVIO,
  type Area,
  type Tipo,
} from '../../data/feedback';
import type { FeedbackRow } from '../../lib/database.types';
import styles from './EnviarFeedback.module.css';

/** De onde a pessoa abriu o feedback (o menu de conta manda a rota atual). */
export type OrigemDoFeedback = { de?: string } | null;

function useHistorico() {
  const [lista, setLista] = useState<FeedbackRow[] | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    meusFeedbacks().then(
      (dados) => {
        if (!ativo) return;
        setLista(dados);
        setErro(false);
      },
      () => ativo && setErro(true),
    );
    return () => {
      ativo = false;
    };
  }, [tentativa]);
  return { lista, setLista, erro, tentarDeNovo: () => setTentativa((t) => t + 1) };
}

/**
 * W23 · Enviar feedback, aberta pelo menu de conta. Problema, sugestão ou elogio, com a área do app (já marcada pela
 * tela de origem), print opcional e dados do navegador. Ao lado, o XP da semana e o histórico com as respostas da equipe.
 */
export function EnviarFeedback() {
  const { perfil, sessao } = useAuth();
  const origem = (useLocation().state as OrigemDoFeedback)?.de;
  const historico = useHistorico();
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [area, setArea] = useState<Area>(() => areaDaRota(origem));
  const [texto, setTexto] = useState('');
  const [anexo, setAnexo] = useState<File | null>(null);
  const [erroAnexo, setErroAnexo] = useState<string | null>(null);
  const [enviarDados, setEnviarDados] = useState(true);
  const [podeResponder, setPodeResponder] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<FeedbackRow | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const email = sessao?.user.email ?? '';
  const tamanho = texto.trim().length;
  const pode = !!tipo && tamanho >= TEXTO_MIN;
  const usadosNaSemana = historico.lista ? enviosComXpNaSemana(historico.lista) : 0;
  const semXp = usadosNaSemana >= ENVIOS_COM_XP_POR_SEMANA;
  const tipoAtual = TIPOS.find((t) => t.id === tipo);
  const dica = !tipo
    ? `Escolha o tipo e escreva pelo menos ${TEXTO_MIN} caracteres.`
    : tamanho < TEXTO_MIN
      ? `Escreva pelo menos ${TEXTO_MIN} caracteres.`
      : semXp
        ? 'Envio sem XP: limite semanal atingido.'
        : `Este envio rende +${XP_POR_ENVIO} XP.`;

  function escolherAnexo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const problema = problemaDoAnexo(f);
    setErroAnexo(problema);
    if (!problema) setAnexo(f);
  }

  async function enviar() {
    if (!pode || !perfil || !tipo) return;
    setEnviando(true);
    setErro(null);
    try {
      const novo = await enviarFeedback({
        usuarioId: perfil.id,
        tipo,
        area,
        texto,
        anexo,
        dadosNavegador: enviarDados ? dadosDoNavegador(origem) : null,
        podeResponder,
      });
      historico.setLista((l) => (l ? [novo, ...l] : l));
      setEnviado(novo);
    } catch (e) {
      setErro(
        (e as { hint?: string }).hint === 'limite_diario'
          ? 'Você já mandou muitos feedbacks hoje. Tente de novo amanhã.'
          : navigator.onLine === false
            ? 'Parece que você está sem internet.'
            : 'Tivemos um problema no servidor.',
      );
    } finally {
      setEnviando(false);
    }
  }

  function enviarOutro() {
    setEnviado(null);
    setTipo(null);
    setTexto('');
    setAnexo(null);
    setErroAnexo(null);
    setArea(areaDaRota(origem));
  }

  return (
    <div className={styles.page}>
      <div className={styles.topo}>
        <h1 className={styles.titulo}>Enviar feedback</h1>
        <span className={styles.subtitulo}>A equipe lê todos os envios.</span>
      </div>

      <div className={styles.colunas}>
        {enviado ? (
          <section className={styles.enviado} aria-labelledby="titulo-enviado">
            <div className={styles.enviadoIcone}>
              <Icon name="check" size={34} />
            </div>
            <h2 id="titulo-enviado" className={styles.enviadoTitulo}>
              Valeu pelo toque
            </h2>
            <p className={styles.enviadoTexto}>
              {enviado.pode_responder
                ? `Recebemos seu envio. Se precisarmos de mais detalhes, respondemos em ${enviado.email ?? email}.`
                : 'Recebemos seu envio. Você acompanha o andamento aqui ao lado.'}
            </p>
            {enviado.xp > 0 ? (
              <div className={styles.xpGanho}>
                <Icon name="bolt" size={18} />+{enviado.xp} XP
              </div>
            ) : (
              <p className={styles.semXp}>Você já ganhou o XP dos {ENVIOS_COM_XP_POR_SEMANA} envios desta semana. O limite renova na segunda.</p>
            )}
            <div className={styles.enviadoBotoes}>
              <button type="button" className={styles.outro} onClick={enviarOutro}>
                Enviar outro
              </button>
              <Link to="/" className={styles.inicio}>
                Voltar ao início
              </Link>
            </div>
          </section>
        ) : (
          <form
            className={styles.formulario}
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
            noValidate
            aria-label="Enviar feedback"
          >
            <fieldset className={styles.secao}>
              <legend className={styles.secaoTitulo}>O que você quer contar</legend>
              <div className={styles.tipos}>
                {TIPOS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={tipo === t.id ? styles.tipoAtivo : styles.tipo}
                    aria-pressed={tipo === t.id}
                    onClick={() => setTipo(t.id)}
                  >
                    <Icon name={t.icone} size={24} />
                    <span className={styles.tipoRotulo}>{t.rotulo}</span>
                    <span className={styles.tipoSub}>{t.sub}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className={styles.secao}>
              <legend className={styles.secaoTitulo}>Onde</legend>
              <div className={styles.areas}>
                {AREAS.map((a) => (
                  <button key={a.id} type="button" className={area === a.id ? styles.areaAtiva : styles.area} aria-pressed={area === a.id} onClick={() => setArea(a.id)}>
                    {a.rotulo}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <div className={styles.textoTopo}>
                <label htmlFor="texto-do-feedback" className={styles.textoRotulo}>
                  {tipoAtual?.pergunta ?? 'Conte com suas palavras'}
                </label>
                <span className={tamanho > 0 && tamanho < TEXTO_MIN ? styles.contadorCurto : styles.contador} aria-live="polite">
                  {tamanho} / {TEXTO_MAX}
                </span>
              </div>
              <textarea
                id="texto-do-feedback"
                className={styles.texto}
                value={texto}
                onChange={(e) => setTexto(e.target.value.slice(0, TEXTO_MAX))}
                readOnly={enviando}
                placeholder={tipoAtual?.exemplo ?? 'Escolha o tipo acima para começar.'}
              />
            </div>

            <div className={styles.extras}>
              <input ref={arquivo} type="file" accept={TIPOS_DE_ANEXO.join(',')} hidden onChange={escolherAnexo} data-testid="arquivo-do-feedback" aria-label="Arquivo do print" />
              {anexo ? (
                <div className={styles.anexo}>
                  <Icon name="image" size={20} />
                  <span className={styles.anexoNome}>{anexo.name}</span>
                  <button type="button" className={styles.removerAnexo} onClick={() => setAnexo(null)} aria-label="Remover print">
                    <Icon name="close" size={19} />
                  </button>
                </div>
              ) : (
                <button type="button" className={styles.anexar} onClick={() => arquivo.current?.click()}>
                  <Icon name="add_photo_alternate" size={20} />
                  Anexar print da tela
                  <span className={styles.anexarLimite}>até 5 MB</span>
                </button>
              )}
              {erroAnexo && (
                <div className={styles.erroAnexo} role="alert">
                  {erroAnexo}
                </div>
              )}
              <button type="button" role="switch" aria-checked={enviarDados} className={styles.opcao} onClick={() => setEnviarDados((v) => !v)}>
                <span className={styles.opcaoTextos}>
                  <span className={styles.opcaoTitulo}>Enviar dados do navegador</span>
                  <span className={styles.opcaoSub} style={{ display: 'block' }}>
                    navegador, sistema e última tela aberta
                  </span>
                </span>
                <span className={styles.chave} aria-hidden="true">
                  <span />
                </span>
              </button>
              <button type="button" role="switch" aria-checked={podeResponder} className={styles.opcao} onClick={() => setPodeResponder((v) => !v)}>
                <span className={styles.opcaoTextos}>
                  <span className={styles.opcaoTitulo}>Podem me responder por e-mail</span>
                  <span className={styles.opcaoSub} style={{ display: 'block' }}>
                    {email}
                  </span>
                </span>
                <span className={styles.chave} aria-hidden="true">
                  <span />
                </span>
              </button>
            </div>

            {erro && (
              <div className={styles.falha} role="alert">
                <Icon name="cloud_off" size={21} />
                <div className={styles.falhaTextos}>
                  <div className={styles.falhaTitulo}>Não foi possível enviar</div>
                  <div className={styles.falhaTexto}>{erro} Seu texto e o anexo continuam aqui.</div>
                </div>
                <button type="button" className={styles.tentarEnvio} onClick={enviar} disabled={enviando}>
                  <Icon name="refresh" size={17} />
                  Tentar de novo
                </button>
              </div>
            )}

            <div className={styles.rodape}>
              <div className={styles.dica}>{dica}</div>
              <button type="submit" className={styles.enviar} disabled={!pode || enviando} aria-busy={enviando || undefined}>
                {enviando ? (
                  <>
                    <span className={styles.girando} aria-hidden="true" />
                    Enviando…
                  </>
                ) : (
                  <>
                    <Icon name="send" size={19} />
                    Enviar
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        <aside className={styles.lateral}>
          <div className={styles.xp}>
            <Icon name="bolt" size={21} />
            <div>
              Cada envio rende <strong>+{XP_POR_ENVIO} XP</strong> (até {ENVIOS_COM_XP_POR_SEMANA} por semana). Sugestão que virar funcionalidade rende{' '}
              <strong>+1.000 XP</strong> e a badge Voz da Torcida.
              {historico.lista && (
                <div className={styles.xpSemana}>
                  {Math.min(usadosNaSemana, ENVIOS_COM_XP_POR_SEMANA)} de {ENVIOS_COM_XP_POR_SEMANA} envios com XP usados nesta semana
                </div>
              )}
            </div>
          </div>

          <section className={styles.historico} aria-labelledby="titulo-historico">
            <div className={styles.historicoTopo}>
              <h2 id="titulo-historico" className={styles.historicoTitulo}>
                O que você já mandou
              </h2>
              {historico.lista && (
                <span className={styles.historicoTotal}>{historico.lista.length === 1 ? '1 envio' : `${historico.lista.length} envios`}</span>
              )}
            </div>
            {historico.erro && !historico.lista && (
              <div className={styles.alerta}>
                <Alert
                  actions={
                    <button type="button" className={styles.tentar} onClick={historico.tentarDeNovo}>
                      Tentar de novo
                    </button>
                  }
                >
                  Não deu para carregar seus envios.
                </Alert>
              </div>
            )}
            {!historico.lista && !historico.erro && (
              <Carregando rotulo="Carregando seus envios">
                {[0, 1].map((i) => (
                  <div key={i} className={styles.envio}>
                    <Skeleton w={150} h={20} r={6} />
                    <Skeleton w="90%" h={11} r="pilula" style={{ marginTop: 9 }} />
                  </div>
                ))}
              </Carregando>
            )}
            {historico.lista?.length === 0 && <p className={styles.vazio}>Seus envios aparecem aqui, com o andamento e a resposta da equipe.</p>}
            {!!historico.lista?.length && (
              <ul className={styles.lista} aria-label="Seus envios">
                {historico.lista.map((f) => {
                  const estado = ESTADOS[f.estado] ?? ESTADOS.recebido;
                  return (
                    <li key={f.id} className={styles.envio}>
                      <div className={styles.envioTopo}>
                        <span className={styles.etiqueta}>{rotuloDoTipo(f.tipo)}</span>
                        <span className={styles.etiqueta} style={{ background: estado.fundo, color: estado.cor }}>
                          {estado.rotulo}
                        </span>
                        <span className={styles.envioData}>{diaEMes(f.criado_em)}</span>
                      </div>
                      <div className={styles.envioTexto}>{f.texto}</div>
                      {f.resposta && (
                        <div className={styles.resposta}>
                          <strong>Equipe:</strong> {f.resposta}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
