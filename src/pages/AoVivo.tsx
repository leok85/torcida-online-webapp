import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar, LevelTag } from '../components/ui/Avatar';
import { Crest } from '../components/ui/Crest';
import { Icon } from '../components/ui/Icon';
import { Pitch, PitchRow } from '../components/ui/Pitch';
import { Segmented } from '../components/ui/Segmented';
import ui from '../styles/ui.module.css';
import styles from './AoVivo.module.css';

type Source = 'oficial' | 'torcida';
type LineupPlayer = { n: string; name: string; tag: string };

const OFFICIAL: LineupPlayer[][] = [
  [{ n: '7', name: 'Luan', tag: '' }, { n: '9', name: 'Gabriel', tag: "gol 23'" }, { n: '11', name: 'Davi', tag: '' }],
  [{ n: '5', name: 'Pedro', tag: '' }, { n: '10', name: 'Vitor', tag: '' }, { n: '8', name: 'Caio', tag: "entrou 58'" }],
  [{ n: '2', name: 'Kaio', tag: '' }, { n: '3', name: 'Bruno', tag: '' }, { n: '4', name: 'Diego', tag: 'amarelo' }, { n: '6', name: 'Léo', tag: '' }],
  [{ n: '1', name: 'Alves', tag: '' }],
];

const FANS: LineupPlayer[][] = [
  [{ n: '7', name: 'Luan', tag: '94%' }, { n: '9', name: 'Gabriel', tag: '97%' }, { n: '17', name: 'Ryan', tag: '61%' }],
  [{ n: '5', name: 'Pedro', tag: '88%' }, { n: '10', name: 'Vitor', tag: '99%' }, { n: '20', name: 'Enzo', tag: '54%' }],
  [{ n: '2', name: 'Kaio', tag: '91%' }, { n: '3', name: 'Bruno', tag: '86%' }, { n: '14', name: 'Rocha', tag: '58%' }, { n: '6', name: 'Léo', tag: '77%' }],
  [{ n: '1', name: 'Alves', tag: '95%' }],
];

const DISAGREEMENTS = [
  { in: 'Ryan', out: 'Davi', pct: '61%' },
  { in: 'Enzo', out: 'Caio', pct: '54%' },
  { in: 'Rocha', out: 'Diego', pct: '58%' },
];

const STATS = [
  { label: 'Posse de bola', home: '58%', away: '42%', h: '58%', a: '42%' },
  { label: 'Finalizações', home: '11', away: '6', h: '65%', a: '35%' },
  { label: 'No gol', home: '5', away: '2', h: '71%', a: '29%' },
  { label: 'Escanteios', home: '7', away: '3', h: '70%', a: '30%' },
  { label: 'Faltas', home: '9', away: '12', h: '43%', a: '57%' },
  { label: 'Passes certos', home: '86%', away: '74%', h: '54%', a: '46%' },
];

const EVENTS = [
  { min: "58'", icon: 'swap_horiz', color: '#00419B', text: 'Entra Caio, sai Moura' },
  { min: "41'", icon: 'square', color: '#C8901A', text: 'Amarelo para Diego' },
  { min: "23'", icon: 'sports_soccer', color: '#2A6E0D', text: 'Gol de Gabriel, assistência de Vitor' },
];

const POLL = [
  { id: 'sim', label: 'Sim, já', pct: 68 },
  { id: 'nao', label: 'Aguenta mais 10 min', pct: 32 },
];

type ChatMessage = { id: string; author: string; level: number; text: string; mine?: boolean; color?: string; event?: boolean };

const INITIAL_CHAT: ChatMessage[] = [
  { id: 'c1', author: 'Rafa_9', level: 31, text: 'Escalação confirmada, vem com tudo hoje', color: '#00419B' },
  { id: 'c2', author: 'sistema', level: 0, text: "GOL! 1 — 0 aos 23'", event: true },
  { id: 'c3', author: 'Rafa_9', level: 31, text: 'EEEEEE VAMO', color: '#00419B' },
  { id: 'c4', author: 'você', level: 24, text: 'palpite 2-1 tá vivo', mine: true },
  { id: 'c5', author: 'Bia.T', level: 47, text: 'o meia tá jogando muito, meu MVP já é dele', color: '#2A6E0D' },
];

