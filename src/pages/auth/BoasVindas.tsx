import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/form/Button';
import { Icon } from '../../components/ui/Icon';
import { Progress } from '../../components/ui/Progress';
import { type ErroAoAplicar } from '../../convites/convites';
import { useConvidador } from '../../convites/useConvidador';
import type { AcaoDeXp } from '../../data/xp';
import { useMeuXp, XpProvider } from '../../xp/MeuXp';
import styles from './BoasVindas.module.css';

// O XP de cada uma vem da regra da ação (xp_regras).
const PRIMEIRAS_MISSOES: { icone: string; texto: string; acao: AcaoDeXp }[] = [
  { icone: 'sports_soccer', texto: 'Dar o primeiro palpite', acao: 'palpite_enviado' },
  { icone: 'star_rate', texto: 'Dar notas aos jogadores', acao: 'notas' },
  { icone: 'photo_camera', texto: 'Mandar uma foto do jogo', acao: 'foto_enviada' },
];

const ERRO_DO_CONVITE: Record<ErroAoAplicar, string> = {
  convite_nao_encontrado: 'Não achamos ninguém com esse apelido.',
  convite_proprio: 'Esse é o seu apelido.',
  convite_encerrado: 'O convite só vale antes de escolher o clube.',
  falha: 'Não deu para aplicar agora. Tente de novo.',
};

/** "Veio de um convite?": com o convite aplicado (link /r/ ou informado aqui), mostra de quem é. */
function Convite() {
  const { carregando, convidador, aplicar } = useConvidador();
  const { regras } = useMeuXp();
  const [informando, setInformando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (carregando) return null;

  if (convidador) {
    return (
      <div className={`${styles.convite} ${styles.conviteAplicado}`} role="status">
        <Icon name="verified" size={21} color="var(--green-neon)" />
        <div className={styles.conviteTexto}>
          <strong>Convite do {convidador} aplicado</strong>
          <span>Os +{regras.convite_aceito} XP caem para vocês dois assim que você escolher o clube.</span>
        </div>
      </div>
    );
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!codigo.trim()) return;
    setAplicando(true);
    setErro(null);
    const r = await aplicar(codigo);
    setAplicando(false);
    if (!r.ok) setErro(ERRO_DO_CONVITE[r.erro]);
  }

  return (
    <div className={styles.convite}>
      <div className={styles.conviteLinha}>
        <Icon name="group_add" size={21} color="var(--green-neon)" />
        <div className={styles.conviteTexto}>
          <strong>Veio de um convite?</strong>
          <span>Informe o apelido de quem chamou e os dois ganham +{regras.convite_aceito} XP.</span>
        </div>
        {!informando && (
          <button type="button" className={styles.conviteBotao} onClick={() => setInformando(true)}>
            Informar
          </button>
        )}
      </div>
      {informando && (
        <form className={styles.conviteForm} onSubmit={enviar}>
          <input
            className={styles.conviteCampo}
            aria-label="Apelido de quem convidou"
            placeholder="apelido"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
            maxLength={21}
            autoFocus
          />
          <button type="submit" className={styles.conviteBotao} disabled={aplicando || !codigo.trim()}>
            {aplicando ? 'Aplicando…' : 'Aplicar'}
          </button>
        </form>
      )}
      {erro && (
        <div className={styles.conviteErro} role="alert">
          {erro}
        </div>
      )}
    </div>
  );
}

export function BoasVindas() {
  const { perfil } = useAuth();
  if (perfil?.onboarding_concluido_em) return <Navigate to="/" replace />;
  return (
    <XpProvider>
      <Conteudo />
    </XpProvider>
  );
}

function Conteudo() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const { xp, regras } = useMeuXp();
  const total = xp?.xp_total ?? 0;
  const noNivel = xp?.xp_no_nivel ?? 0;
  const doNivel = xp?.xp_do_nivel ?? 200;

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <img src="/icon-color.png" alt="" className={styles.mark} />
        <div className={styles.kicker}>Conta criada</div>
        <h1 className={styles.title}>
          Bem-vindo,
          <br />
          <span className={styles.nick}>{perfil?.apelido ?? 'torcedor'}</span>
        </h1>
        <p className={styles.lead}>Falta escolher seu clube. É ele que define seu chat, seu ranking e suas missões.</p>

        <div className={styles.cards}>
          <section className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.label}>Seu começo</span>
              {total > 0 && (
                <span className={styles.xp}>
                  <Icon name="bolt" size={15} />+{total} XP
                </span>
              )}
            </div>
            <div className={styles.levelRow}>
              <span className={styles.level}>Nível {xp?.nivel ?? 1}</span>
              <span className={styles.levelName}>Torcedor de arquibancada</span>
            </div>
            <Progress value={`${(noNivel / doNivel) * 100}%`} height={8} track="rgba(255,255,255,.18)" fill="var(--green-neon)" />
            <div className={styles.legend}>
              {noNivel} / {doNivel} XP para o nível {(xp?.nivel ?? 1) + 1}
            </div>
          </section>

          <section className={styles.missions}>
            <div className={styles.label}>Primeiras missões</div>
            {PRIMEIRAS_MISSOES.map((m) => (
              <div key={m.texto} className={styles.mission}>
                <Icon name={m.icone} size={20} color="var(--green-neon)" />
                <span className={styles.missionText}>{m.texto}</span>
                <span className={styles.missionXp}>+{regras[m.acao]} XP</span>
              </div>
            ))}
          </section>
        </div>

        <Convite />

        <div className={styles.actions}>
          <Button variant="success" iconRight="arrow_forward" onClick={() => navigate('/onboarding')}>
            Escolher meu clube
          </Button>
          <div className={styles.step}>Passo 3 de 3</div>
        </div>
      </div>
    </div>
  );
}
