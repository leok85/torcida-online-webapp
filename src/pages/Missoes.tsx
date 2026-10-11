import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { Progress } from '../components/ui/Progress';
import ui from '../styles/ui.module.css';
import styles from './Missoes.module.css';

type Mission = { title: string; icon: string; frac: string; xp: string; width: string; state?: 'done' | 'locked' };

const MISSIONS: Mission[] = [
  { title: 'Logar 3 dias seguidos', icon: 'check', frac: 'feita', xp: '+150 XP', width: '100%', state: 'done' },
  { title: 'Comentar em 2 jogos', icon: 'forum', frac: '1/2', xp: '+200 XP', width: '50%' },
  { title: 'Dar palpite em 1 jogo', icon: 'how_to_reg', frac: '0/1', xp: '+120 XP', width: '0%' },
  { title: 'Postar 1 foto de jogo', icon: 'photo_camera', frac: '0/1', xp: '+80 XP', width: '0%' },
  { title: 'Avaliar 11 jogadores', icon: 'lock', frac: '—', xp: '+300 XP', width: '0%', state: 'locked' },
];

const BAR_FILL = { done: 'var(--green)', locked: 'var(--line-3)' };

const WEEK = [
  { day: 'seg', bg: '#3FA414', border: '0', color: '#FFFFFF', icon: 'check' },
  { day: 'ter', bg: '#3FA414', border: '0', color: '#FFFFFF', icon: 'check' },
  { day: 'qua', bg: '#3FA414', border: '0', color: '#FFFFFF', icon: 'check' },
  { day: 'qui', bg: '#EEF4FD', border: '1.5px solid #00419B', color: '#00419B', icon: 'today' },
  { day: 'sex', bg: '#EBF0F6', border: '0', color: '#CBD5E1', icon: 'circle' },
  { day: 'sáb', bg: '#EBF0F6', border: '0', color: '#CBD5E1', icon: 'circle' },
  { day: 'dom', bg: '#FFF4D6', border: '1.5px dashed #E7C05A', color: '#C8901A', icon: 'inventory_2' },
];

export function Missoes() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Missões da semana</h2>
        <span className={ui.pageSub}>reinicia segunda 00:00 · 4 d 6 h restantes</span>
      </div>
      <div className={styles.grid}>
        <div className={styles.list}>
          {MISSIONS.map((m) => (
            <div key={m.title} className={m.state ? `${styles.mission} ${styles[m.state]}` : styles.mission}>
              <div className={styles.badge}>
                <Icon name={m.icon} size={22} />
              </div>
              <div className={styles.body}>
                {m.title}
                <Progress value={m.width} height={7} track="#fff" square fill={m.state ? BAR_FILL[m.state] : 'var(--primary)'} className={styles.bar} />
              </div>
              <div className={styles.right}>
                {m.frac}
                <div className={styles.xp}>{m.xp}</div>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.stack}>
          <section className={ui.cardDark}>
            <div className={styles.weekHead}>
              <div className={styles.weekLabel}>XP da semana</div>
              <div className={styles.weekValue}>1.480 / 2.000</div>
            </div>
            <Progress value="74%" height={14} track="rgba(255,255,255,.14)" fill="var(--xp-gradient-green)" />
            <div className={styles.pack}>
              <div className={styles.packIcon}>
                <Icon name="inventory_2" size={23} color="#F7F9FB" />
              </div>
              <div className={styles.packText}>
                Prata garantido. <strong>520 XP</strong> para o pacote ouro.
              </div>
            </div>
            <button type="button" className={styles.open} onClick={() => navigate('/loja')}>
              Abrir pacote
            </button>
          </section>
          <section className={ui.card}>
            <div className={styles.streakHead}>
              <h3 className={ui.title}>Sequência de login</h3>
              <div className={styles.streak}>
                <Icon name="local_fire_department" size={17} />3 dias
              </div>
            </div>
            <div className={styles.days}>
              {WEEK.map((d) => (
                <div key={d.day} className={styles.day}>
                  <div className={styles.dayBox} style={{ background: d.bg, border: d.border }}>
                    <Icon name={d.icon} size={19} color={d.color} />
                  </div>
                  {d.day}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
