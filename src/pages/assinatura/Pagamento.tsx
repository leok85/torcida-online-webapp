import { CheckoutElementsProvider, PaymentElement, useCheckoutElements } from '@stripe/react-stripe-js/checkout';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { chamarFuncao } from '../../assinatura/funcoes';
import { buscarResumo, doWebEmAndamento, useAssinaturaDoMembro, type ResumoDaCobranca } from '../../assinatura/minha';
import { formatarPreco, lerMoeda, lerPlano, PRECOS, type Moeda, type Plano } from '../../assinatura/planos';
import { Alert } from '../../components/form/Alert';
import { Button } from '../../components/form/Button';
import { Icon } from '../../components/ui/Icon';
import { carregarStripe } from '../../lib/stripe';
import ui from '../../styles/ui.module.css';
import type { Assinatura } from '../../lib/database.types';
import { Passos } from './Passos';
import styles from './Assinatura.module.css';

type Sessao = { tipo: 'criando' } | { tipo: 'pronta'; clientSecret: string } | { tipo: 'erro' };

// O formulário do Stripe com as medidas da W14: abas de 52px, campos de 46px com borda de 1.5px e rótulos de 11.5px.
const APARENCIA = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: '#00419b',
    colorText: '#091d37',
    colorTextSecondary: '#6e7c93',
    colorDanger: '#e0342a',
    borderRadius: '11px',
    fontFamily: 'Manrope, system-ui, sans-serif',
    fontSizeBase: '14px',
    spacingGridRow: '14px',
    spacingGridColumn: '14px',
  },
  rules: {
    '.Tab': { border: '1.5px solid #e1e7ef', borderRadius: '12px', boxShadow: 'none', padding: '14px', color: '#6e7c93' },
    '.Tab:hover': { color: '#00419b' },
    '.Tab--selected': { borderColor: '#00419b', backgroundColor: '#f8fbff', color: '#00419b', boxShadow: 'none' },
    '.Tab--selected:hover': { color: '#00419b' },
    '.TabLabel': { fontWeight: '800', fontSize: '14px' },
    '.Label': { fontSize: '11.5px', fontWeight: '700', color: '#33425c', marginBottom: '6px' },
    '.Input': { border: '1.5px solid #e1e7ef', borderRadius: '11px', padding: '12px 14px', boxShadow: 'none', fontSize: '14px' },
    '.Input:focus': { borderColor: '#00419b', boxShadow: 'none' },
  },
};
const FONTES = [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap' }];

/**
 * W14 · pagamento. Quem ainda não é membro assina aqui; quem já é chega de Minha assinatura para
 * trocar de plano (?plano=) ou cadastrar um cartão novo (?metodo=cartao).
 */
export function Pagamento() {
  const { assinante } = useAuth();
  const [params] = useSearchParams();
  const assinatura = useAssinaturaDoMembro(assinante);

  const metodo = params.get('metodo');
  const plano = params.get('plano');
  // Decidido uma vez por assinatura carregada: depois de trocar o plano, a tela não pode virar um redirecionamento
  // no meio da saída (ele substituiria a navegação que leva o aviso para Minha assinatura).
  const modo = useMemo((): 'carregando' | 'nova' | 'cartao' | 'troca' | 'sair' => {
    if (assinatura === undefined) return 'carregando';
    if (!assinante) return 'nova';
    if (!doWebEmAndamento(assinatura)) return 'sair';
    if (metodo === 'cartao') return 'cartao';
    if (assinatura!.status === 'ativa' && (plano === 'anual' || plano === 'mensal') && plano !== assinatura!.plano) return 'troca';
    return 'sair';
  }, [assinatura, assinante, metodo, plano]);

  if (modo === 'carregando') {
    return (
      <div className={styles.paginaPagamento}>
        <div className={styles.carregando} aria-busy="true" aria-label="Abrindo o pagamento" />
      </div>
    );
  }
  if (modo === 'nova') return <NovaAssinatura />;
  if (modo === 'cartao') return <CartaoNovo assinatura={assinatura!} />;
  if (modo === 'troca') return <TrocaDePlano assinatura={assinatura!} plano={plano as Plano} />;
  return <Navigate to="/conta/assinatura" replace />;
}

/** Cabeçalho da W14, igual nos três modos. */
function Cabecalho() {
  return (
    <div className={styles.cabecalho}>
      <h2>Pagamento</h2>
      <span>Ambiente seguro. Os dados do cartão não ficam salvos com a gente.</span>
    </div>
  );
}

function ErroAoAbrir({ onTentarDeNovo }: { onTentarDeNovo: () => void }) {
  return (
    <section className={styles.aviso}>
      <Icon name="cloud_off" size={28} color="var(--muted)" />
      <div>
        <h3 className={ui.title}>Não deu para abrir o pagamento</h3>
        <p>Verifique sua conexão e tente de novo. Nada foi cobrado.</p>
        <Button fullWidth={false} variant="neutral" onClick={onTentarDeNovo}>
          Tentar de novo
        </Button>
      </div>
    </section>
  );
}

function NovaAssinatura() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const plano = lerPlano(params.get('plano'));
  const moeda = lerMoeda(params.get('moeda'));
  const [sessao, setSessao] = useState<Sessao>({ tipo: 'criando' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    setSessao({ tipo: 'criando' });
    chamarFuncao<{ clientSecret: string }>('criar-checkout', { plano, moeda }).then((r) => {
      if (!ativo) return;
      if (r.ok) setSessao({ tipo: 'pronta', clientSecret: r.dados.clientSecret });
      else if (r.erro === 'ja_assinante') navigate('/conta/assinatura', { replace: true });
      else setSessao({ tipo: 'erro' });
    });
    return () => {
      ativo = false;
    };
  }, [plano, moeda, tentativa, navigate]);

  const opcoes = useMemo(
    () => (sessao.tipo === 'pronta' ? { clientSecret: sessao.clientSecret, elementsOptions: { appearance: APARENCIA, fonts: FONTES } } : null),
    [sessao],
  );

  return (
    <div className={styles.paginaPagamento}>
      <Cabecalho />
      <Passos atual={2} />
      {sessao.tipo === 'erro' && <ErroAoAbrir onTentarDeNovo={() => setTentativa((t) => t + 1)} />}
      {sessao.tipo === 'criando' && <div className={styles.carregando} aria-busy="true" aria-label="Abrindo o pagamento" />}
      {opcoes && (
        <CheckoutElementsProvider stripe={carregarStripe()} options={opcoes}>
          <Formulario plano={plano} moeda={moeda} />
        </CheckoutElementsProvider>
      )}
    </div>
  );
}

