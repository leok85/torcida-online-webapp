import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/ui/Avatar';
import { Icon } from '../components/ui/Icon';
import { Progress } from '../components/ui/Progress';
import { Striped } from '../components/ui/Striped';
import { ME, RANK_BASE } from '../data/ranking';
import ui from '../styles/ui.module.css';
import { CardPartida } from './CardPartida';
import styles from './Inicio.module.css';

const MISSIONS = [
  { title: 'Logar 5 dias seguidos', icon: 'task_alt', color: '#3FA414', width: '60%', frac: '3/5' },
  { title: 'Comentar em 2 jogos', icon: 'forum', color: '#00419B', width: '50%', frac: '1/2' },
  { title: 'Postar 1 foto de jogo', icon: 'photo_camera', color: '#00419B', width: '0%', frac: '0/1' },
];

const NEWS = [
  { title: 'Meia titular volta de suspensão e deve começar jogando', when: 'há 2 h' },
  { title: 'Clube encaminha renovação do lateral-direito até 2029', when: 'há 6 h' },
  { title: 'Sub-20 vence e garante vaga na semifinal estadual', when: 'há 1 d' },
];

const RANK = [...RANK_BASE.slice(0, 3), ME];

export function Inicio() {
  const { perfil } = useAuth();

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <CardPartida clubeNome={perfil?.clube?.nome ?? 'seu clube'} />

        <div className={styles.stack}>
          <section className={ui.card}>
            <div className={styles.level}>
              <div className={styles.ring}>
                <div className={styles.ringInner}>
                  <div className={styles.ringValue}>24</div>
                  <div className={styles.ringLabel}>NÍVEL</div>
                </div>
              </div>
              <div className={styles.levelInfo}>
                <div className={styles.levelXp}>1.480 / 2.400 XP</div>
                <Progress value="62%" />
                <div className={styles.levelNext}>920 XP para o nível 25</div>
              </div>
            </div>
          </section>
          <section className={ui.card}>
            <div className={styles.cardHead}>
              <h3 className={ui.title}>Missões da semana</h3>
              <Link to="/missoes">ver todas</Link>
            </div>
            <div className={styles.missions}>
              {MISSIONS.map((m) => (
                <div key={m.title} className={styles.mission}>
                  <Icon name={m.icon} size={19} color={m.color} />
                  <div className={styles.missionBody}>
                    {m.title}
                    <Progress value={m.width} height={5} fill={m.color} square className={styles.missionBar} />
                  </div>
                  <span className={styles.frac}>{m.frac}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className={styles.bottom}>
        <section className={ui.card}>
          <h3 className={styles.cardTitle}>Notícias do clube</h3>
          {NEWS.map((n) => (
            <div key={n.title} className={styles.news}>
              <Striped width={66} height={52} stripe={6} radius={8} />
              <div>
                <div className={styles.newsTitle}>{n.title}</div>
                <div className={styles.when}>{n.when}</div>
              </div>
            </div>
          ))}
        </section>
        <section className={ui.card}>
          <h3 className={styles.cardTitle}>Ranking da torcida</h3>
          {RANK.map((r) => (
            <div key={r.pos} className={r.me ? `${styles.rankRow} ${styles.me}` : styles.rankRow}>
              <span className={styles.rankPos}>{r.pos}</span>
              <Avatar size={28} iconSize={17} />
              <span className={styles.rankName}>{r.name}</span>
              <span className={styles.rankXp}>{r.xp}</span>
            </div>
          ))}
        </section>
        <section className={ui.card}>
          <h3 className={styles.cardTitle}>Próximos compromissos</h3>
          <div className={styles.agenda}>
            <div className={styles.event}>
              <Icon name="sports_soccer" size={20} color="var(--primary)" />
              <div>
                <div className={styles.eventTitle}>Clube B x Clube Serra</div>
                <div className={styles.eventSub}>Copa · quartas, qua 21:30</div>
              </div>
            </div>
            <div className={styles.eventBlue}>
              <Icon name="groups" size={20} color="var(--primary)" />
              <div>
                <div className={styles.eventTitle}>Bar do Zé · assistir junto</div>
                <div className={styles.eventSub}>você confirmou · 12 torcedores</div>
              </div>
            </div>
            <div className={styles.eventGold}>
              <Icon name="inventory_2" size={20} color="var(--gold)" />
              <div>
                <div className={styles.eventTitle}>Pacote prata para abrir</div>
                <div className={styles.eventSub}>fecha domingo 23:59</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
