import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useApelido } from '../../auth/validacao';
import { Alert } from '../../components/form/Alert';
import { Button } from '../../components/form/Button';
import { Checkbox } from '../../components/form/Checkbox';
import { TextField } from '../../components/form/TextField';
import { Crest } from '../../components/ui/Crest';
import { Icon } from '../../components/ui/Icon';
import { CLUBES, clubePorId, PAISES } from '../../data/clubes';
import { FLAG, SITE } from '../../data/common';
import ui from '../../styles/ui.module.css';
import styles from './Onboarding.module.css';

type Etapa = 1 | 2 | 3;

const IDADE_MINIMA = 18;

function idade(iso: string) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const hoje = new Date();
  const fezAniversario = hoje.getMonth() + 1 > mes || (hoje.getMonth() + 1 === mes && hoje.getDate() >= dia);
  return hoje.getFullYear() - ano - (fezAniversario ? 0 : 1);
}

function dataLimite() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - IDADE_MINIMA);
  return d.toISOString().slice(0, 10);
}

export function Onboarding() {
  const { perfil, sessao, atualizarPerfil, sair } = useAuth();
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [pais, setPais] = useState(perfil?.pais ?? null);
  const [timeId, setTimeId] = useState(perfil?.time_id ?? null);
  const [busca, setBusca] = useState('');
  const [nome, setNome] = useState(perfil?.nome ?? '');
  const [apelidoDigitado, setApelido] = useState(perfil?.apelido ?? '');
  const [nascimento, setNascimento] = useState(perfil?.nascimento ?? '');
  const [cidade, setCidade] = useState(perfil?.cidade ?? '');
  const [avisos, setAvisos] = useState(perfil?.quer_avisos ?? true);
  const [maiorDeIdade, setMaiorDeIdade] = useState(false);
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const apelido = useApelido(apelidoDigitado);

  // Ao concluir, o perfil atualizado no contexto cai aqui e leva para o app.
  if (!perfil || perfil.onboarding_concluido_em) return <Navigate to="/" replace />;

  // Quem entrou pelo Google ainda não passou pelos aceites do cadastro por e-mail.
  const precisaAceites = !perfil.termos_aceitos_em;
  const termoBusca = busca.trim().toLowerCase();
  const clubes = CLUBES.filter((c) => c.pais === pais && (!termoBusca || c.nome.toLowerCase().includes(termoBusca)));
  const nascimentoErro = nascimento && idade(nascimento) < IDADE_MINIMA ? `Você precisa ter ${IDADE_MINIMA} anos ou mais.` : null;
  const dadosOk = !!nome.trim() && apelido.ok && !nascimentoErro && (!precisaAceites || (maiorDeIdade && aceitouTermos));
  const podeAvancar = etapa === 1 ? !!pais : etapa === 2 ? !!timeId : dadosOk;

  function escolherPais(codigo: string) {
    setPais(codigo);
    if (clubePorId(timeId)?.pais !== codigo) setTimeId(null);
  }

  async function concluir(e?: FormEvent) {
    e?.preventDefault();
    if (!dadosOk || !pais || !timeId) return;
    setSalvando(true);
    setErro(null);
    const agora = new Date().toISOString();
    const error = await atualizarPerfil({
      nome: nome.trim(),
      apelido: apelido.limpo,
      pais,
      time_id: timeId,
      nascimento: nascimento || null,
      cidade: cidade.trim() || null,
      quer_avisos: avisos,
      ...(precisaAceites && { termos_aceitos_em: agora }),
      onboarding_concluido_em: agora,
    });
    if (!error) return;
    setSalvando(false);
    setErro(error.code === '23505' ? 'Esse apelido acabou de ser escolhido por outra pessoa. Tente outro.' : 'Não foi possível salvar agora. Tente de novo.');
  }

  function avancar() {
    if (!podeAvancar) return;
    if (etapa < 3) setEtapa((etapa + 1) as Etapa);
    else concluir();
  }

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.brand}>
          <img src="/icon-color.png" alt="" />
          Torcida Online
        </div>
        <div className={styles.stepLabel}>{etapa} de 3</div>
        <button type="button" className={styles.logout} onClick={sair}>
          <Icon name="logout" size={18} />
          Sair
        </button>
      </header>
      <div className={styles.progress} role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={etapa}>
        {[1, 2, 3].map((s) => (
          <div key={s} className={s <= etapa ? `${styles.segment} ${styles.segmentOn}` : styles.segment} />
        ))}
      </div>

      <main className={styles.body}>
        <div className={styles.inner}>
          {etapa === 1 && (
            <>
              <h1 className={styles.title}>De qual país você torce?</h1>
              <p className={styles.lead}>Isso define a lista de clubes do próximo passo.</p>
              <div className={styles.countries}>
                {PAISES.map((p) => {
                  const sel = p.codigo === pais;
                  return (
                    <button
                      key={p.codigo}
                      type="button"
                      className={sel ? `${styles.option} ${styles.selected}` : styles.option}
                      aria-pressed={sel}
                      onClick={() => escolherPais(p.codigo)}
                    >
                      <div className={styles.countryTop}>
                        <img src={FLAG(p.bandeira)} alt="" className={styles.flag} />
                        {sel && <Icon name="check_circle" size={21} color="var(--primary)" filled />}
                      </div>
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
              <div className={styles.search}>
                <TextField icon="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar clube" aria-label="Buscar clube" autoFocus />
              </div>
              {clubes.length === 0 ? (
                <div className={styles.empty}>Nenhum clube encontrado com “{busca.trim()}”.</div>
              ) : (
                <div className={styles.clubs}>
                  {clubes.map((c) => {
                    const sel = c.id === timeId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={sel ? `${styles.option} ${styles.club} ${styles.selected}` : `${styles.option} ${styles.club}`}
                        aria-pressed={sel}
                        onClick={() => setTimeId(c.id)}
                      >
                        <Crest width={44} height={50} tone={sel ? 'lightHome' : 'light'} />
                        <span className={styles.optionName}>{c.nome}</span>
                        {sel && <Icon name="check_circle" size={19} color="var(--primary)" filled className={styles.check} />}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className={styles.warn}>
                <Icon name="warning" size={19} color="var(--gold)" />
                <div>
                  Trocar de time depois marca seu perfil como <strong>vira-casaca</strong> para toda a torcida.
                </div>
              </div>
            </>
          )}

          {etapa === 3 && (
            <form id="onboarding-dados" onSubmit={concluir} noValidate>
              <h1 className={styles.title}>Seus dados</h1>
              <p className={styles.lead}>Confira como você vai aparecer para a torcida.</p>
              {erro && (
                <div className={styles.alert}>
                  <Alert>{erro}</Alert>
                </div>
              )}
              <div className={styles.fields}>
                <TextField label="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={80} />
                <TextField
                  label="Apelido na torcida"
                  value={apelidoDigitado}
                  onChange={(e) => setApelido(e.target.value)}
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={20}
                  pending={apelido.status === 'verificando'}
                  error={apelido.erro}
                  success={apelido.ok && apelido.limpo !== perfil.apelido ? 'Apelido disponível.' : null}
                  hint={
                    !perfil.apelido && !precisaAceites
                      ? 'O apelido escolhido no cadastro já estava em uso. Escolha outro.'
                      : 'É assim que a torcida vai te ver no chat e no ranking.'
                  }
                />
                <div className={styles.full}>
                  <TextField label="E-mail" value={sessao?.user.email ?? ''} disabled />
                </div>
                <TextField
                  label="Nascimento"
                  type="date"
                  value={nascimento}
                  onChange={(e) => setNascimento(e.target.value)}
                  min="1900-01-01"
                  max={dataLimite()}
                  error={nascimentoErro}
                  hint="Opcional."
                />
                <TextField label="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} autoComplete="address-level2" maxLength={80} hint="Opcional." />
              </div>

              <label className={styles.toggleRow}>
                <span>Quero avisos de jogo e de missão</span>
                <input type="checkbox" role="switch" className={styles.toggle} checked={avisos} onChange={(e) => setAvisos(e.target.checked)} />
              </label>

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
            </form>
          )}
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          {etapa > 1 && (
            <Button variant="neutral" fullWidth={false} className={styles.backBtn} onClick={() => setEtapa((etapa - 1) as Etapa)} disabled={salvando}>
              Voltar
            </Button>
          )}
          <span className={ui.spacer} />
          {/* A key troca o elemento: se o mesmo <button> virasse submit no meio do clique em "Continuar",
              o navegador submeteria a etapa 3 que acabou de aparecer. */}
          <Button
            key={etapa === 3 ? 'concluir' : 'continuar'}
            variant={etapa === 3 ? 'success' : 'primary'}
            fullWidth={false}
            className={styles.nextBtn}
            type={etapa === 3 ? 'submit' : 'button'}
            form={etapa === 3 ? 'onboarding-dados' : undefined}
            onClick={etapa === 3 ? undefined : avancar}
            disabled={!podeAvancar}
            loading={salvando}
            iconRight={etapa === 3 ? 'check' : 'arrow_forward'}
          >
            {etapa === 3 ? 'Concluir' : 'Continuar'}
          </Button>
        </div>
      </footer>
    </div>
  );
}