function Formulario({ plano, moeda }: { plano: Plano; moeda: Moeda }) {
  const resultado = useCheckoutElements();
  const navigate = useNavigate();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recusado, setRecusado] = useState(false);

  if (resultado.type === 'loading') return <div className={styles.carregando} aria-busy="true" aria-label="Abrindo o pagamento" />;
  if (resultado.type === 'error') return <Alert>{resultado.error.message}</Alert>;
  const { checkout } = resultado;

  const precos = PRECOS[moeda];
  const valor = formatarPreco(precos[plano], moeda);
  const hoje = new Date();
  const renovacao = new Date(hoje);
  if (plano === 'anual') renovacao.setFullYear(hoje.getFullYear() + 1);
  else renovacao.setMonth(hoje.getMonth() + 1);

  const pagar = async () => {
    setEnviando(true);
    setErro(null);
    const r = await checkout.confirm({ redirect: 'if_required' });
    setEnviando(false);
    if (r.type === 'success') {
      navigate(`/assinar/retorno?sessao=${r.session.id}`);
    } else if (r.error.code === 'paymentFailed') {
      setRecusado(true);
    } else {
      setErro(r.error.message);
    }
  };

  if (recusado) return <Recusado valor={valor} plano={plano} onTentarDeNovo={() => setRecusado(false)} />;

  return (
    <div className={styles.pagamento}>
      <section className={styles.formulario}>
        <div className={styles.rotuloForma}>FORMA DE PAGAMENTO</div>
        {/* O aviso de cobrança recorrente fica no quadro de renovação e nas letrinhas do resumo, como no design. */}
        <PaymentElement options={{ layout: 'tabs', terms: { card: 'never' } }} />
        <p className={styles.renovacao}>
          <Icon name="autorenew" size={19} />A renovação é cobrada neste cartão no fim de cada período. Avisamos por e-mail 3 dias antes.
        </p>
        {erro && <Alert>{erro}</Alert>}
      </section>
      <aside className={styles.resumo}>
        <div className={styles.resumoTopo}>
          <h3 className={styles.resumoTitulo}>Resumo</h3>
          <Link to={`/assinar?plano=${plano}&moeda=${moeda}`} className={styles.link}>
            Trocar plano
          </Link>
        </div>
        <div className={styles.resumoPlano}>
          <Icon name="workspace_premium" size={24} color="var(--primary)" />
          <div>
            <strong>Plano {plano}</strong>
            <span>renova em {renovacao.toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
        <dl className={styles.linhas}>
          {plano === 'anual' ? (
            <>
              <div>
                <dt>Plano anual</dt>
                <dd>{formatarPreco(precos.mensal * 12, moeda)}</dd>
              </div>
              <div className={styles.desconto}>
                <dt>Desconto de 2 meses</dt>
                <dd>− {formatarPreco(precos.mensal * 12 - precos.anual, moeda)}</dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>Plano mensal</dt>
                <dd>{valor}</dd>
              </div>
              <div className={styles.desconto}>
                <dt>Cobrança recorrente</dt>
                <dd>todo dia {hoje.getDate()}</dd>
              </div>
            </>
          )}
          <div className={styles.total}>
            <dt>Total hoje</dt>
            <dd>{valor}</dd>
          </div>
        </dl>
        <button type="button" className={styles.pagar} onClick={pagar} disabled={enviando} aria-busy={enviando || undefined}>
          <Icon name={enviando ? 'progress_activity' : 'lock'} size={20} className={enviando ? styles.girando : undefined} />
          Pagar {valor}
        </button>
        <p className={styles.letrinhas}>
          Ao pagar você concorda com os{' '}
          <a href="https://torcidaonline.com.br/termos-de-uso" target="_blank" rel="noreferrer">
            Termos de uso
          </a>
          . Cancele quando quiser em Minha assinatura.
        </p>
      </aside>
    </div>
  );
}

