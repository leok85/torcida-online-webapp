import { useState } from 'react';
import { Crest } from '../components/ui/Crest';
import { Icon } from '../components/ui/Icon';
import ui from '../styles/ui.module.css';
import styles from './PosJogo.module.css';

const GOOD = { color: '#2A6E0D', bg: '#E1F4D8' };
const OK = { color: '#00419B', bg: '#DCE8F9' };
const BAD = { color: '#C0342C', bg: '#FCEDEC' };

type Average = { num: string; name: string; pos: string; avg: string; yours: string | null; mvp?: boolean; color: string; bg: string };

const AVERAGES: Average[] = [
  { num: '10', name: 'Camisa 10 · Vitor', pos: 'meia', avg: '9,2', yours: '9', mvp: true, ...GOOD },
  { num: '9', name: 'Camisa 9 · Gabriel', pos: 'atacante', avg: '8,4', yours: '8', ...GOOD },
  { num: '5', name: 'Camisa 5 · Pedro', pos: 'volante', avg: '7,6', yours: '8', ...GOOD },
  { num: '2', name: 'Camisa 2 · Kaio', pos: 'lateral', avg: '6,8', yours: '7', ...OK },
  { num: '1', name: 'Camisa 1 · Alves', pos: 'goleiro', avg: '6,1', yours: '6', ...OK },
  { num: '4', name: 'Camisa 4 · Diego', pos: 'zagueiro', avg: '5,9', yours: null, ...OK },
  { num: '3', name: 'Camisa 3 · Bruno', pos: 'zagueiro', avg: '4,7', yours: '5', ...BAD },
];

function gradeStyle(grade: number) {
  if (grade === 0) return { color: '#6E7C93', fill: '', text: 'sem nota' };
  if (grade >= 7) return { color: '#2A6E0D', fill: '#3FA414', text: 'jogou bem' };
  if (grade >= 5) return { color: '#00419B', fill: '#00419B', text: 'cumpriu' };
  return { color: '#C0342C', fill: '#C0342C', text: 'ficou devendo' };
}

export function PosJogo() {
  const [grade, setGrade] = useState(0);
  const [sent, setSent] = useState(false);
  const g = gradeStyle(grade);

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <section className={styles.result}>
          <div className={styles.team}>
            <Crest width={48} height={54} tone="dark" />
            Clube B
          </div>
          <div className={styles.center}>
            <div className={styles.score}>2 — 1</div>
            <div className={styles.win}>VITÓRIA</div>
          </div>
          <div className={`${styles.team} ${styles.away}`}>
            <Crest width={48} height={54} tone="darkAway" />
            Clube E
          </div>
          <div className={ui.spacer} />
          <div className={styles.exact}>
            <Icon name="bolt" size={21} color="var(--green-neon)" />
            Palpite exato 2 — 1<span className={styles.exactXp}>+240 XP</span>
          </div>
        </section>
        <section className={styles.mvp}>
          <div className={styles.medal}>
            <Icon name="military_tech" size={30} color="var(--gold)" />
          </div>
          <div>
            <div className={styles.mvpLabel}>MVP da partida</div>
            <div className={styles.mvpName}>Camisa 10</div>
            <div className={styles.mvpMeta}>61% dos votos · você votou nele</div>
          </div>
        </section>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.head}>
            <h3 className={ui.titleLg}>Suas notas</h3>
            <div className={ui.redPill}>
              <Icon name="timer" size={15} />
              fecha em 47 min
            </div>
          </div>
          <p className={styles.hint}>Notas de 1 a 10. A janela fecha 1 h após o apito final.</p>
          <div className={styles.rate}>
            <div className={styles.player}>
              <div className={styles.num}>10</div>
              <div className={styles.info}>
                <div className={styles.name}>Camisa 10 · Vitor</div>
                <div className={styles.meta}>meia · 78 min · {g.text}</div>
              </div>
              <div className={styles.grade} style={{ color: g.color }}>
                {grade > 0 ? `${grade},0` : '—'}
              </div>
            </div>
            <div className={styles.scale} role="radiogroup" aria-label="Nota do Camisa 10">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={n === grade}
                  className={n <= grade ? `${styles.scaleBtn} ${styles.filled}` : styles.scaleBtn}
                  style={n <= grade ? { background: g.fill } : undefined}
                  onClick={() => {
                    setGrade(n);
                    setSent(false);
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.done}>
            <div className={styles.num}>9</div>
            <div className={styles.info}>
              <div className={styles.name}>Camisa 9 · Gabriel</div>
              <div className={styles.meta}>atacante · 90 min · avaliado</div>
            </div>
            <div className={styles.grade} style={{ color: 'var(--green-dark)' }}>
              8,0
            </div>
          </div>
          <button type="button" className={sent ? `${styles.send} ${styles.sent}` : styles.send} onClick={() => setSent(true)}>
            {sent ? 'Avaliações enviadas' : 'Enviar avaliações · +60 XP'}
          </button>
        </section>

        <section className={styles.card}>
          <div className={styles.avgHead}>
            <h3 className={ui.titleLg}>Média da torcida</h3>
            <div className={styles.voters}>4.812 votaram</div>
          </div>
          {AVERAGES.map((f) => (
            <div key={f.num} className={styles.avgRow}>
              <div className={styles.avgNum} style={{ background: f.bg, color: f.color }}>
                {f.num}
              </div>
              <div className={styles.avgInfo}>
                <div className={styles.avgName}>
                  {f.name}
                  {f.mvp && <Icon name="military_tech" size={15} color="var(--gold)" />}
                </div>
                <div className={styles.avgPos}>{f.pos}</div>
              </div>
              <div className={f.yours ? styles.yoursSet : styles.yours}>
                <div className={styles.tiny}>SUA</div>
                <div className={styles.yoursValue}>{f.yours ?? '—'}</div>
              </div>
              <div className={styles.fans}>
                <div className={styles.fansValue} style={{ color: f.color }}>
                  {f.avg}
                </div>
                <div className={styles.tiny}>TORCIDA</div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
