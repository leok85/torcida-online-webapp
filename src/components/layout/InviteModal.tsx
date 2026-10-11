import { useEffect, useRef, useState } from 'react';
import { INVITE_CODE } from '../../data/common';
import { Icon } from '../ui/Icon';
import ui from '../../styles/ui.module.css';
import styles from './InviteModal.module.css';

const LADDER = [
  { id: 'e1', friends: '3 amigos', pct: '10%', flex: 3, done: true },
  { id: 'e2', friends: '5', pct: '12%', flex: 2 },
  { id: 'e3', friends: '10', pct: '15%', flex: 2 },
  { id: 'e4', friends: '25', pct: '20%', flex: 2 },
];

const GREEN = { color: '#2A6E0D', bg: '#E1F4D8', icon: 'check' };
const GUESTS = [
  { id: 'c1', name: 'Léo.Mansur', state: 'Nível 12 · ativo', xp: '+840', ...GREEN },
  { id: 'c2', name: 'Marcela_10', state: 'Nível 8 · ativo', xp: '+510', ...GREEN },
  { id: 'c3', name: 'gustavo.b', state: 'Nível 3 · ativo', xp: '+190', ...GREEN },
  { id: 'c4', name: 'Duda.S', state: 'Baixou, ainda não escolheu time', xp: '—', color: '#8A5E06', bg: '#FFF4D6', icon: 'hourglass_top' },
  { id: 'c5', name: 'convite enviado', state: 'Aguardando cadastro', xp: '—', color: '#6E7C93', bg: '#EBF0F6', icon: 'schedule' },
];

export function InviteModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer.current);
    };
  }, [onClose]);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="invite-title" onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div className={styles.headText}>
            <h2 id="invite-title" className={styles.title}>
              Chame a torcida e ganhe junto
            </h2>
            <p className={styles.lead}>
              Cada amigo que entra pelo seu convite rende XP na hora, e você continua ganhando uma parte de tudo que ele fizer no app. A
              sua fatia não tira XP dele.
            </p>
          </div>
          <button type="button" className={styles.close} aria-label="Fechar" onClick={onClose}>
            <Icon name="close" size={21} />
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.col}>
            <div className={styles.codeCard}>
              <div className={styles.codeLabel}>Seu código</div>
              <div className={styles.code}>{INVITE_CODE}</div>
              <button type="button" className={copied ? `${styles.copy} ${styles.copied}` : styles.copy} onClick={() => copy(INVITE_CODE)}>
                <Icon name="content_copy" size={19} />
                {copied ? 'Código copiado' : 'Copiar código'}
              </button>
              <div className={styles.shareRow}>
                <button type="button" className={styles.share}>
                  <Icon name="mail" size={18} />
                  E-mail
                </button>
                <button type="button" className={styles.share} onClick={() => copy(`https://torcidaonline.com.br/r/${INVITE_CODE.split('-')[0]}`)}>
                  <Icon name="link" size={18} />
                  Copiar link
                </button>
              </div>
            </div>
            <div className={styles.box}>
              <div className={styles.boxHead}>
                <div className={ui.title}>Sua fatia de XP</div>
                <div className={styles.pct}>10% agora</div>
              </div>
              <p className={styles.muted}>A porcentagem sobe com o número de amigos ativos e vale para sempre.</p>
              <div className={styles.ladder}>
                {LADDER.map((s) => (
                  <div key={s.id} className={s.done ? `${styles.step} ${styles.stepDone}` : styles.step} style={{ flex: s.flex }}>
                    <div className={styles.stepBar} />
                    <div className={styles.stepFriends}>{s.friends}</div>
                    <div className={styles.stepPct}>{s.pct}</div>
                  </div>
                ))}
              </div>
              <div className={styles.tip}>
                <Icon name="trending_up" size={18} color="var(--green-dark)" />
                <div>
                  Mais <strong>2 amigos ativos</strong> e sua fatia vira 12%.
                </div>
              </div>
            </div>
          </div>
          <div className={styles.col}>
            <div className={styles.total}>
              <Icon name="bolt" size={26} color="var(--green-neon)" />
              <div>
                <div className={styles.totalValue}>1.840 XP</div>
                <div className={styles.totalText}>total já rendido pelos seus convites</div>
              </div>
            </div>
            <div className={styles.guests}>
              <div className={styles.guestsHead}>
                <div className={ui.title}>Seus convidados</div>
                <div className={styles.guestsCount}>3 ativos · 2 pendentes</div>
              </div>
              {GUESTS.map((c) => (
                <div key={c.id} className={styles.guest}>
                  <div className={styles.guestIcon} style={{ background: c.bg }}>
                    <Icon name={c.icon} size={18} color={c.color} />
                  </div>
                  <div className={styles.guestInfo}>
                    <div className={styles.guestName}>{c.name}</div>
                    <div className={styles.guestState}>{c.state}</div>
                  </div>
                  <div className={styles.guestXp} style={{ color: c.color }}>
                    {c.xp}
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.note}>
              <Icon name="info" size={19} color="var(--gold)" />
              <div>O amigo precisa escolher um time e entrar em um jogo para o convite contar.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