/** W17 · o banco recusou o cartão. Nada foi cobrado; dá para tentar outro cartão na mesma sessão. */
function Recusado({ valor, plano, onTentarDeNovo }: { valor: string; plano: Plano; onTentarDeNovo: () => void }) {
  return (
    <section className={styles.recusado}>
      <div className={styles.recusadoTopo}>
        <span className={styles.recusadoIcone}>
          <Icon name="close" size={24} />
        </span>
        <div>
          <div className={styles.eyebrowVermelho}>PAGAMENTO NÃO APROVADO</div>
          <h3 className={styles.recusadoTitulo}>O banco recusou o cartão</h3>
          <p>
            Plano {plano} · {valor}. Os motivos mais comuns são limite, cartão bloqueado para compras online ou dados digitados
            errado. Nada foi cobrado.
          </p>
        </div>
      </div>
      <div className={styles.recusadoOpcoes}>
        <div className={styles.rotulo}>COMO SEGUIR</div>
        <button type="button" className={styles.opcao} onClick={onTentarDeNovo}>
          <Icon name="credit_card" size={20} />
          <span>
            <strong>Tentar outro cartão</strong>
            <span>Seus dados do plano continuam selecionados.</span>
          </span>
          <Icon name="chevron_right" size={20} />
        </button>
        <a className={styles.opcao} href="https://torcidaonline.com.br/suporte" target="_blank" rel="noreferrer">
          <Icon name="support_agent" size={20} />
          <span>
            <strong>Falar com o suporte</strong>
            <span>Se o problema continuar com outros cartões.</span>
          </span>
          <Icon name="chevron_right" size={20} />
        </a>
      </div>
    </section>
  );
}

const dataCurta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

