import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { chamarFuncao } from '../../assinatura/funcoes';
import { buscarAssinatura, buscarResumo, emAndamento, type ResumoDaCobranca } from '../../assinatura/minha';
import { anualPorMes, formatarPreco, PRECOS, type Moeda } from '../../assinatura/planos';
import { useAuth } from '../../auth/AuthContext';
import { Alert } from '../../components/form/Alert';
import { CodeInput } from '../../components/form/CodeInput';
import { Button } from '../../components/form/Button';
import { Icon } from '../../components/ui/Icon';
import { Carregando, Skeleton } from '../../components/ui/Skeleton';
import type { Assinatura } from '../../lib/database.types';
import styles from './MinhaAssinatura.module.css';

type Carga<T> = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'pronto'; dados: T };

const MOEDA: Moeda = 'BRL';
const LOJA: Record<string, string> = { apple: 'App Store', google: 'Google Play' };

const STATUS: Record<string, { rotulo: string; icone: string; tom: string }> = {
  ativa: { rotulo: 'ATIVA', icone: 'verified', tom: styles.seloOk },
  atrasada: { rotulo: 'PAGAMENTO PENDENTE', icone: 'error', tom: styles.seloAlerta },
  cancelada: { rotulo: 'CANCELADA', icone: 'event_busy', tom: styles.seloAlerta },
  pendente: { rotulo: 'AGUARDANDO PAGAMENTO', icone: 'schedule', tom: styles.seloAlerta },
};

const BENEFICIOS = [
  { icone: 'how_to_reg', texto: 'Palpites, escalação e notas' },
  { icone: 'forum', texto: 'Chat e fotos ao vivo' },
  { icone: 'bolt', texto: 'XP, nível e missões semanais' },
  { icone: 'monetization_on', texto: 'Moedas que podem ser trocadas nas lojas' },
  { icone: 'emoji_events', texto: 'Prêmios e sorteios' },
  { icone: 'leaderboard', texto: 'Ranking e conquistas' },
];

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
const preco = (valor: number, moeda: string) => formatarPreco(valor, (['BRL', 'USD', 'EUR'].includes(moeda) ? moeda : MOEDA) as Moeda);

