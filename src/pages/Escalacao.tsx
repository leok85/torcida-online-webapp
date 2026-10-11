import { useMemo, useState } from 'react';
import { Crest } from '../components/ui/Crest';
import { Icon } from '../components/ui/Icon';
import { Pitch, PitchRow } from '../components/ui/Pitch';
import { ELIGIBLE, FORMATIONS, GOALKEEPER_SLOT, SQUAD, playerById, resolveLineup, slotsFor } from '../data/lineup';
import ui from '../styles/ui.module.css';
import styles from './Escalacao.module.css';

const MAX_GOALS = 9;

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className={styles.stepper}>
      <button type="button" className={styles.step} aria-label="Menos um gol" disabled={value <= 0} onClick={() => onChange(value - 1)}>
        <Icon name="remove" size={18} />
      </button>
      <div className={styles.goals}>{value}</div>
      <button type="button" className={styles.stepUp} aria-label="Mais um gol" disabled={value >= MAX_GOALS} onClick={() => onChange(value + 1)}>
        <Icon name="add" size={18} />
      </button>
    </div>
  );
}

export function Escalacao() {
  const [formation, setFormation] = useState('4-3-3');
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [activeSlot, setActiveSlot] = useState(GOALKEEPER_SLOT);
  const [home, setHome] = useState(2);
  const [away, setAway] = useState(1);
  const [confirmed, setConfirmed] = useState(false);

  const slots = useMemo(() => slotsFor(formation), [formation]);
  const lineup = useMemo(() => resolveLineup(slots, picks), [slots, picks]);

  // Linhas de cima (ataque) para baixo (goleiro).
  const rows = useMemo(() => {
    const lines = Array.from(new Set(slots.filter((s) => s.line !== 'gol').map((s) => s.line))).reverse();
    return [...lines, 'gol'].map((line) => slots.filter((s) => s.line === line));
  }, [slots]);

  const selected = slots.find((s) => s.id === activeSlot) ?? slots[0];
  const onField = new Set(Object.values(lineup));
  const options = SQUAD.filter((p) => ELIGIBLE[selected.pos].includes(p.pos));

  const change = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setConfirmed(false);
  };

  const pickFormation = change((f: string) => {
    setFormation(f);
    setPicks({});
    setActiveSlot(GOALKEEPER_SLOT);
  });

  // Se o jogador já estiver escalado em outra vaga, ele sai de lá e a vaga é recalculada.
  const pickPlayer = change((playerId: string) =>
    setPicks((cur) => {
      const next = Object.fromEntries(Object.entries(cur).filter(([, id]) => id !== playerId));
      next[selected.id] = playerId;
      return next;
    }),
  );

  return (
    <div className={styles.page}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Escalação ideal e palpite</h2>
        <span className={ui.pageSub}>Clube B × Clube Serra · fecha 15 min antes</span>
        <div className={ui.spacer} />
        <div className={ui.xpPill}>+80 XP</div>
      </div>

      <div className={styles.grid}>
        <section className={ui.card}>
          <div className={styles.formations}>
            {Object.keys(FORMATIONS).map((f) => (
              <button
                key={f}
                type="button"
                className={f === formation ? `${styles.formation} ${styles.active}` : styles.formation}
                onClick={() => pickFormation(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <Pitch size="lg">
            {rows.map((row) => (
              <PitchRow key={row[0].line}>
                {row.map((slot) => {
                  const p = playerById(lineup[slot.id]);
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className={slot.id === activeSlot ? `${styles.slot} ${styles.active}` : styles.slot}
                      onClick={() => setActiveSlot(slot.id)}
                    >
                      <div className={styles.shirt}>{p?.n ?? '?'}</div>
                      <div className={styles.name}>{p?.name ?? 'vazio'}</div>
                      <div className={styles.pos}>{slot.pos}</div>
                    </button>
                  );
                })}
              </PitchRow>
            ))}
          </Pitch>
        </section>

        <div className={styles.stack}>
          <section className={ui.card}>
            <div className={styles.pickHead}>
              <h3 className={ui.title}>Quem joga de {selected.pos}</h3>
              <div className={ui.goldPill}>
                <Icon name="touch_app" size={15} />
                clique no campo
              </div>
            </div>
            <p className={styles.hint}>Clique numa posição no campo e escolha o jogador. Se ele já estiver escalado, os dois trocam de lugar.</p>
            <div className={styles.options}>
              {options.map((p) => {
                const here = lineup[selected.id] === p.id;
                const state = here ? 'escalado aqui' : onField.has(p.id) ? 'já está em campo' : 'no banco';
                return (
                  <button key={p.id} type="button" className={here ? `${styles.option} ${styles.here}` : styles.option} onClick={() => pickPlayer(p.id)}>
                    <div className={styles.num}>{p.n}</div>
                    <div>
                      <div className={styles.optionName}>{p.name}</div>
                      <div className={styles.optionMeta}>
                        {p.pos} · {state}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={ui.card}>
            <h3 className={styles.guessTitle}>Palpite do resultado</h3>
            <div className={styles.guess}>
              <div className={styles.side}>
                <Crest width={42} height={47} tone="lightHome" />
                <Stepper value={home} onChange={change(setHome)} />
              </div>
              <div className={styles.times}>×</div>
              <div className={styles.side}>
                <Crest width={42} height={47} tone="light" />
                <Stepper value={away} onChange={change(setAway)} />
              </div>
            </div>
            <div className={styles.rewardFirst}>
              <span>Placar exato</span>
              <strong>+240 XP</strong>
            </div>
            <div className={styles.reward}>
              <span>Só o vencedor</span>
              <strong>+60 XP</strong>
            </div>
            <button type="button" className={confirmed ? `${styles.confirm} ${styles.confirmed}` : styles.confirm} onClick={() => setConfirmed(true)}>
              <Icon name="check" size={20} />
              {confirmed ? 'Escalação e palpite confirmados' : 'Confirmar escalação e palpite'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
