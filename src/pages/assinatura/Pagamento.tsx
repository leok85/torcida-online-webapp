import { CheckoutElementsProvider, PaymentElement, useCheckoutElements } from '@stripe/react-stripe-js/checkout';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { chamarFuncao } from '../../assinatura/funcoes';
import { formatarPreco, lerMoeda, lerPlano, PRECOS, type Moeda, type Plano } from '../../assinatura/planos';
import { Alert } from '../../components/form/Alert';
import { Button } from '../../components/form/Button';
import { Icon } from '../../components/ui/Icon';
import { carregarStripe } from '../../lib/stripe';
import ui from '../../styles/ui.module.css';
import { Passos } from './Passos';
import styles from './Assinatura.module.css';

type Sessao = { tipo: 'criando' } | { tipo: 'pronta'; clientSecret: string } | { tipo: 'erro' };

// Visual do formulário do Stripe alinhado ao design (fonte, azul primário, cantos).
const APARENCIA = {
  theme: 'stripe' as const,
  variables: { colorPrimary: '#00419b', colorText: '#091d37', colorDanger: '#e0342a', borderRadius: '11px', fontFamily: 'Manrope, system-ui, sans-serif' },
};
const FONTES = [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap' }];

/** W14 · pagamento com o formulário do Stripe embutido (Checkout Session em modo assinatura). */
export function Pagamento() {
  const { assinante } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const plano = lerPlano(params.get('plano'));
  const moeda = lerMoeda(params.get('moeda'));
  const [sessao, setSessao] = useState<Sessao>({ tipo: 'criando' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (assinante) return;
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
  }, [assinante, plano, moeda, tentativa, navigate]);

  const opcoes = useMemo(
    () => (sessao.tipo === 'pronta' ? { clientSecret: sessao.clientSecret, elementsOptions: { appearance: APARENCIA, fonts: FONTES } } : null),
    [sessao],
  );

  if (assinante) return <Navigate to="/conta/assinatura" replace />;

  return (
    <div className={styles.pagina}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Pagamento</h2>
        <span className={ui.pageSub}>Ambiente seguro. Os dados do cartão não ficam salvos com a gente.</span>
      </div>
      <Passos atual={2} />
      {sessao.tipo === 'erro' && (
        <section className={styles.aviso}>
          <Icon name="cloud_off" size={28} color="var(--muted)" />
          <div>
            <h3 className={ui.title}>Não deu para abrir o pagamento</h3>
            <p>Verifique sua conexão e tente de novo. Nada foi cobrado.</p>
            <Button fullWidth={false} variant="neutral" onClick={() => setTentativa((t) => t + 1)}>
              Tentar de novo
            </Button>
          </div>
        </section>
      )}
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
        <div className={styles.rotulo}>FORMA DE PAGAMENTO</div>
        <PaymentElement options={{ layout: 'tabs' }} />
        <p className={styles.renovacao}>
          <Icon name="autorenew" size={17} />A renovação é cobrada neste cartão no fim de cada período. Avisamos por e-mail antes.
        </p>
        {erro && <Alert>{erro}</Alert>}
      </section>
      <aside className={styles.resumo}>
        <div className={styles.resumoTopo}>
          <h3 className={ui.title}>Resumo</h3>
          <Link to={`/assinar?plano=${plano}&moeda=${moeda}`} className={styles.link}>
            Trocar plano
          </Link>
        </div>
        <div className={styles.resumoPlano}>
          <Icon name="workspace_premium" size={22} color="var(--primary)" />
          <div>
            <strong>Plano {plano}</strong>
            <span>{plano === 'anual' ? 'renova a cada 12 meses' : 'renova todo mês'}</span>
          </div>
        </div>
        <dl className={styles.linhas}>
          {plano === 'anual' && (
            <>
              <div>
                <dt>12 meses no mensal</dt>
                <dd>{formatarPreco(precos.mensal * 12, moeda)}</dd>
              </div>
              <div className={styles.desconto}>
                <dt>Desconto de 2 meses</dt>
                <dd>− {formatarPreco(precos.mensal * 12 - precos.anual, moeda)}</dd>
              </div>
            </>
          )}
          <div className={styles.total}>
            <dt>Total hoje</dt>
            <dd>{valor}</dd>
          </div>
        </dl>
        <Button variant="success" icon="lock" loading={enviando} onClick={pagar}>
          Pagar {valor}
        </Button>
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
