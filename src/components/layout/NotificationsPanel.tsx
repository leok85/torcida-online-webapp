import { useState } from 'react';
import { Icon } from '../ui/Icon';
import styles from './NotificationsPanel.module.css';

type Notification = { id: string; icon: string; color: string; bg: string; title: string; text: string; when: string; action?: string };

const TODAY: Notification[] = [
  { id: 'n1', icon: 'sports_soccer', color: '#FFF', bg: '#E0342A', title: 'Clube B 1 x 0 Clube E', text: "Gol de Gabriel aos 23'. O chat está fervendo.", when: '2 min', action: 'Entrar no chat' },
  { id: 'n2', icon: 'how_to_vote', color: '#FFF', bg: '#00419B', title: 'Enquete surpresa no chat', text: 'Substitui o lateral agora? Votar rende +15 XP.', when: '8 min', action: 'Votar' },
  { id: 'n3', icon: 'bolt', color: '#FFF', bg: '#3FA414', title: 'Você subiu para o nível 24', text: '+240 XP pelo palpite exato de ontem.', when: '1 h' },
];

const WEEK: Notification[] = [
  { id: 'n4', icon: 'military_tech', color: '#C8901A', bg: '#FFF4D6', title: 'Votação de MVP aberta', text: 'Você tem 1 h para avaliar os jogadores e escolher o MVP.', when: 'ontem', action: 'Avaliar' },
  { id: 'n5', icon: 'inventory_2', color: '#8E9BAB', bg: '#EBF0F6', title: 'Seu pacote prata está pronto', text: 'Faltam 520 XP para virar ouro até domingo.', when: 'ontem', action: 'Abrir pacote' },
  { id: 'n6', icon: 'local_fire_department', color: '#C8901A', bg: '#FFF4D6', title: 'Sequência de 3 dias', text: 'Entre amanhã para chegar a 5 dias e fechar a missão.', when: '2 d' },
  { id: 'n7', icon: 'groups', color: '#00419B', bg: '#DCE8F9', title: 'Léo.Mansur entrou pelo seu convite', text: 'Você ganhou +100 XP e passa a receber 10% do XP dele.', when: '2 d' },
  { id: 'n8', icon: 'newspaper', color: '#00419B', bg: '#DCE8F9', title: 'Meia titular volta de suspensão', text: 'Notícia do clube · ler rende +10 XP.', when: '3 d', action: 'Ler' },
  { id: 'n9', icon: 'event_available', color: '#00419B', bg: '#DCE8F9', title: 'Encontro no Bar do Zé', text: 'Sábado 21:30 · 12 confirmados, 8 vagas.', when: '4 d', action: 'Confirmar' },
];

const PREFS = [
  { id: 'pf1', label: 'Lances do jogo ao vivo', on: true },
  { id: 'pf2', label: 'Missões e XP', on: true },
  { id: 'pf3', label: 'Notícias do clube', on: true },
  { id: 'pf4', label: 'Eventos da torcida', on: false },
];

function Dot({ n, size, iconSize }: { n: Notification; size: number; iconSize: number }) {
  return (
    <div className={styles.dot} style={{ width: size, height: size, background: n.bg }}>
      <Icon name={n.icon} size={iconSize} color={n.color} />
    </div>
  );
}

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const [allRead, setAllRead] = useState(false);
  const [prefs, setPrefs] = useState(PREFS);

  const togglePref = (id: string) => setPrefs((ps) => ps.map((p) => (p.id === id ? { ...p, on: !p.on } : p)));

  return (
    <div className={styles.panel} role="dialog" aria-label="Notificações">
      <div className={styles.head}>
        <div className={styles.headText}>
          <div className={styles.title}>Notificações</div>
          <div className={styles.count}>{allRead ? 'nenhuma não lida' : `${TODAY.length} não lidas`}</div>
        </div>
        <button type="button" className={styles.markRead} onClick={() => setAllRead(true)}>
          Marcar lidas
        </button>
        <button type="button" className={styles.close} aria-label="Fechar" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className={styles.body}>
        <section>
          <div className={styles.group}>Hoje</div>
          <div className={styles.todayList}>
            {TODAY.map((n) => (
              <div key={n.id} className={allRead ? `${styles.today} ${styles.read}` : styles.today}>
                <Dot n={n} size={36} iconSize={19} />
                <div className={styles.main}>
                  <div className={styles.line}>
                    <span className={styles.nTitle}>{n.title}</span>
                    <span className={styles.when}>{n.when}</span>
                    {!allRead && <span className={styles.unread} />}
                  </div>
                  <div className={styles.nText}>{n.text}</div>
                  {n.action && (
                    <button type="button" className={styles.action}>
                      {n.action}
                      <Icon name="arrow_forward" size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className={styles.group}>Esta semana</div>
          <div className={styles.weekBox}>
            {WEEK.map((n) => (
              <div key={n.id} className={styles.week}>
                <Dot n={n} size={34} iconSize={18} />
                <div className={styles.main}>
                  <div className={styles.line}>
                    <span className={styles.nTitle}>{n.title}</span>
                    <span className={styles.when}>{n.when}</span>
                  </div>
                  <div className={styles.nText}>{n.text}</div>
                  {n.action && (
                    <button type="button" className={styles.actionGhost}>
                      {n.action}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className={styles.prefs}>
          <div className={styles.prefsTitle}>O que você quer receber</div>
          <p className={styles.prefsText}>Avisos de jogo do seu time chegam sempre. O resto é escolha sua.</p>
          {prefs.map((p) => (
            <button key={p.id} type="button" role="switch" aria-checked={p.on} className={styles.pref} onClick={() => togglePref(p.id)}>
              {p.label}
              <span className={p.on ? `${styles.switch} ${styles.on}` : styles.switch} />
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
