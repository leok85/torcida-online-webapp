import { useAuth } from '../auth/AuthContext';
import { Crest } from '../components/ui/Crest';
import { Icon } from '../components/ui/Icon';
import { Progress } from '../components/ui/Progress';
import { useCarga } from '../data/useCarga';
import { buscarExtrato, quandoFoi, xpEmTexto, type LancamentoDeXp } from '../data/xp';
import { useMeuXp } from '../xp/MeuXp';
import ui from '../styles/ui.module.css';
import styles from './Perfil.module.css';

const BADGES = [
  { name: 'Vidente', icon: 'how_to_reg', bg: 'linear-gradient(150deg,#0B57C4,#00419B)' },
  { name: 'Comentarista', icon: 'forum', bg: 'linear-gradient(150deg,#55C223,#2F7D0E)' },
  { name: 'Presença', icon: 'local_fire_department', bg: 'linear-gradient(150deg,#E7C05A,#C8901A)' },
  { name: 'MVP fiel', icon: 'military_tech', bg: 'linear-gradient(150deg,#8FB2E4,#0B57C4)' },
  { name: 'Fotógrafo', icon: 'photo_camera', bg: 'linear-gradient(150deg,#C7D0DB,#8E9BAB)' },
];
const LOCKED_BADGES = 3;

const GOLD = { color: '#C8901A', bg: '#FFF4D6' };
const GREEN = { color: '#2A6E0D', bg: '#E1F4D8' };
const BLUE = { color: '#00419B', bg: '#DCE8F9' };

const VISUAL: Record<string, { color: string; bg: string }> = {
  login_diario: GOLD,
  palpite_exato: GREEN,
  palpite_vencedor: GREEN,
  palpite_autor: GREEN,
  foto_campea: GOLD,
  missao: GREEN,
};

/** Texto do lançamento: o detalhe pronto do banco ou, sem ele, o rótulo da ação. */
function textoDo(l: LancamentoDeXp) {
  if (l.acao === 'missao') return `Missão concluída: ${l.detalhe ?? ''}`.trim();
  if (l.acao === 'palpite_exato' || l.acao === 'palpite_autor' || l.acao === 'convite_aceito') return l.detalhe ?? l.rotulo;
  return l.detalhe ? `${l.rotulo} · ${l.detalhe}` : l.rotulo;
}

export function Perfil() {
  const { perfil } = useAuth();
  const { xp } = useMeuXp();
  // Relê junto com o XP: cada crédito novo (inclusive o login do dia) entra no extrato.
  const extrato = useCarga(xp === undefined ? null : `extrato:${xp?.xp_total}`, () => buscarExtrato(30)).dados;
  const stats = [
    { value: xp ? `${xp.posicao_temporada}º` : '–', label: 'TEMPORADA' },
    { value: '440', label: 'MOEDAS' },
    { value: '7', label: 'CONQUISTAS' },
  ];
  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        <div className={styles.stack}>
          <section className={styles.hero}>
            <div className={styles.identity}>
              <div className={styles.ring}>
                <div className={styles.ringInner}>
                  <div className={styles.ringValue}>{xp?.nivel ?? '–'}</div>
                  <div className={styles.ringLabel}>NÍVEL</div>
                </div>
              </div>
              <div className={styles.info}>
                <h2 className={styles.nick}>{perfil?.apelido}</h2>
                <div className={styles.club}>
                  <Crest width={24} height={27} tone="dark" clubeId={perfil?.clube?.id} />
                  {perfil?.clube?.nome} · desde {perfil && new Date(perfil.criado_em).getFullYear()}
                </div>
                <Progress
                  value={xp ? `${(xp.xp_no_nivel / xp.xp_do_nivel) * 100}%` : '0%'}
                  height={9}
                  track="rgba(255,255,255,.14)"
                  fill="var(--xp-gradient-green)"
                />
                {xp && (
                  <div className={styles.xpScale}>
                    <span>{xpEmTexto(xp.xp_no_nivel)} XP</span>
                    <span>
                      {xpEmTexto(xp.xp_do_nivel - xp.xp_no_nivel)} para o {xp.nivel + 1}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.stats}>
              {stats.map((s) => (
                <div key={s.label} className={styles.stat}>
                  <div className={styles.statValue}>{s.value}</div>
                  <div className={styles.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.badgesCard}>
            <h3 className={styles.badgesTitle}>Conquistas</h3>
            <div className={styles.badges}>
              {BADGES.map((b) => (
                <div key={b.name} className={styles.badge}>
                  <div className={styles.shield} style={{ background: b.bg }}>
                    <Icon name={b.icon} size={28} color="#FFFFFF" />
                  </div>
                  {b.name}
                </div>
              ))}
              {Array.from({ length: LOCKED_BADGES }, (_, i) => (
                <div key={`locked-${i}`} className={styles.badgeLocked}>
                  <div className={styles.shield}>
                    <Icon name="lock" size={28} color="var(--muted)" />
                  </div>
                  ?
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className={styles.history}>
          <div className={styles.historyHead}>
            <h3 className={ui.titleLg}>Histórico de XP</h3>
            <div className={styles.period}>últimos lançamentos</div>
          </div>
          {extrato?.length === 0 && <p className={styles.vazio}>Seu XP aparece aqui: dê um palpite, fale no chat ou avalie os jogadores.</p>}
          {extrato?.map((l) => {
            const v = VISUAL[l.acao] ?? BLUE;
            return (
              <div key={l.id} className={styles.entry}>
                <div className={styles.entryIcon} style={{ background: v.bg }}>
                  <Icon name={l.icone} size={20} color={v.color} />
                </div>
                <div className={styles.entryBody}>
                  <div className={styles.entryText}>{textoDo(l)}</div>
                  <div className={styles.entryWhen}>
                    {quandoFoi(l.criado_em)}
                    {l.fator > 1 && ` · ${String(l.fator).replace('.', ',').replace(/,?0+$/, '')}× XP`}
                  </div>
                </div>
                <div className={styles.entryXp}>+{xpEmTexto(l.xp)}</div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