export function AoVivo() {
  const [source, setSource] = useState<Source>('oficial');
  const [vote, setVote] = useState<string | null>(null);
  const [chat, setChat] = useState(INITIAL_CHAT);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  const lineup = source === 'oficial' ? OFFICIAL : FANS;

  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setChat((c) => [...c, { id: `u${Date.now()}`, author: 'você', level: 24, text, mine: true }]);
    setDraft('');
  };

  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <div className={styles.team}>
          <Crest width={46} height={52} tone="dark" />
          Clube B
        </div>
        <div className={styles.center}>
          <div className={styles.score}>1 — 0</div>
          <div className={styles.minute}>67' · 2º tempo</div>
        </div>
        <div className={`${styles.team} ${styles.away}`}>
          Clube E
          <Crest width={46} height={52} tone="darkAway" />
        </div>
        <div className={ui.spacer} />
        <div className={styles.guess}>
          <Icon name="how_to_reg" size={19} color="var(--green-light)" />
          <div>
            Palpite <strong>2 — 1</strong>
          </div>
          <span className={styles.guessXp}>+240 XP</span>
        </div>
        <div className={ui.livePill}>
          <span className={ui.liveDot} />
          AO VIVO
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.col}>
          <div className={styles.colHead}>
            <h3 className={ui.titleLg}>Escalação</h3>
            <Segmented
              options={[
                { id: 'oficial', label: 'Oficial' },
                { id: 'torcida', label: 'Mais votada' },
              ]}
              value={source}
              onChange={setSource}
            />
          </div>
          <Pitch background={source === 'oficial' ? 'var(--pitch)' : 'linear-gradient(175deg, var(--primary), var(--primary-deep))'}>
            {lineup.map((row, i) => (
              <PitchRow key={i}>
                {row.map((p) => (
                  <div key={p.n} className={styles.slot}>
                    <div className={styles.shirt}>{p.n}</div>
                    <div className={styles.player}>{p.name}</div>
                    <div className={styles.tag} style={{ color: source === 'oficial' ? '#C8F5A5' : '#9BD6FF' }}>
                      {p.tag}
                    </div>
                  </div>
                ))}
              </PitchRow>
            ))}
          </Pitch>
          <div className={styles.disagree}>
            <h3 className={styles.panelTitle}>Onde a torcida discordou</h3>
            {DISAGREEMENTS.map((d) => (
              <div key={d.in} className={styles.swap}>
                <Icon name="swap_horiz" size={18} color="var(--red-dark)" />
                <div className={styles.swapText}>
                  <strong>{d.in}</strong> no lugar de <strong>{d.out}</strong>
                </div>
                <span className={styles.pct}>{d.pct}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.colStack}>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>Números da partida</h3>
            {STATS.map((s) => (
              <div key={s.label} className={styles.stat}>
                <div className={styles.statHead}>
                  <span>{s.home}</span>
                  <span className={styles.statLabel}>{s.label}</span>
                  <span>{s.away}</span>
                </div>
                <div className={styles.bars}>
                  <div className={styles.barHome}>
                    <div className={styles.barFill} style={{ width: s.h }} />
                  </div>
                  <div className={styles.barAway}>
                    <div className={styles.barFill} style={{ width: s.a }} />
                  </div>
                </div>
              </div>
            ))}
          </section>
          <section className={styles.panel}>
            <h3 className={`${styles.panelTitle} ${styles.tight}`}>Lances do jogo</h3>
            {EVENTS.map((e) => (
              <div key={e.min} className={styles.event}>
                <span className={styles.eventMin}>{e.min}</span>
                <Icon name={e.icon} size={19} color={e.color} />
                <span className={styles.eventText}>{e.text}</span>
              </div>
            ))}
          </section>
          <section className={styles.poll}>
            <div className={styles.pollHead}>
              <Icon name="how_to_vote" size={18} />
              Enquete surpresa · 30 s
            </div>
            <div className={styles.pollQ}>Substitui o lateral agora?</div>
            <div className={styles.options}>
              {POLL.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  className={[styles.option, i === 0 && styles.optionLead, vote === o.id && styles.voted].filter(Boolean).join(' ')}
                  onClick={() => setVote(o.id)}
                >
                  <div className={styles.optionFill} style={{ width: `${o.pct}%` }} />
                  <span>{o.label}</span>
                  <span className={styles.optionPct}>{o.pct}%</span>
                </button>
              ))}
            </div>
            <div className={styles.pollFoot}>{vote ? 'voto registrado · +15 XP' : 'votar rende +15 XP'}</div>
          </section>
        </div>

        <div className={styles.chat}>
          <div className={styles.chatHead}>
            <Icon name="forum" size={20} color="var(--primary)" />
            <div className={styles.chatTitle}>Chat da torcida</div>
            <div className={styles.online}>4.812 online</div>
          </div>
          <div ref={listRef} className={styles.messages}>
            {chat.map((m) =>
              m.event ? (
                <div key={m.id} className={styles.msg}>
                  <div className={styles.goal}>
                    <div>
                      <Icon name="sports_soccer" size={15} color="var(--green-light)" />
                      {m.text}
                    </div>
                  </div>
                </div>
              ) : (
                <div key={m.id} className={m.mine ? `${styles.msg} ${styles.mine}` : styles.msg}>
                  {!m.mine && <Avatar size={30} iconSize={17} />}
                  <div>
                    {!m.mine && (
                      <div className={styles.author} style={{ color: m.color ?? 'var(--primary)' }}>
                        {m.author}
                        <LevelTag level={m.level} />
                      </div>
                    )}
                    <div className={styles.bubble}>{m.text}</div>
                  </div>
                </div>
              ),
            )}
          </div>
          <form className={styles.composer} onSubmit={send}>
            <button type="button" className={styles.iconBtn} aria-label="Enviar foto">
              <Icon name="add_a_photo" size={21} />
            </button>
            <input className={styles.input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Manda a real pra torcida" />
            <button type="submit" className={styles.sendBtn} aria-label="Enviar">
              <Icon name="send" size={21} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
