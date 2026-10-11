import { Crest } from '../components/ui/Crest';
import { Icon } from '../components/ui/Icon';
import { Progress } from '../components/ui/Progress';
import ui from '../styles/ui.module.css';
import styles from './Clube.module.css';

type Milestone = { name: string; sub: string; state: 'done' | 'next' | 'locked'; icon?: string };

const TRAIL: Milestone[] = [
  { name: 'Caneca e adesivos', sub: '1.000 torcedores · liberado', state: 'done' },
  { name: 'Boné bordado', sub: '10.000 torcedores · liberado', state: 'done' },
  { name: 'Camisa oficial', sub: '30.000 torcedores · faltam 1.360', state: 'next', icon: 'checkroom' },
  { name: 'Ingresso de arquibancada', sub: '50.000 torcedores', state: 'locked' },
  { name: 'Camisa autografada e visita ao CT', sub: '100.000 torcedores', state: 'locked' },
];

const MILESTONE_STYLE = {
  done: { icon: 'check', bg: '#3FA414', border: '0', color: '#FFFFFF', sub: '#2A6E0D' },
  next: { icon: 'checkroom', bg: '#EEF4FD', border: '1.5px solid #00419B', color: '#00419B', sub: '#00419B' },
  locked: { icon: 'lock', bg: '#EBF0F6', border: '0', color: '#6E7C93', sub: '#6E7C93' },
};

export function Clube({ onInvite }: { onInvite?: () => void }) {
  return (
    <div className={styles.page}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Página do clube</h2>
        <span className={ui.pageSub}>desbloqueios valem para toda a torcida</span>
      </div>
      <div className={styles.grid}>
        <div className={styles.stack}>
          <section className={styles.hero}>
            <Crest width={70} height={78} tone="dark" />
            <div>
              <div className={styles.clubName}>Clube B</div>
              <div className={styles.fans}>
                <Icon name="groups" size={18} color="var(--green-neon)" />
                <span className={styles.fansValue}>28.640</span>
                torcedores no app
              </div>
              <div className={styles.rank}>2º maior torcida do Brasil · 6ª do mundo</div>
            </div>
          </section>
          <section className={styles.next}>
            <div className={styles.nextLabel}>Próximo desbloqueio</div>
            <div className={styles.nextItem}>
              <div className={styles.nextIcon}>
                <Icon name="checkroom" size={29} color="var(--primary)" />
              </div>
              <div>
                <div className={styles.nextName}>Camisa oficial na loja</div>
                <div className={styles.nextMeta}>1.360 torcedores para liberar</div>
              </div>
            </div>
            <Progress value="95%" height={14} />
            <div className={styles.scale}>
              <span>28.640</span>
              <span>30.000</span>
            </div>
          </section>
          <button type="button" className={styles.invite} onClick={onInvite}>
            <Icon name="group_add" size={21} />
            Convidar torcedores · +100 XP
          </button>
          <div className={styles.note}>
            <Icon name="info" size={20} color="var(--gold)" />
            <div>O desbloqueio é do clube inteiro. Quando a marca cai, o item aparece na loja para toda a torcida.</div>
          </div>
        </div>

        <section className={styles.trail}>
          <h3 className={styles.trailTitle}>Trilha da torcida</h3>
          <p className={styles.trailText}>Quanto maior a torcida, mais itens entram na loja.</p>
          {TRAIL.map((t) => {
            const s = MILESTONE_STYLE[t.state];
            return (
              <div key={t.name} className={t.state === 'locked' ? `${styles.step} ${styles.locked}` : styles.step}>
                <div className={styles.stepIcon} style={{ background: s.bg, border: s.border }}>
                  <Icon name={t.icon ?? s.icon} size={21} color={s.color} />
                </div>
                <div>
                  <div className={styles.stepName}>{t.name}</div>
                  <div className={styles.stepSub} style={{ color: s.sub }}>
                    {t.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
