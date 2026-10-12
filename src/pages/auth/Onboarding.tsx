import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useApelido } from '../../auth/validacao';
import { Alert } from '../../components/form/Alert';
import { Button } from '../../components/form/Button';
import { CampoCidade, type ValorCidade } from '../../components/form/CampoCidade';
import { Checkbox } from '../../components/form/Checkbox';
import { TextField } from '../../components/form/TextField';
import { Crest } from '../../components/ui/Crest';
import { Icon } from '../../components/ui/Icon';
import { PAISES_COM_CIDADES, rotuloCidade } from '../../data/cidades';
import { listarClubes, listarPaises, type Clube } from '../../data/clubes';
import { useCarga } from '../../data/useCarga';
import { FLAG, SITE } from '../../data/common';
import { cidadeDaLocalizacao } from '../../data/localizacao';
import layout from './AuthLayout.module.css';
import styles from './Onboarding.module.css';

type Etapa = 1 | 2;

const ETAPAS = { 1: 'país', 2: 'clube e cidade' } as const;


/** Agrupa os clubes (já ordenados por divisão) pela liga, mantendo a ordem. */
function porLiga(clubes: Clube[]) {
  const grupos: { liga: string; clubes: Clube[] }[] = [];
  for (const c of clubes) {
    const liga = c.liga?.nome ?? 'Outros clubes';
    const grupo = grupos.at(-1)?.liga === liga ? grupos.at(-1)! : (grupos.push({ liga, clubes: [] }), grupos.at(-1)!);
    grupo.clubes.push(c);
  }
  return grupos;
}

function ErroDeCarga({ onTentarDeNovo }: { onTentarDeNovo: () => void }) {
  return (
    <div className={styles.empty}>
      <p>Não deu para carregar a lista agora. Verifique sua conexão.</p>
      <Button variant="neutral" fullWidth={false} onClick={onTentarDeNovo}>
        Tentar de novo
      </Button>
    </div>
  );
}

/**
 * W00 · onboarding em duas etapas, no cartão sobre o fundo escuro: país, depois clube e cidade.
 * Nome, apelido e aceites já vêm do cadastro; só quem entrou pelo Google (sem apelido ou aceites) completa aqui.
 * Ao entrar na torcida, quem não é membro vê a oferta de planos.
 */
