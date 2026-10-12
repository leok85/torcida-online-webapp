import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { chamarFuncao } from '../../assinatura/funcoes';
import { anualPorMes, formatarPreco, PRECOS, type Moeda } from '../../assinatura/planos';
import { useAuth } from '../../auth/AuthContext';
import { Alert } from '../../components/form/Alert';
import { Button } from '../../components/form/Button';
import { Icon } from '../../components/ui/Icon';
import { Carregando, Skeleton } from '../../components/ui/Skeleton';
import type { Assinatura } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import styles from './MinhaAssinatura.module.css';

/** O que a ação "resumo" de gerenciar-assinatura devolve (dados de cobrança do Stripe). */
export type ResumoDaCobranca = {
  email: string | null;
  plano: { valor: number; moeda: string; intervalo: 'ano' | 'mes' } | null;
  pagamento: { tipo: 'cartao'; bandeira: string; final: string; expira: string } | { tipo: 'pix' } | { tipo: 'outro'; nome: string } | null;
  cobrancas: { data: string; descricao: string; valor: number; moeda: string; recibo: string | null }[];
};

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

/** Dá acesso: ativa, atrasada ou cancelada ainda no prazo, ou aguardando o primeiro pagamento. */
const emAndamento = (a: Assinatura | null) =>
  !!a && (a.status === 'pendente' || (['ativa', 'atrasada', 'cancelada'].includes(a.status) && !!a.expira_em && new Date(a.expira_em) > new Date()));

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

async function buscarAssinatura() {
  const { data: assinatura, error } = await supabase.from('assinaturas').select('*').order('criado_em', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return assinatura;
}

async function buscarResumo() {
  const r = await chamarFuncao<ResumoDaCobranca>('gerenciar-assinatura', { acao: 'resumo' });
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
}

/** W18 · Minha assinatura: a mais recente do torcedor (web, App Store ou Google Play) e as cobranças do web app. */
export function MinhaAssinatura() {
  const { atualizarAssinante } = useAuth();
  const [versao, setVersao] = useState(0);
  const assinatura = useCarga(buscarAssinatura, versao);
  const resumo = useCarga(buscarResumo, versao);
  const recarregar = () => setVersao((v) => v + 1);

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

function ComAssinatura({ assinatura: a, resumo, onMudou }: { assinatura: Assinatura; resumo: ResumoDaCobranca | null; onMudou: () => Promise<void> }) {
  const { sessao } = useAuth();
  const status = STATUS[a.status] ?? STATUS.ativa;
  const loja = LOJA[a.origem];
  const web = a.origem === 'web';
  const [enviando, setEnviando] = useState<'portal' | 'reativar' | null>(null);
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

  const agir = async (acao: 'portal' | 'reativar') => {
    setEnviando(acao);
    setErro(false);
    const r = await chamarFuncao<{ url?: string }>('gerenciar-assinatura', { acao });
    if (r.ok && acao === 'portal' && r.dados.url) return window.location.assign(r.dados.url);
    setEnviando(null);
    if (!r.ok) return setErro(true);
    await onMudou();
  };
  const portal = () => agir('portal');

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
          <button type="button" className={styles.trocarPlano} onClick={portal} disabled={enviando !== null}>
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
          <button type="button" className={styles.linkAcao} onClick={portal} disabled={enviando !== null} aria-label="Atualizar forma de pagamento">
            Atualizar
          </button>
        </div>
      )}

      {web && (
        <div className={styles.item}>
          <Icon name="mail" size={21} />
          <div className={styles.itemTextos}>
            <div className={styles.itemTitulo}>Avisos de cobrança</div>
            <div className={styles.itemSub}>{resumo?.email ?? sessao?.user.email}</div>
          </div>
          <button type="button" className={styles.linkAcao} onClick={portal} disabled={enviando !== null} aria-label="Trocar e-mail de cobrança">
            Trocar
          </button>
        </div>
      )}

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
            <button type="button" className={styles.reativar} onClick={() => agir('reativar')} disabled={enviando !== null} aria-busy={enviando === 'reativar' || undefined}>
              Reativar assinatura
            </button>
          </>
        ) : a.status === 'atrasada' ? (
          <>
            <p className={styles.rodapeAlerta}>A última cobrança não passou. Atualize o cartão para não perder o acesso.</p>
            <button type="button" className={styles.reativar} onClick={portal} disabled={enviando !== null}>
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
