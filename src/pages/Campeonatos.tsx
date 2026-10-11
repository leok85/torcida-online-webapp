import { useNavigate } from 'react-router-dom';
import { Crest } from '../components/ui/Crest';
import { Icon } from '../components/ui/Icon';
import ui from '../styles/ui.module.css';
import styles from './Campeonatos.module.css';

const LIBERTA = '#3FA414';
const SULA = '#0B57C4';
const NONE = '#CBD5E1';

const TABLE = [
  { pos: '1', name: 'Clube Litoral', pts: '41', j: '19', sg: '+18', zone: LIBERTA },
  { pos: '2', name: 'Clube Serra', pts: '38', j: '19', sg: '+14', zone: LIBERTA },
  { pos: '3', name: 'Clube B', pts: '36', j: '19', sg: '+12', zone: LIBERTA, mine: true },
  { pos: '4', name: 'Clube Sertão', pts: '34', j: '19', sg: '+9', zone: LIBERTA },
  { pos: '5', name: 'Clube Cerrado', pts: '31', j: '19', sg: '+5', zone: SULA },
  { pos: '6', name: 'Clube Baía', pts: '29', j: '19', sg: '+2', zone: SULA },
  { pos: '7', name: 'Clube E', pts: '27', j: '19', sg: '0', zone: NONE },
  { pos: '8', name: 'Clube Pantanal', pts: '24', j: '19', sg: '-4', zone: NONE },
];

const RESULT_COLORS = { V: '#3FA414', E: '#6E7C93', D: '#C0342C' };
const LAST_FIVE = ['V', 'V', 'E', 'D', 'V'] as const;

export function Campeonatos() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Campeonatos</h2>
        <span className={ui.pageSub}>Clube B está em 2 competições</span>
      </div>
      <div className={styles.grid}>
        <section className={ui.cardFlush}>
          <div className={ui.cardHeader}>
            <h3 className={ui.titleLg}>Brasileirão · rodada 19</h3>
            <div className={styles.legend}>
              <div className={styles.legendItem}>
                <span className={styles.mark} style={{ background: LIBERTA }} />
                Libertadores
              </div>
              <div className={styles.legendItem}>
                <span className={styles.mark} style={{ background: SULA }} />
                Sul-Americana
              </div>
            </div>
          </div>
          <div className={styles.head}>
            <span className={styles.w26}>#</span>
            <span className={styles.w26} />
            <span className={styles.name}>time</span>
            <span className={styles.num}>pts</span>
            <span className={styles.narrow}>j</span>
            <span className={styles.num}>sg</span>
          </div>
          {TABLE.map((t) => (
            <div key={t.pos} className={t.mine ? `${styles.row} ${styles.me}` : styles.row}>
              <div className={styles.pos}>
                <span className={styles.mark} style={{ background: t.zone }} />
                {t.pos}
              </div>
              <Crest width={26} height={30} />
              <span className={styles.name}>{t.name}</span>
              <span className={styles.pts}>{t.pts}</span>
              <span className={`${styles.narrow} ${styles.stat}`}>{t.j}</span>
              <span className={`${styles.num} ${styles.stat}`}>{t.sg}</span>
            </div>
          ))}
        </section>

        <div className={styles.stack}>
          <section className={ui.cardDark}>
            <div className={styles.cupLabel}>Copa · fase atual</div>
            <div className={styles.cupPhase}>Quartas de final</div>
            <p className={styles.cupText}>Ida em casa, quarta 21:30. Volta fora, dia 27.</p>
            <div className={styles.form} aria-label="Últimos cinco jogos">
              {LAST_FIVE.map((r, i) => (
                <span key={i} className={styles.result} style={{ background: RESULT_COLORS[r] }}>
                  {r}
                </span>
              ))}
            </div>
          </section>
          <section className={styles.tie}>
            <div className={styles.tieLabel}>Quartas · em andamento</div>
            <div className={styles.sideHome}>
              <Crest width={26} height={30} tone="lightHome" />
              <span className={styles.name}>Clube B</span>
              <span className={styles.dash}>–</span>
            </div>
            <div className={styles.sideAway}>
              <Crest width={26} height={30} />
              <span className={styles.name}>Clube Serra</span>
              <span className={styles.dash}>–</span>
            </div>
            <button type="button" className={styles.tieBtn} onClick={() => navigate('/escalacao')}>
              Palpitar na ida · +240 XP
            </button>
          </section>
          <div className={styles.locked}>
            <Icon name="lock" size={21} />
            Semifinal · chave definida após as quartas, 4 e 11 de setembro
          </div>
          <div className={styles.final}>
            <Icon name="emoji_events" size={26} color="var(--gold)" />
            Final · jogo único, 2 de novembro
          </div>
        </div>
      </div>
    </div>
  );
}
