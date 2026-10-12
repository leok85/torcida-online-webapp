import { useAuth } from '../auth/AuthContext';
import { Crest } from '../components/ui/Crest';
import { Icon } from '../components/ui/Icon';
import { Progress } from '../components/ui/Progress';
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

const HISTORY = [
  { when: 'hoje 23:12', icon: 'military_tech', text: 'Votou no MVP da partida', xp: '+60', ...GOLD },
  { when: 'hoje 23:04', icon: 'how_to_reg', text: 'Palpite exato: Clube B 2 x 1 Clube E', xp: '+240', ...GREEN },
  { when: 'hoje 21:38', icon: 'photo_camera', text: 'Enviou foto na janela pré-jogo', xp: '+40', ...BLUE },
  { when: 'hoje 19:02', icon: 'forum', text: '18 mensagens no chat da partida', xp: '+90', ...BLUE },
  { when: 'hoje 08:11', icon: 'local_fire_department', text: 'Login diário · 3 dias seguidos', xp: '+20', ...GOLD },
  { when: 'ontem 22:40', icon: 'bolt', text: 'Subiu para o nível 24', xp: '—', ...GREEN },
  { when: 'ontem 20:15', icon: 'groups', text: 'Léo.Mansur entrou pelo seu convite', xp: '+100', ...BLUE },
  { when: '2 d atrás', icon: 'inventory_2', text: 'Abriu pacote prata', xp: '+640', color: '#8E9BAB', bg: '#EBF0F6' },
];

const STATS = [
  { value: '12º', label: 'TEMPORADA' },
  { value: '440', label: 'MOEDAS' },
  { value: '7', label: 'CONQUISTAS' },
];

export function Perfil() {
  const { perfil } = useAuth();
  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        <div className={styles.stack}>
          <section className={styles.hero}>
            <div className={styles.identity}>
              <div className={styles.ring}>
                <div className={styles.ringInner}>
                  <div className={styles.ringValue}>24</div>
                  <div className={styles.ringLabel}>NÍVEL</div>
                </div>
              </div>
              <div className={styles.info}>
                <h2 className={styles.nick}>{perfil?.apelido}</h2>
                <div className={styles.club}>
                  <Crest width={24} height={27} tone="dark" clubeId={perfil?.clube?.id} />
                  {perfil?.clube?.nome} · desde {perfil && new Date(perfil.criado_em).getFullYear()}
                </div>
                <Progress value="62%" height={9} track="rgba(255,255,255,.14)" fill="var(--xp-gradient-green)" />
                <div className={styles.xpScale}>
                  <span>1.480 XP</span>
                  <span>920 para o 25</span>
                </div>
              </div>
            </div>
            <div className={styles.stats}>
              {STATS.map((s) => (
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
            <div className={styles.period}>últimos 90 dias</div>
          </div>
          {HISTORY.map((h) => (
            <div key={h.when} className={styles.entry}>
              <div className={styles.entryIcon} style={{ background: h.bg }}>
                <Icon name={h.icon} size={20} color={h.color} />
              </div>
              <div className={styles.entryBody}>
                <div className={styles.entryText}>{h.text}</div>
                <div className={styles.entryWhen}>{h.when}</div>
              </div>
              <div className={styles.entryXp}>{h.xp}</div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