/** Cartão novo para a assinatura (Checkout em modo setup): nada é cobrado agora, salvo uma renovação pendente. */
function CartaoNovo({ assinatura }: { assinatura: Assinatura }) {
  const [sessao, setSessao] = useState<Sessao>({ tipo: 'criando' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    setSessao({ tipo: 'criando' });
    chamarFuncao<{ clientSecret: string }>('gerenciar-assinatura', { acao: 'sessao-cartao' }).then((r) => {
      if (ativo) setSessao(r.ok ? { tipo: 'pronta', clientSecret: r.dados.clientSecret } : { tipo: 'erro' });
    });
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  const opcoes = useMemo(
    () => (sessao.tipo === 'pronta' ? { clientSecret: sessao.clientSecret, elementsOptions: { appearance: APARENCIA, fonts: FONTES } } : null),
    [sessao],
  );

  return (
    <div className={styles.paginaPagamento}>
      <Cabecalho />
      {sessao.tipo === 'erro' && <ErroAoAbrir onTentarDeNovo={() => setTentativa((t) => t + 1)} />}
      {sessao.tipo === 'criando' && <div className={styles.carregando} aria-busy="true" aria-label="Abrindo o pagamento" />}
      {opcoes && (
        <CheckoutElementsProvider stripe={carregarStripe()} options={opcoes}>
          <FormularioDoCartao assinatura={assinatura} />
        </CheckoutElementsProvider>
      )}
    </div>
  );
}

function FormularioDoCartao({ assinatura: a }: { assinatura: Assinatura }) {
  const resultado = useCheckoutElements();
  const { atualizarAssinante } = useAuth();
  const navigate = useNavigate();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (resultado.type === 'loading') return <div className={styles.carregando} aria-busy="true" aria-label="Abrindo o pagamento" />;
  if (resultado.type === 'error') return <Alert>{resultado.error.message}</Alert>;
  const { checkout } = resultado;
  const atrasada = a.status === 'atrasada';

  const salvar = async () => {
    setEnviando(true);
    setErro(null);
    const r = await checkout.confirm({ redirect: 'if_required' });
    if (r.type !== 'success') {
      setEnviando(false);
      return setErro(r.error.message);
    }
    // Liga o cartão à assinatura já (o webhook também faz isso, se a aba fechar antes).
    const ligado = await chamarFuncao('gerenciar-assinatura', { acao: 'definir-cartao', sessao: r.session.id });
    setEnviando(false);
    if (!ligado.ok) return setErro('O cartão foi salvo, mas não deu para usá-lo na assinatura. Tente de novo.');
    navigate('/conta/assinatura', { state: { aviso: 'Cartão atualizado' } });
    await atualizarAssinante();
  };

  return (
    <div className={styles.pagamento}>
      <section className={styles.formulario}>
        <div className={styles.rotuloForma}>FORMA DE PAGAMENTO</div>
        <PaymentElement options={{ layout: 'tabs', terms: { card: 'never' } }} />
        <p className={styles.renovacao}>
          <Icon name="autorenew" size={19} />
          As próximas renovações são cobradas neste cartão. Avisamos por e-mail 3 dias antes.
        </p>
        {erro && <Alert>{erro}</Alert>}
      </section>
      <aside className={styles.resumo}>
        <div className={styles.resumoTopo}>
          <h3 className={styles.resumoTitulo}>Cartão novo</h3>
          <Link to="/conta/assinatura" className={styles.link}>
            Voltar
          </Link>
        </div>
        <div className={styles.resumoPlano}>
          <Icon name="workspace_premium" size={24} color="var(--primary)" />
          <div>
            <strong>Plano {a.plano}</strong>
            <span>{atrasada ? 'pagamento pendente' : `renova em ${dataCurta(a.expira_em)}`}</span>
          </div>
        </div>
        <dl className={styles.linhas}>
          <div className={styles.total}>
            <dt>{atrasada ? 'Cobrança pendente' : 'Cobrança hoje'}</dt>
            <dd>{atrasada ? 'neste cartão' : formatarPreco(0, 'BRL')}</dd>
          </div>
        </dl>
        <button type="button" className={styles.pagar} onClick={salvar} disabled={enviando} aria-busy={enviando || undefined}>
          <Icon name={enviando ? 'progress_activity' : 'lock'} size={20} className={enviando ? styles.girando : undefined} />
          Salvar cartão
        </button>
        <p className={styles.letrinhas}>
          {atrasada ? 'A cobrança que não passou é tentada de novo neste cartão.' : 'O cartão antigo deixa de ser usado nas renovações.'}
        </p>
      </aside>
    </div>
  );
}

type Previa = { plano: Plano; valor: number; credito: number; total: number; moeda: string; renova_em: string | null };
type CargaDaTroca = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'pronta'; previa: Previa; resumo: ResumoDaCobranca | null };

/** Troca de plano de quem já é membro: o Stripe cobra hoje o plano novo, descontando o que sobrou do atual. */
function TrocaDePlano({ assinatura: a, plano }: { assinatura: Assinatura; plano: Plano }) {
  const { atualizarAssinante } = useAuth();
  const navigate = useNavigate();
  const [carga, setCarga] = useState<CargaDaTroca>({ tipo: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recusado, setRecusado] = useState(false);

  useEffect(() => {
    let ativo = true;
    setCarga({ tipo: 'carregando' });
    Promise.all([chamarFuncao<Previa>('gerenciar-assinatura', { acao: 'previa-troca', plano }), buscarResumo().catch(() => null)]).then(([previa, resumo]) => {
      if (ativo) setCarga(previa.ok ? { tipo: 'pronta', previa: previa.dados, resumo } : { tipo: 'erro' });
    });
    return () => {
      ativo = false;
    };
  }, [plano, tentativa]);

  const moeda = (carga.tipo === 'pronta' && ['BRL', 'USD', 'EUR'].includes(carga.previa.moeda) ? carga.previa.moeda : 'BRL') as Moeda;
  const total = carga.tipo === 'pronta' ? formatarPreco(carga.previa.total, moeda) : '';

  const confirmar = async () => {
    setEnviando(true);
    setErro(null);
    const r = await chamarFuncao('gerenciar-assinatura', { acao: 'trocar-plano', plano });
    setEnviando(false);
    if (!r.ok) return r.erro === 'recusado' ? setRecusado(true) : setErro('Não deu para trocar agora. Nada foi cobrado; tente de novo.');
    // Sai antes de reler a assinatura: com o plano novo, esta tela não serve mais e redirecionaria sem o aviso.
    navigate('/conta/assinatura', { state: { aviso: `Plano ${plano} ativado` } });
    await atualizarAssinante();
  };

  return (
    <div className={styles.paginaPagamento}>
      <Cabecalho />
      <Passos atual={2} />
      {carga.tipo === 'erro' && <ErroAoAbrir onTentarDeNovo={() => setTentativa((t) => t + 1)} />}
      {carga.tipo === 'carregando' && <div className={styles.carregando} aria-busy="true" aria-label="Calculando a troca" />}
      {carga.tipo === 'pronta' && recusado && (
        <Recusado valor={total} plano={plano} onTentarDeNovo={() => navigate('/assinar/pagamento?metodo=cartao')} />
      )}
      {carga.tipo === 'pronta' && !recusado && (
        <div className={styles.pagamento}>
          <section className={styles.formulario}>
            <div className={styles.rotuloForma}>FORMA DE PAGAMENTO</div>
            <CartaoAtual resumo={carga.resumo} />
            <p className={styles.renovacao}>
              <Icon name="autorenew" size={19} />A troca vale agora. O que sobrou do plano {a.plano} vira desconto nesta cobrança, e as renovações seguem neste cartão.
            </p>
            {erro && <Alert>{erro}</Alert>}
          </section>
          <aside className={styles.resumo}>
            <div className={styles.resumoTopo}>
              <h3 className={styles.resumoTitulo}>Resumo</h3>
              <Link to={`/assinar?plano=${plano}`} className={styles.link}>
                Trocar plano
              </Link>
            </div>
            <div className={styles.resumoPlano}>
              <Icon name="workspace_premium" size={24} color="var(--primary)" />
              <div>
                <strong>Plano {plano}</strong>
                <span>renova em {dataCurta(carga.previa.renova_em)}</span>
              </div>
            </div>
            <dl className={styles.linhas}>
              <div>
                <dt>Plano {plano}</dt>
                <dd>{formatarPreco(carga.previa.valor, moeda)}</dd>
              </div>
              <div className={styles.desconto}>
                <dt>Crédito do plano {a.plano}</dt>
                <dd>− {formatarPreco(carga.previa.credito, moeda)}</dd>
              </div>
              <div className={styles.total}>
                <dt>Total hoje</dt>
                <dd>{total}</dd>
              </div>
            </dl>
            <button type="button" className={styles.pagar} onClick={confirmar} disabled={enviando} aria-busy={enviando || undefined}>
              <Icon name={enviando ? 'progress_activity' : 'lock'} size={20} className={enviando ? styles.girando : undefined} />
              {carga.previa.total > 0 ? `Pagar ${total}` : 'Confirmar troca'}
            </button>
            <p className={styles.letrinhas}>
              Ao trocar você concorda com os{' '}
              <a href="https://torcidaonline.com.br/termos-de-uso" target="_blank" rel="noreferrer">
                Termos de uso
              </a>
              . Cancele quando quiser em Minha assinatura.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

/** O cartão que a assinatura já usa, com o atalho para cadastrar outro. */
function CartaoAtual({ resumo }: { resumo: ResumoDaCobranca | null }) {
  const p = resumo?.pagamento;
  return (
    <div className={styles.cartaoAtual}>
      <Icon name={p?.tipo === 'pix' ? 'pix' : 'credit_card'} size={21} />
      <div className={styles.cartaoAtualTextos}>
        <strong>{p?.tipo === 'cartao' ? `Cartão •••• ${p.final}` : p?.tipo === 'pix' ? 'Pix' : 'Cartão da assinatura'}</strong>
        {p?.tipo === 'cartao' && <span>{`${p.bandeira} · expira ${p.expira}`}</span>}
      </div>
      <Link to="/assinar/pagamento?metodo=cartao" className={styles.cartaoAtualLink}>
        Usar outro cartão
      </Link>
    </div>
  );
}
