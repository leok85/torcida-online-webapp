import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Alert } from '../../components/form/Alert';
import { Crest } from '../../components/ui/Crest';
import { Icon } from '../../components/ui/Icon';
import { listarClubes, listarPaises, type Clube } from '../../data/clubes';
import { FLAG, SITE } from '../../data/common';
import { useCarga } from '../../data/useCarga';
import styles from './TrocarDeTime.module.css';
import { useMeuXp } from '../../xp/MeuXp';
import { xpEmTexto } from '../../data/xp';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "12 mar 2024", como no design. */
export function dataPorExtenso(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** W22 · trocar de time: uma única troca por conta, que marca o perfil como vira-casaca. */
export function TrocarDeTime() {
  const { perfil, atualizarPerfil } = useAuth();
  const { xp } = useMeuXp();
  const navigate = useNavigate();
  // Depois da troca o app inteiro remonta com o clube novo; a tela de sucesso vem pelo state da navegação.
  // Guardado no estado e tirado do histórico em seguida, para recarregar a página não repetir o sucesso.
  const [trocou] = useState((useLocation().state as { trocou?: string } | null)?.trocou);
  useEffect(() => {
    if (trocou) navigate('/conta/time', { replace: true, state: null });
  }, [trocou, navigate]);
  const [pais, setPais] = useState(perfil?.pais ?? 'BR');
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState<Clube | null>(null);
  const [ciente, setCiente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const paises = useCarga('paises', listarPaises);
  const clubes = useCarga(pais, listarClubes);

  if (!perfil) return null;
  const atual = perfil.clube?.nome ?? 'seu time';

  if (trocou && perfil.time_trocado_em) return <Concluida novoNome={trocou} apelido={perfil.apelido ?? ''} novoId={perfil.time_id} />;
  if (perfil.time_trocado_em) return <JaUsada anterior={perfil.clube_anterior?.nome ?? 'outro clube'} atual={atual} em={perfil.time_trocado_em} />;

  const nomePais = (codigo: string) => paises.dados?.find((p) => p.codigo === codigo)?.nome ?? codigo;
  const termo = busca.trim().toLowerCase();
  const lista = (clubes.dados ?? []).filter((c) => c.id !== perfil.time_id && (!termo || c.nome.toLowerCase().includes(termo)));
  const paisNovo = novo ? paises.dados?.find((p) => p.codigo === novo.pais) : undefined;
  const pode = !!novo && ciente && !enviando;
  const desde = perfil.onboarding_concluido_em ?? perfil.criado_em;

  async function confirmar() {
    if (!pode || !novo) return;
    setEnviando(true);
    setErro(null);
    // Marca a tela de sucesso antes de salvar: com o clube novo, esta tela é remontada do zero.
    navigate('/conta/time', { replace: true, state: { trocou: novo.nome } });
    const error = await atualizarPerfil({ time_id: novo.id });
    if (!error) return;
    navigate('/conta/time', { replace: true, state: null });
    setEnviando(false);
    setErro(error.hint === 'troca_usada' ? 'A troca de time desta conta já foi usada.' : 'Não foi possível trocar agora. Tente de novo.');
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.titulo}>Trocar de time</h2>
      <div className={styles.alerta}>
        <Icon name="warning" size={21} />
        <div>
          Você tem <strong>uma única troca</strong> em toda a conta. Depois dela seu perfil fica marcado como vira-casaca de forma permanente e
          visível para a torcida.
        </div>
      </div>

      <div className={styles.colunas}>
        <section className={styles.escolha} aria-labelledby="novo-time">
          <div>
            <h3 id="novo-time" className={styles.cardTitulo}>
              Novo time
            </h3>
            <div className={styles.cardSub}>Escolha o país e depois o clube. Clubes de {nomePais(pais)}.</div>
          </div>
          <div className={styles.paises} role="radiogroup" aria-label="País">
            {paises.dados?.map((p) => (
              <button
                key={p.codigo}
                type="button"
                role="radio"
                aria-checked={p.codigo === pais}
                className={p.codigo === pais ? `${styles.pais} ${styles.paisMarcado}` : styles.pais}
                onClick={() => {
                  setPais(p.codigo);
                  setBusca('');
                }}
              >
                <img src={FLAG(p.bandeira)} alt="" className={styles.bandeira} />
                {p.nome}
              </button>
            ))}
          </div>
          <label className={styles.busca}>
            <Icon name="search" size={19} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar clube" aria-label="Buscar clube" />
          </label>
          {clubes.erro && (
            <div className={styles.vazio}>
              Não deu para carregar os clubes.{' '}
              <button type="button" className={styles.link} onClick={clubes.tentarDeNovo}>
                Tentar de novo
              </button>
            </div>
          )}
          {!clubes.dados && !clubes.erro && <div className={styles.carregando} aria-busy="true" aria-label="Carregando clubes" />}
          {clubes.dados && lista.length === 0 && <div className={styles.vazio}>Nenhum clube encontrado.</div>}
          {lista.length > 0 && (
            <div className={styles.clubes} role="radiogroup" aria-label="Clube">
              {lista.map((c) => {
                const sel = novo?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    className={sel ? `${styles.clube} ${styles.clubeMarcado}` : styles.clube}
                    onClick={() => setNovo(c)}
                  >
                    <Crest width={36} height={41} clubeId={c.id} />
                    <span>{c.nome}</span>
                    {sel && <Icon name="check_circle" size={17} className={styles.marca} />}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <div className={styles.lateral}>
          <div className={styles.time}>
            <Crest width={42} height={48} tone="lightHome" clubeId={perfil.time_id} />
            <div className={styles.timeTextos}>
              <div className={styles.rotulo}>TIME ATUAL</div>
              <div className={styles.timeNome}>{atual}</div>
              <div className={styles.timeMeta}>desde {dataPorExtenso(desde)}
                {xp && ` · ${xpEmTexto(xp.xp_total)} XP`}</div>
            </div>
          </div>
          <Icon name="arrow_downward" size={22} className={styles.seta} />
          <div className={novo ? styles.time : `${styles.time} ${styles.timeVazio}`}>
            <Crest width={42} height={48} clubeId={novo?.id} />
            <div className={styles.timeTextos}>
              <div className={styles.rotulo}>NOVO TIME</div>
              <div className={novo ? styles.timeNome : `${styles.timeNome} ${styles.timeNomeVazio}`}>{novo?.nome ?? 'Escolha um clube'}</div>
              {novo && paisNovo && (
                <div className={styles.timePais}>
                  <img src={FLAG(paisNovo.bandeira)} alt="" />
                  {paisNovo.nome}
                </div>
              )}
            </div>
          </div>

          <section className={styles.muda} aria-labelledby="o-que-muda">
            <h3 id="o-que-muda" className={styles.cardTitulo}>
              O que muda
            </h3>
            <ul>
              <li>
                <Icon name="remove_circle" size={18} className={styles.perde} />
                Posição no ranking do {atual} (12º) e conquistas do clube
              </li>
              <li>
                <Icon name="remove_circle" size={18} className={styles.perde} />
                Acesso ao chat, às fotos e aos palpites da torcida antiga
              </li>
              <li>
                <Icon name="check_circle" size={18} className={styles.fica} />
                Nível, XP total, moedas e prêmios continuam com você
              </li>
              <li>
                <Icon name="check_circle" size={18} className={styles.fica} />A assinatura segue valendo, sem nova cobrança
              </li>
              {novo && paisNovo && novo.pais !== perfil.pais && (
                <li>
                  <Icon name="public" size={18} className={styles.mundo} />
                  Jogos, campeonatos e notícias passam a ser de {paisNovo.nome}
                </li>
              )}
            </ul>
          </section>

          <div className={styles.selo}>
            <span className={styles.viraCasaca}>VIRA-CASACA</span>
            <div>Esse selo passa a aparecer ao lado do seu apelido no chat e no ranking.</div>
          </div>
        </div>
      </div>

      <div className={styles.barra}>
        <button type="button" role="checkbox" aria-checked={ciente} className={styles.ciente} onClick={() => setCiente((c) => !c)}>
          <span className={ciente ? `${styles.caixa} ${styles.caixaMarcada}` : styles.caixa}>{ciente && <Icon name="check" size={16} />}</span>
          Entendi que a troca é definitiva e que meu perfil será marcado como vira-casaca.
        </button>
        <button type="button" className={styles.continuar} onClick={() => navigate('/conta/dados')}>
          Continuar no {atual}
        </button>
        <button type="button" className={styles.confirmar} disabled={!pode} aria-busy={enviando || undefined} onClick={confirmar}>
          Confirmar troca definitiva
        </button>
        {erro && (
          <div className={styles.erro}>
            <Alert>{erro}</Alert>
          </div>
        )}
      </div>
    </div>
  );
}

function Concluida({ novoNome, apelido, novoId }: { novoNome: string; apelido: string; novoId: number | null }) {
  const { xp } = useMeuXp();
  const navigate = useNavigate();
  return (
    <div className={styles.page}>
      <h2 className={styles.titulo}>Trocar de time</h2>
      <section className={styles.concluida} aria-labelledby="troca-concluida">
        <div className={styles.concluidaTopo}>
          <Crest width={64} height={72} tone="dark" clubeId={novoId} />
          <div className={styles.concluidaTextos}>
            <div className={styles.concluidaRotulo}>TROCA CONCLUÍDA</div>
            <h3 id="troca-concluida" className={styles.concluidaTitulo}>
              Agora você é {novoNome}
            </h3>
            <div className={styles.concluidaApelido}>
              <strong>@{apelido}</strong>
              <span className={styles.viraCasacaEscuro}>VIRA-CASACA</span>
            </div>
          </div>
        </div>
        <dl className={styles.mantidos}>
          <div>
            <dt>NÍVEL E XP</dt>
            <dd>{xp ? `Nível ${xp.nivel} · mantidos` : 'mantidos'}</dd>
          </div>
          <div>
            <dt>MOEDAS</dt>
            <dd>440 · mantidas</dd>
          </div>
          <div>
            <dt>RANKING</dt>
            <dd>Começa do zero</dd>
          </div>
        </dl>
        <div className={styles.concluidaRodape}>
          <p>Jogos, chat, missões e ranking já mostram o {novoNome}. No app, a mudança aparece na próxima abertura.</p>
          <button type="button" className={styles.primario} onClick={() => navigate('/')}>
            Ir para o início
          </button>
        </div>
      </section>
    </div>
  );
}

function JaUsada({ anterior, atual, em }: { anterior: string; atual: string; em: string }) {
  return (
    <div className={styles.page}>
      <h2 className={styles.titulo}>Trocar de time</h2>
      <section className={styles.usada} aria-labelledby="troca-usada">
        <span className={styles.cadeado}>
          <Icon name="lock" size={24} />
        </span>
        <div className={styles.usadaTextos}>
          <h3 id="troca-usada" className={styles.usadaTitulo}>
            Troca já utilizada
          </h3>
          <p>
            Você trocou do {anterior} para o {atual} em {new Date(em).toLocaleDateString('pt-BR')}. Cada conta tem direito a uma única troca,
            então o {atual} fica como seu time daqui em diante.
          </p>
          <div className={styles.usadaAcoes}>
            <Link to="/" className={styles.primarioLink}>
              Voltar ao início
            </Link>
            <a href={SITE.suporte} target="_blank" rel="noreferrer" className={styles.suporte}>
              Falar com o suporte
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