function useCarga<T>(carregar: () => Promise<T>, versao: number) {
  const [estado, setEstado] = useState<Carga<T>>({ tipo: 'carregando' });
  useEffect(() => {
    let ativo = true;
    carregar().then(
      (dados) => ativo && setEstado({ tipo: 'pronto', dados }),
      () => ativo && setEstado({ tipo: 'erro' }),
    );
    return () => {
      ativo = false;
    };
    // carregar é uma função do módulo: só a versão pede recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao]);
  return estado;
}

/** W18 · Minha assinatura: a mais recente do torcedor (web, App Store ou Google Play) e as cobranças do web app. */
export function MinhaAssinatura() {
  const { atualizarAssinante } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [versao, setVersao] = useState(0);
  const assinatura = useCarga(buscarAssinatura, versao);
  const resumo = useCarga(buscarResumo, versao);
  const recarregar = () => setVersao((v) => v + 1);
  // Aviso rápido no rodapé da tela (W18): troca de e-mail, de plano ou de cartão.
  const [aviso, setAviso] = useState<string | null>(null);
  const avisar = (texto: string) => setAviso(texto);
  // Aviso trazido de outra tela (troca de plano, cartão novo); sai do histórico para não repetir ao recarregar.
  const avisoDaNavegacao = (location.state as { aviso?: string } | null)?.aviso;
  useEffect(() => {
    if (!avisoDaNavegacao) return;
    setAviso(avisoDaNavegacao);
    recarregar();
    navigate(location.pathname + location.search, { replace: true, state: null });
    // Só quando chega um aviso novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2200);
    return () => clearTimeout(t);
  }, [aviso]);

  // Volta do formulário de cartão quando o banco pede confirmação fora da página (?cartao=<sessão>).
  const sessaoDeCartao = params.get('cartao');
  const tratouSessao = useRef<string | null>(null);
  useEffect(() => {
    if (!sessaoDeCartao || tratouSessao.current === sessaoDeCartao) return;
    tratouSessao.current = sessaoDeCartao;
    navigate('/conta/assinatura', { replace: true });
    chamarFuncao('gerenciar-assinatura', { acao: 'definir-cartao', sessao: sessaoDeCartao }).then(async (r) => {
      if (!r.ok) return;
      await atualizarAssinante();
      recarregar();
      setAviso('Cartão atualizado');
    });
    // recarregar e atualizarAssinante não mudam o que esta tela pede.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessaoDeCartao]);

  return (
    <div className={styles.page}>
      <h1 className={styles.titulo}>Minha assinatura</h1>
      {assinatura.tipo === 'carregando' && (
        <Carregando rotulo="Carregando sua assinatura" className={styles.colunas}>
          <Skeleton h={300} r={16} />
          <Skeleton h={220} r={16} />
        </Carregando>
      )}
      {assinatura.tipo === 'erro' && (
        <section className={styles.aviso}>
          <Icon name="cloud_off" size={28} color="var(--muted)" />
          <div>
            <h2 className={styles.avisoTitulo}>Não deu para carregar sua assinatura</h2>
            <p className={styles.avisoTexto}>Verifique sua conexão e tente de novo.</p>
            <Button fullWidth={false} variant="neutral" onClick={recarregar}>
              Tentar de novo
            </Button>
          </div>
        </section>
      )}
      {assinatura.tipo === 'pronto' && (
        <div className={styles.colunas}>
          {emAndamento(assinatura.dados) ? (
            <ComAssinatura
              assinatura={assinatura.dados!}
              resumo={resumo.tipo === 'pronto' ? resumo.dados : null}
              onMudou={async () => {
                await atualizarAssinante();
                recarregar();
              }}
              onAviso={avisar}
            />
          ) : (
            <SemAssinatura expirada={!!assinatura.dados} />
          )}
          <div className={styles.lateral}>
            {!emAndamento(assinatura.dados) && (
              <div className={styles.cartao}>
                <div className={styles.dica}>
                  <Icon name="smartphone" size={22} />
                  <div>
                    <div className={styles.dicaTitulo}>Já assinou pelo app?</div>
                    <div className={styles.dicaTexto}>
                      A assinatura aparece aqui sozinha quando você entra com o mesmo login. Se não aparecer, abra o app e use "Restaurar compras" na tela de
                      planos.
                    </div>
                  </div>
                </div>
              </div>
            )}
            <Cobrancas resumo={resumo} onTentarDeNovo={recarregar} mostrarNotaDaLoja={emAndamento(assinatura.dados)} />
          </div>
        </div>
      )}
      {aviso && (
        <div className={styles.toast} role="status">
          <Icon name="check_circle" size={19} />
          {aviso}
        </div>
      )}
    </div>
  );
}

function SemAssinatura({ expirada }: { expirada: boolean }) {
  return (
    <section className={styles.cartao} aria-labelledby="titulo-sem-assinatura">
      <div className={styles.capa}>
        <div className={styles.capaSelo}>
          <Icon name="lock" size={18} />
          {expirada ? 'EXPIRADA' : 'SEM ASSINATURA'}
        </div>
        <h2 id="titulo-sem-assinatura" className={styles.capaTitulo}>
          {expirada ? 'Volte a ser membro' : 'Você ainda não é membro'}
        </h2>
        <p className={styles.capaTexto}>Hoje você acompanha jogos e notícias. Como membro, tudo que vale ponto fica liberado no app e no web app.</p>
      </div>
      <ul className={styles.beneficios}>
        {BENEFICIOS.map((b) => (
          <li key={b.icone}>
            <Icon name={b.icone} size={20} />
            {b.texto}
          </li>
        ))}
      </ul>
      <div className={styles.oferta}>
        <div className={styles.ofertaPreco}>
          <div className={styles.ofertaLinha}>
            <span className={styles.aPartirDe}>a partir de</span>
            <span className={styles.valor}>{formatarPreco(anualPorMes(MOEDA), MOEDA)}</span>
            <span className={styles.porMes}>/mês</span>
          </div>
          <div className={styles.ofertaDetalhe}>plano anual · {formatarPreco(PRECOS[MOEDA].anual, MOEDA)} · cancele quando quiser</div>
        </div>
        <Link to="/assinar" className={styles.verPlanos}>
          {expirada ? 'Assinar de novo' : 'Ver planos'}
          <Icon name="arrow_forward" size={19} />
        </Link>
      </div>
    </section>
  );
}

type ComAssinaturaProps = { assinatura: Assinatura; resumo: ResumoDaCobranca | null; onMudou: () => Promise<void>; onAviso: (texto: string) => void };

function ComAssinatura({ assinatura: a, resumo, onMudou, onAviso }: ComAssinaturaProps) {
  const navigate = useNavigate();
  const status = STATUS[a.status] ?? STATUS.ativa;
  const loja = LOJA[a.origem];
  const web = a.origem === 'web';
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(false);

  const valor = resumo?.plano ? preco(resumo.plano.valor, resumo.plano.moeda) : formatarPreco(PRECOS[MOEDA][a.plano === 'mensal' ? 'mensal' : 'anual'], MOEDA);
  const periodo = (resumo?.plano?.intervalo ?? (a.plano === 'mensal' ? 'mes' : 'ano')) === 'ano' ? 'por ano' : 'por mês';
  const quando =
    a.status === 'cancelada'
      ? `não renova · liberado até ${data(a.expira_em)}`
      : a.status === 'pendente'
        ? 'aguardando a confirmação do pagamento'
        : a.status === 'atrasada'
          ? 'pagamento pendente'
          : `renova em ${data(a.expira_em)}`;
  const detalhe = web ? `${valor} ${periodo} · ${quando}` : `pela ${loja} · ${quando}`;

  const reativar = async () => {
    setEnviando(true);
    setErro(false);
    const r = await chamarFuncao('gerenciar-assinatura', { acao: 'reativar' });
    setEnviando(false);
    if (!r.ok) return setErro(true);
    await onMudou();
  };
  // Como no design: trocar de plano passa pela tela de planos, e o cartão novo pela de pagamento.
  const outroPlano = a.plano === 'anual' ? 'mensal' : 'anual';
  const trocarPlano = () => navigate(`/assinar?plano=${outroPlano}`);
  const atualizarCartao = () => navigate('/assinar/pagamento?metodo=cartao');

  const pagamento = resumo?.pagamento;

  return (
    <section className={styles.cartao} aria-labelledby="titulo-plano">
      <div className={styles.plano}>
        <div className={styles.planoTextos}>
          <div className={status.tom}>
            <Icon name={status.icone} size={19} />
            {status.rotulo}
          </div>
          <h2 id="titulo-plano" className={styles.planoNome}>
            Plano {a.plano}
          </h2>
          <p className={styles.planoDetalhe}>{detalhe}</p>
        </div>
        {web && a.status === 'ativa' && (
          <button type="button" className={styles.trocarPlano} onClick={trocarPlano}>
            Trocar de plano
          </button>
        )}
      </div>

      {web && pagamento && (
        <div className={styles.item}>
          <Icon name={pagamento.tipo === 'pix' ? 'pix' : 'credit_card'} size={21} />
          <div className={styles.itemTextos}>
            <div className={styles.itemTitulo}>
              {pagamento.tipo === 'cartao' ? `Cartão •••• ${pagamento.final}` : pagamento.tipo === 'pix' ? 'Pix' : pagamento.nome}
            </div>
            <div className={styles.itemSub}>{pagamento.tipo === 'cartao' ? `${pagamento.bandeira} · expira ${pagamento.expira}` : 'pago a cada renovação'}</div>
          </div>
          <button type="button" className={styles.botaoBorda} onClick={atualizarCartao} aria-label="Atualizar forma de pagamento">
            Atualizar
          </button>
        </div>
      )}

      {web && <EmailDeCobranca email={resumo?.email ?? null} onTrocou={onMudou} onAviso={onAviso} />}

      {erro && (
        <div className={styles.erro} style={{ paddingTop: 18 }}>
          <Alert>Não deu para concluir agora. Tente de novo em instantes.</Alert>
        </div>
      )}

      <div className={styles.rodape}>
        {!web ? (
          <p className={styles.rodapeTexto}>
            Você assinou pela {loja}. Troca de plano e cancelamento ficam nos ajustes da {loja}.
          </p>
        ) : a.status === 'ativa' ? (
          <>
            <p className={styles.rodapeTexto}>Cancelando, você mantém tudo liberado até {data(a.expira_em)} e nada é cobrado depois disso.</p>
            <Link to="/conta/assinatura/cancelar" className={styles.cancelar}>
              Cancelar assinatura
            </Link>
          </>
        ) : a.status === 'cancelada' ? (
          <>
            <p className={styles.rodapeTexto}>Sua assinatura não renova. Tudo continua liberado até {data(a.expira_em)}.</p>
            <button type="button" className={styles.reativar} onClick={reativar} disabled={enviando} aria-busy={enviando || undefined}>
              Reativar assinatura
            </button>
          </>
        ) : a.status === 'atrasada' ? (
          <>
            <p className={styles.rodapeAlerta}>A última cobrança não passou. Atualize o cartão para não perder o acesso.</p>
            <button type="button" className={styles.reativar} onClick={atualizarCartao}>
              Atualizar cartão
            </button>
          </>
        ) : (
          <p className={styles.rodapeTexto}>Assim que o pagamento for confirmado, tudo fica liberado.</p>
        )}
      </div>
    </section>
  );
}

type EtapaDoEmail = 'ver' | 'editar' | 'codigo';
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ERROS_DO_EMAIL: Record<string, string> = {
  codigo_invalido: 'Código incorreto. Confira o e-mail e tente de novo.',
  codigo_expirado: 'O código expirou. Peça um novo em Reenviar.',
  muitas_tentativas: 'Muitas tentativas. Peça um novo código em Reenviar.',
  email_invalido: 'Confira o formato do e-mail.',
  email_indisponivel: 'O envio de e-mails está fora do ar. Tente mais tarde.',
};

/** W18 · onde receber os avisos de cobrança: o e-mail da conta ou outro, confirmado por código. */
function EmailDeCobranca({ email, onTrocou, onAviso }: { email: string | null; onTrocou: () => Promise<void>; onAviso: (texto: string) => void }) {
  const { sessao } = useAuth();
  const conta = sessao?.user.email ?? '';
  const atual = email ?? conta;
  const [etapa, setEtapa] = useState<EtapaDoEmail>('ver');
  const [opcao, setOpcao] = useState<'conta' | 'outro'>('conta');
  const [novo, setNovo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const outro = opcao === 'outro';
  const nv = novo.trim().toLowerCase();
  const formatoOk = EMAIL_VALIDO.test(nv);
  const igual = nv === atual.toLowerCase();
  const pode = outro ? formatoOk && !igual : atual.toLowerCase() !== conta.toLowerCase();
  const msg = !nv
    ? 'Enviaremos um código para confirmar o novo endereço.'
    : igual
      ? 'Esse já é o e-mail de cobrança.'
      : formatoOk
        ? 'Enviaremos um código para confirmar.'
        : 'Confira o formato do e-mail.';

  const abrir = () => {
    setEtapa('editar');
    setOpcao(atual.toLowerCase() === conta.toLowerCase() ? 'conta' : 'outro');
    setNovo('');
    setCodigo('');
    setErro(null);
  };

  const pedir = async (acao: string, corpo: object = {}) => {
    setEnviando(true);
    setErro(null);
    const r = await chamarFuncao<{ email?: string }>('gerenciar-assinatura', { acao, ...corpo });
    setEnviando(false);
    if (!r.ok) setErro(ERROS_DO_EMAIL[r.erro] ?? 'Não deu para concluir agora. Tente de novo.');
    return r.ok;
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!pode || enviando) return;
    if (outro) {
      if (await pedir('codigo-email', { email: nv })) {
        setCodigo('');
        setEtapa('codigo');
      }
      return;
    }
    if (await pedir('email-da-conta')) {
      setEtapa('ver');
      await onTrocou();
      onAviso('Avisos voltam para o e-mail da conta');
    }
  };

  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    if (codigo.length !== 6 || enviando) return;
    if (await pedir('confirmar-email', { codigo })) {
      setEtapa('ver');
      await onTrocou();
      onAviso(`Avisos de cobrança vão para ${nv}`);
    }
  };

  if (etapa === 'ver') {
    return (
      <div className={styles.item}>
        <Icon name="mail" size={21} />
        <div className={styles.itemTextos}>
          <div className={styles.itemTitulo}>Avisos de cobrança</div>
          <div className={styles.itemSub}>
            {atual} · {atual.toLowerCase() === conta.toLowerCase() ? 'e-mail da conta' : 'e-mail separado'}
          </div>
        </div>
        <button type="button" className={styles.botaoBorda} onClick={abrir} aria-label="Trocar e-mail de cobrança">
          Trocar
        </button>
      </div>
    );
  }

  if (etapa === 'codigo') {
    return (
      <form className={styles.edicao} onSubmit={confirmar} aria-label="Confirme o e-mail de cobrança">
        <div className={styles.edicaoTitulo}>Confirme o e-mail de cobrança</div>
        <p className={styles.edicaoCodigoTexto}>
          Digite o código de 6 dígitos enviado para <strong>{nv}</strong>. Até lá, os avisos continuam indo para {atual}.
        </p>
        <div className={styles.codigo}>
          <CodeInput length={6} value={codigo} onChange={setCodigo} error={!!erro} autoFocus />
        </div>
        {erro && <Alert>{erro}</Alert>}
        <div className={styles.edicaoLinks}>
          <span>
            Não chegou?{' '}
            <button type="button" className={styles.linkTexto} onClick={() => pedir('codigo-email', { email: nv })} disabled={enviando}>
              Reenviar
            </button>
          </span>
          <button type="button" className={styles.linkTexto} onClick={() => setEtapa('editar')}>
            Corrigir e-mail
          </button>
        </div>
        <div className={styles.edicaoBotoes}>
          <button type="button" className={styles.botaoCancelar} onClick={() => setEtapa('ver')}>
            Cancelar
          </button>
          <button type="submit" className={styles.botaoSalvar} disabled={codigo.length !== 6 || enviando} aria-busy={enviando || undefined}>
            Confirmar
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className={styles.edicao} onSubmit={salvar} aria-label="Onde receber os avisos de cobrança">
      <div className={styles.edicaoTopo}>
        <Icon name="mail" size={20} />
        <div className={styles.edicaoTitulo}>Onde receber os avisos de cobrança</div>
      </div>
      <p className={styles.edicaoTexto}>Recibos, avisos de renovação e falhas no pagamento. O login da conta continua o mesmo.</p>
      <div className={styles.opcoes} role="radiogroup" aria-label="E-mail de cobrança">
        {[
          { id: 'conta' as const, titulo: 'Usar o e-mail da conta', sub: conta },
          { id: 'outro' as const, titulo: 'Usar outro e-mail', sub: 'Por exemplo, o de quem paga a assinatura' },
        ].map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={opcao === o.id}
            className={opcao === o.id ? `${styles.opcao} ${styles.opcaoMarcada}` : styles.opcao}
            onClick={() => setOpcao(o.id)}
          >
            <span className={styles.radio} />
            <span className={styles.opcaoTextos}>
              <span className={styles.opcaoTitulo}>{o.titulo}</span>
              <span className={styles.opcaoSub}>{o.sub}</span>
            </span>
          </button>
        ))}
      </div>
      {outro && (
        <div>
          <label className={nv ? (formatoOk && !igual ? `${styles.campo} ${styles.campoOk}` : `${styles.campo} ${styles.campoErro}`) : styles.campo}>
            <Icon name="alternate_email" size={19} />
            <input type="email" value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="financeiro@email.com" aria-label="Novo e-mail de cobrança" autoFocus />
          </label>
          <div className={nv && (!formatoOk || igual) ? `${styles.campoMsg} ${styles.campoMsgErro}` : styles.campoMsg}>{msg}</div>
        </div>
      )}
      {erro && <Alert>{erro}</Alert>}
      <div className={styles.edicaoBotoes}>
        <button type="button" className={styles.botaoCancelar} onClick={() => setEtapa('ver')}>
          Cancelar
        </button>
        <button type="submit" className={styles.botaoSalvar} disabled={!pode || enviando} aria-busy={enviando || undefined}>
          {outro ? 'Enviar código' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

function Cobrancas({ resumo, onTentarDeNovo, mostrarNotaDaLoja }: { resumo: Carga<ResumoDaCobranca>; onTentarDeNovo: () => void; mostrarNotaDaLoja: boolean }) {
  return (
    <section className={styles.cartao} aria-labelledby="titulo-cobrancas">
      <h2 id="titulo-cobrancas" className={styles.cobrancasTitulo}>
        Cobranças
      </h2>
      {resumo.tipo === 'carregando' && (
        <Carregando rotulo="Carregando cobranças">
          {[0, 1].map((i) => (
            <div key={i} className={styles.cobranca}>
              <Skeleton w={20} h={20} r={6} />
              <div style={{ flex: 1 }}>
                <Skeleton w={90} h={12} r="pilula" />
                <Skeleton w={160} h={10} r="pilula" style={{ marginTop: 6 }} />
              </div>
              <Skeleton w={110} h={22} r="pilula" />
            </div>
          ))}
        </Carregando>
      )}
      {resumo.tipo === 'erro' && (
        <div className={styles.vazio}>
          <Icon name="cloud_off" size={28} />
          <div>Não deu para carregar as cobranças.</div>
          <button type="button" className={styles.tentar} onClick={onTentarDeNovo}>
            Tentar de novo
          </button>
        </div>
      )}
      {resumo.tipo === 'pronto' &&
        (resumo.dados.cobrancas.length === 0 ? (
          <div className={styles.vazio}>
            <Icon name="receipt_long" size={28} />
            <div>Nenhuma cobrança por aqui.</div>
          </div>
        ) : (
          <ul className={styles.lista} aria-label="Cobranças pagas">
            {resumo.dados.cobrancas.map((c) => (
              <li key={c.data} className={styles.cobranca}>
                <Icon name="receipt_long" size={20} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.cobrancaData}>
                    {c.recibo ? (
                      <a href={c.recibo} target="_blank" rel="noreferrer" aria-label={`Recibo de ${data(c.data)}`}>
                        {data(c.data)}
                      </a>
                    ) : (
                      data(c.data)
                    )}
                  </div>
                  <div className={styles.cobrancaDesc}>{c.descricao}</div>
                </div>
                <span className={styles.cobrancaValor}>{preco(c.valor, c.moeda)}</span>
                <span className={styles.pago}>PAGO</span>
              </li>
            ))}
          </ul>
        ))}
      {mostrarNotaDaLoja && <p className={styles.cobrancasNota}>Assinou pelo app? A gestão fica nos ajustes da App Store ou do Google Play.</p>}
    </section>
  );
}