export function Onboarding() {
  const { perfil, assinante, atualizarPerfil } = useAuth();
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [pais, setPais] = useState(perfil?.pais ?? null);
  const [timeId, setTimeId] = useState(perfil?.time_id ?? null);
  const [busca, setBusca] = useState('');
  const [cidade, setCidade] = useState<ValorCidade>({
    texto: perfil?.cidade ?? '',
    cidade: perfil?.cidade_id ? { id: perfil.cidade_id, nome: perfil.cidade ?? '', regiao: null } : null,
  });
  const [localizando, setLocalizando] = useState(false);
  const [erroLocalizacao, setErroLocalizacao] = useState(false);
  const [apelidoDigitado, setApelido] = useState(perfil?.apelido ?? '');
  const [maiorDeIdade, setMaiorDeIdade] = useState(false);
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [destino, setDestino] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const apelido = useApelido(apelidoDigitado);
  const paises = useCarga('paises', listarPaises);
  const clubes = useCarga(pais, listarClubes);

  // Ao concluir, o perfil atualizado cai aqui: vai para a oferta de planos (ou direto ao início, para membros).
  if (!perfil || perfil.onboarding_concluido_em) return <Navigate to={destino ?? '/'} replace />;

  // Quem entrou pelo Google não passou pelo cadastro por e-mail; e um apelido já em uso fica vazio no cadastro.
  const faltaApelido = !perfil.apelido;
  const precisaAceites = !perfil.termos_aceitos_em;
  const nomePais = paises.dados?.find((p) => p.codigo === pais)?.nome;
  const termoBusca = busca.trim().toLowerCase();
  const encontrados = clubes.dados?.filter((c) => !termoBusca || c.nome.toLowerCase().includes(termoBusca)) ?? [];
  const clube = clubes.dados?.find((c) => c.id === timeId);
  const comCatalogo = !!pais && PAISES_COM_CIDADES.includes(pais);
  // No Brasil a cidade vem da lista do IBGE; nos outros países, o texto livre vale.
  const cidadeOk = comCatalogo ? !!cidade.cidade : cidade.texto.trim().length >= 2;
  const extrasOk = (!faltaApelido || apelido.ok) && (!precisaAceites || (maiorDeIdade && aceitouTermos));
  const podeEntrar = !!clube && cidadeOk && extrasOk;

  function escolherPais(codigo: string) {
    if (codigo !== pais) {
      setTimeId(null);
      setBusca('');
      setCidade({ texto: '', cidade: null });
    }
    setPais(codigo);
  }

  async function usarLocalizacao() {
    setLocalizando(true);
    setErroLocalizacao(false);
    try {
      setCidade(await cidadeDaLocalizacao(pais!, comCatalogo));
    } catch {
      setErroLocalizacao(true);
    } finally {
      setLocalizando(false);
    }
  }

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (!podeEntrar || !pais) return;
    setDestino(assinante ? '/' : '/assinar');
    setErro(null);
    const agora = new Date().toISOString();
    const error = await atualizarPerfil({
      pais,
      time_id: timeId,
      cidade: comCatalogo ? rotuloCidade(cidade.cidade!) : cidade.texto.trim(),
      cidade_id: comCatalogo ? cidade.cidade!.id : null,
      ...(faltaApelido && { apelido: apelido.limpo }),
      ...(precisaAceites && { termos_aceitos_em: agora }),
      onboarding_concluido_em: agora,
    });
    if (!error) return;
    setDestino(null);
    setErro(error.code === '23505' ? 'Esse apelido acabou de ser escolhido por outra pessoa. Tente outro.' : 'Não foi possível salvar agora. Tente de novo.');
  }

  const salvando = destino !== null;

  return (
    <div className={layout.page}>
      <div className={layout.backdrop} aria-hidden="true">
        <span>A torcida</span>
        <span className={layout.backdropGreen}>joga junto</span>
      </div>

      <main className={layout.main}>
        <form className={styles.card} onSubmit={entrar} noValidate>
          <header className={styles.cardTop}>
            <img src="/logo-horizontal.png" alt="Torcida Online" className={styles.logo} />
            <span className={styles.stepLabel}>
              Etapa {etapa} de 2 · {ETAPAS[etapa]}
            </span>
          </header>
          <div className={styles.progress} role="progressbar" aria-valuemin={1} aria-valuemax={2} aria-valuenow={etapa}>
            <span className={`${styles.segment} ${styles.segmentOn}`} />
            <span className={etapa === 2 ? `${styles.segment} ${styles.segmentOn}` : styles.segment} />
          </div>

          <div className={styles.body}>
            {etapa === 1 && (
              <>
                <h1 className={styles.title}>De qual país você torce?</h1>
                <p className={styles.lead}>Isso define a lista de clubes do próximo passo.</p>
                {paises.erro && <ErroDeCarga onTentarDeNovo={paises.tentarDeNovo} />}
                {!paises.dados && !paises.erro && <div className={styles.carregando} aria-busy="true" aria-label="Carregando países" />}
                <div className={`${styles.lista} ${styles.countries}`}>
                  {paises.dados?.map((p) => {
                    const sel = p.codigo === pais;
                    return (
                      <button
                        key={p.codigo}
                        type="button"
                        className={sel ? `${styles.option} ${styles.selected}` : styles.option}
                        aria-pressed={sel}
                        onClick={() => escolherPais(p.codigo)}
                      >
                        <span className={styles.countryTop}>
                          <img src={FLAG(p.bandeira)} alt="" className={styles.flag} />
                          {sel && <Icon name="check_circle" size={19} color="var(--primary)" />}
                        </span>
                        <span className={styles.optionName}>{p.nome}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {etapa === 2 && (
              <>
                <h1 className={styles.title}>Escolha seu time de coração</h1>
                <p className={styles.lead}>Depois disso, você só verá jogos e torcedores deste clube. A troca é permitida uma única vez.</p>
                <TextField
                  icon="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={nomePais ? `Buscar clube ${nomePais === 'Brasil' ? 'no' : 'em'} ${nomePais}` : 'Buscar clube'}
                  aria-label="Buscar clube"
                />
                {clubes.erro && <ErroDeCarga onTentarDeNovo={clubes.tentarDeNovo} />}
                {!clubes.dados && !clubes.erro && <div className={styles.carregando} aria-busy="true" aria-label="Carregando clubes" />}
                {clubes.dados && encontrados.length === 0 && <div className={styles.empty}>Nenhum clube encontrado com “{busca.trim()}”.</div>}
                {encontrados.length > 0 && (
                  <div className={styles.lista}>
                    {porLiga(encontrados).map((grupo) => (
                      <section key={grupo.liga} className={styles.liga} aria-label={grupo.liga}>
                        <h2 className={styles.ligaNome}>{grupo.liga}</h2>
                        <div className={styles.clubs}>
                          {grupo.clubes.map((c) => {
                            const sel = c.id === timeId;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                className={sel ? `${styles.option} ${styles.club} ${styles.selected}` : `${styles.option} ${styles.club}`}
                                aria-pressed={sel}
                                onClick={() => setTimeId(c.id)}
                              >
                                <Crest width={34} height={38} tone={sel ? 'lightHome' : 'light'} clubeId={c.id} />
                                <span className={styles.optionName}>{c.nome}</span>
                                {sel && <Icon name="check_circle" size={17} color="var(--primary)" className={styles.check} />}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                )}

                <div className={styles.cidadeLinha}>
                  <div>
                    <CampoCidade
                      label="Sua cidade"
                      valor={cidade}
                      onChange={setCidade}
                      comCatalogo={comCatalogo}
                      pais={pais ?? 'BR'}
                      error={erroLocalizacao ? 'Não deu para descobrir sua cidade. Digite o nome dela.' : null}
                    />
                    <button type="button" className={styles.localizacao} onClick={usarLocalizacao} disabled={localizando}>
                      <Icon name="my_location" size={15} />
                      {localizando ? 'Localizando…' : 'Usar minha localização'}
                    </button>
                  </div>
                  <div className={styles.warn}>
                    <Icon name="warning" size={17} color="var(--gold)" />
                    <div>
                      Trocar de time depois marca seu perfil como <strong>vira-casaca</strong> para toda a torcida.
                    </div>
                  </div>
                </div>

                {(faltaApelido || precisaAceites) && (
                  <div className={styles.extras}>
                    {faltaApelido && (
                      <TextField
                        label="Apelido na torcida"
                        value={apelidoDigitado}
                        onChange={(e) => setApelido(e.target.value)}
                        autoCapitalize="none"
                        spellCheck={false}
                        maxLength={20}
                        pending={apelido.status === 'verificando'}
                        error={apelido.erro}
                        success={apelido.ok ? 'Apelido disponível.' : null}
                        hint="É assim que a torcida vai te ver no chat e no ranking."
                      />
                    )}
                    {precisaAceites && (
                      <div className={styles.consents}>
                        <Checkbox checked={maiorDeIdade} onChange={setMaiorDeIdade}>
                          Tenho 18 anos ou mais.
                        </Checkbox>
                        <Checkbox checked={aceitouTermos} onChange={setAceitouTermos}>
                          Li e aceito os{' '}
                          <a href={SITE.termos} target="_blank" rel="noreferrer">
                            Termos de uso
                          </a>{' '}
                          e a{' '}
                          <a href={SITE.privacidade} target="_blank" rel="noreferrer">
                            Política de privacidade
                          </a>
                          .
                        </Checkbox>
                      </div>
                    )}
                  </div>
                )}
                {erro && <Alert>{erro}</Alert>}
              </>
            )}
          </div>

          <footer className={styles.footer}>
            {etapa === 2 && (
              <Button variant="neutral" fullWidth={false} className={styles.backBtn} onClick={() => setEtapa(1)} disabled={salvando}>
                Voltar
              </Button>
            )}
            <span className={styles.resumo}>
              {etapa === 1
                ? nomePais
                  ? `${nomePais} selecionado`
                  : 'Escolha um país'
                : [clube?.nome, cidade.texto.trim()].filter(Boolean).join(' · ') || 'Escolha seu clube'}
            </span>
            {/* A key troca o elemento: se o mesmo <button> virasse submit no meio do clique em "Continuar",
                o navegador submeteria a etapa 2 que acabou de aparecer. */}
            {etapa === 1 ? (
              <Button key="continuar" fullWidth={false} className={styles.nextBtn} disabled={!pais} iconRight="arrow_forward" onClick={() => setEtapa(2)}>
                Continuar
              </Button>
            ) : (
              <Button key="entrar" type="submit" fullWidth={false} className={styles.nextBtn} disabled={!podeEntrar} loading={salvando} iconRight="arrow_forward">
                Entrar na torcida
              </Button>
            )}
          </footer>
        </form>
      </main>
    </div>
  );
}
