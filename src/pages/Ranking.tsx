import { useState } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { Crest } from '../components/ui/Crest';
import { Segmented } from '../components/ui/Segmented';
import { FLAG } from '../data/common';
import { ME, RANK_BASE } from '../data/ranking';
import ui from '../styles/ui.module.css';
import styles from './Ranking.module.css';

type Period = 'temporada' | 'mês' | 'semana';
type Scope = 'mundo' | 'pais';

const PODIUM: Record<string, string> = { '1º': '#C8901A', '2º': '#8E9BAB', '3º': '#CE9264' };

const COUNTRY_CODES: Record<string, string> = { Brasil: 'br', Argentina: 'ar', Espanha: 'es', Inglaterra: 'gb-eng', Itália: 'it', Chile: 'cl', Portugal: 'pt' };

type Club = { pos: string; name: string; country: string; fans: string; delta: string; mine?: boolean };

const WORLD: Club[] = [
  { pos: '1º', name: 'Clube Aurora', country: 'Argentina', fans: '48,2 M', delta: '+120 mil' },
  { pos: '2º', name: 'Clube Meridiano', country: 'Espanha', fans: '41,7 M', delta: '+96 mil' },
  { pos: '3º', name: 'Clube Boreal', country: 'Inglaterra', fans: '39,4 M', delta: '+88 mil' },
  { pos: '4º', name: 'Clube Litoral', country: 'Brasil', fans: '34,1 M', delta: '+141 mil' },
  { pos: '5º', name: 'Clube Vertente', country: 'Itália', fans: '30,8 M', delta: '+52 mil' },
  { pos: '6º', name: 'Clube B', country: 'Brasil', fans: '28,6 M', delta: '+204 mil', mine: true },
];

const BRAZIL: Club[] = [
  { pos: '1º', name: 'Clube Litoral', country: 'Brasil', fans: '34,1 M', delta: '+141 mil' },
  { pos: '2º', name: 'Clube B', country: 'Brasil', fans: '28,6 M', delta: '+204 mil', mine: true },
  { pos: '3º', name: 'Clube Sertão', country: 'Brasil', fans: '21,3 M', delta: '+77 mil' },
  { pos: '4º', name: 'Clube Serra', country: 'Brasil', fans: '18,7 M', delta: '+45 mil' },
  { pos: '5º', name: 'Clube Cerrado', country: 'Brasil', fans: '15,2 M', delta: '+38 mil' },
  { pos: '6º', name: 'Clube Baía', country: 'Brasil', fans: '12,9 M', delta: '+29 mil' },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: 'temporada', label: 'temporada' },
  { id: 'mês', label: 'mês' },
  { id: 'semana', label: 'semana' },
];

export function Ranking() {
  const [period, setPeriod] = useState<Period>('temporada');
  const [scope, setScope] = useState<Scope>('pais');
  const clubs = scope === 'mundo' ? WORLD : BRAZIL;

  return (
    <div className={styles.page}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Ranking</h2>
        <span className={ui.pageSub}>temporada 2026 · zera em 1 jan</span>
      </div>
      <div className={styles.grid}>
        <section className={ui.cardFlush}>
          <div className={styles.headRow}>
            <h3 className={ui.titleLg}>Torcedores do Clube B</h3>
            <Segmented options={PERIODS} value={period} onChange={setPeriod} className={styles.tabsCap} />
          </div>
          <div className={ui.tableHead}>
            <span className={styles.colPos}>#</span>
            <span className={styles.colAvatar} />
            <span className={styles.colName}>torcedor</span>
            <span className={styles.colNum}>xp</span>
            <span className={styles.colNum}>nível</span>
          </div>
          {[...RANK_BASE, ME].map((r) => (
            <div key={r.pos} className={r.me ? `${styles.row} ${styles.me}` : styles.row}>
              <span className={styles.pos} style={PODIUM[r.pos] ? { color: PODIUM[r.pos] } : undefined}>
                {r.pos}
              </span>
              <Avatar size={34} iconSize={19} />
              <span className={styles.colName}>{r.name}</span>
              <span className={styles.xp}>{r.xp}</span>
              <span className={styles.lvl}>nv {r.level}</span>
            </div>
          ))}
        </section>

        <div className={styles.stack}>
          <section className={styles.mine}>
            <div className={styles.minePos}>{ME.pos}</div>
            <div>
              <div className={styles.mineTitle}>Sua posição na torcida</div>
              <div className={styles.mineMeta}>{ME.xp} XP · faltam 280 para o 11º</div>
            </div>
          </section>
          <section className={ui.cardFlush}>
            <div className={styles.headRowSm}>
              <h3 className={ui.title}>Maiores torcidas</h3>
              <Segmented
                size="xs"
                options={[
                  { id: 'mundo', label: 'Mundo' },
                  { id: 'pais', label: 'Brasil' },
                ]}
                value={scope}
                onChange={setScope}
              />
            </div>
            {clubs.map((c) => (
              <div key={c.pos} className={c.mine ? `${styles.club} ${styles.me}` : styles.club}>
                <span className={styles.clubPos}>{c.pos}</span>
                <Crest width={30} height={34} />
                <div className={styles.clubInfo}>
                  <div className={styles.clubName}>{c.name}</div>
                  <div className={styles.country}>
                    <img src={FLAG(COUNTRY_CODES[c.country] ?? 'br')} alt="" className={styles.flag} />
                    {c.country}
                  </div>
                </div>
                <div className={styles.fans}>
                  {c.fans}
                  <div className={styles.delta}>{c.delta}</div>
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
