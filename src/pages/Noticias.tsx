import { useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { Progress } from '../components/ui/Progress';
import { Striped } from '../components/ui/Striped';
import ui from '../styles/ui.module.css';
import styles from './Noticias.module.css';

const FILTERS = ['Tudo', 'Escalação', 'Mercado', 'Base'];

const COMMENTS = [
  {
    id: 'c1', initials: 'RA', avatar: 'linear-gradient(150deg,#0B57C4,#00419B)', name: 'Rafael Alencar', level: 31, lvlBg: '#E1F4D8', lvlFg: '#2A6E0D', ago: 'há 41 min', likes: 238, liked: true,
    text: 'Se ele voltar, o meio ganha saída de bola de novo. Nos últimos três jogos sem ele a equipe só chutou de fora da área.',
  },
  {
    id: 'c2', initials: 'MC', avatar: 'linear-gradient(150deg,#55C223,#2F7D0E)', name: 'Marina Costa', level: 24, lvlBg: '#EEF4FD', lvlFg: '#00419B', ago: 'há 1 h', likes: 96, liked: false,
    text: 'Melhor notícia da semana. Agora é segurar a ansiedade até sair a escalação oficial.',
  },
];

const MORE_NEWS = [
  { cat: 'Mercado', title: 'Clube encaminha renovação do lateral-direito até 2029', when: 'há 6 h · 41 comentários' },
  { cat: 'Base', title: 'Sub-20 vence e garante vaga na semifinal estadual', when: 'há 1 d · 12 comentários' },
  { cat: 'Estrutura', title: 'Obras do novo centro de treinamento entram na fase final', when: 'há 2 d · 7 comentários' },
  { cat: 'Torcida', title: 'Encontro da torcida no Bar do Zé reúne 12 confirmados', when: 'há 3 d · 23 comentários' },
];

export function Noticias() {
  const [filter, setFilter] = useState('Tudo');
  const [sort, setSort] = useState('Relevantes');
  const [comments, setComments] = useState(COMMENTS);

  const toggleLike = (id: string) =>
    setComments((cs) => cs.map((c) => (c.id === id ? { ...c, liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) } : c)));

  return (
    <div className={styles.page}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Notícias do clube</h2>
        <div className={ui.spacer} />
        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <button key={f} type="button" className={f === filter ? `${styles.filter} ${styles.active}` : styles.filter} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <section className={styles.flash}>
        <button type="button" className={styles.play} aria-label="Ouvir flash da torcida">
          <Icon name="play_arrow" size={34} filled />
        </button>
        <div className={styles.flashBody}>
          <div className={styles.flashMeta}>
            <Icon name="graphic_eq" size={16} color="var(--green-light)" />
            <span>FLASH DA TORCIDA · 11 AGO · 2:40</span>
            <span className={styles.subscriber}>ASSINANTE</span>
          </div>
          <div className={styles.flashTitle}>As notícias do Clube B em 2 minutos</div>
          <div className={styles.player}>
            <span>0:52</span>
            <Progress value="32%" height={6} track="rgba(255,255,255,.18)" fill="var(--green-light)" square className={styles.track} />
            <span>2:40</span>
          </div>
        </div>
        <div className={styles.flashSide}>
          <div className={styles.listenXp}>
            <Icon name="bolt" size={16} />
            +15 XP ao ouvir
          </div>
          <div className={styles.ai}>gerado por IA · novo todo dia às 6 h</div>
        </div>
      </section>

      <div className={styles.grid}>
        <article className={ui.cardFlush}>
          <Striped height={320} stripe={10} />
          <div className={styles.article}>
            <div className={styles.tagRow}>
              <div className={styles.tag}>Escalação</div>
              <span className={styles.ago}>há 2 h</span>
            </div>
            <h3 className={styles.headline}>Meia titular volta de suspensão e deve começar jogando</h3>
            <p className={styles.lead}>
              Comissão técnica confirmou o retorno no treino desta quinta. A escalação completa sai na véspera do jogo, e a torcida já pode
              montar a escalação ideal na área de palpites.
            </p>
            <div className={styles.engage}>
              <div className={styles.metric}>
                <Icon name="forum" size={18} />
                84
              </div>
              <div className={styles.metric}>
                <Icon name="favorite" size={18} />
                312
              </div>
              <div className={ui.spacer} />
              <div className={styles.readXp}>
                <Icon name="bolt" size={16} />
                +10 XP por ler
              </div>
            </div>

            <div className={styles.comments}>
              <div className={styles.commentsHead}>
                <h4 className={ui.titleLg}>84 comentários</h4>
                <div className={ui.spacer} />
                <div className={styles.sort}>
                  {['Relevantes', 'Recentes'].map((s) => (
                    <button key={s} type="button" className={s === sort ? `${styles.filter} ${styles.active}` : styles.filter} onClick={() => setSort(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.compose}>
                <div className={styles.initials}>EU</div>
                <input className={styles.commentInput} placeholder="Escreva um comentário…" aria-label="Escreva um comentário" />
                <button type="button" className={styles.publish}>
                  Publicar
                </button>
              </div>
              <div className={styles.thread}>
                {comments.map((c) => (
                  <div key={c.id} className={styles.comment}>
                    <div className={styles.initials} style={{ background: c.avatar }}>
                      {c.initials}
                    </div>
                    <div className={styles.commentBody}>
                      <div className={styles.commentHead}>
                        {c.name}
                        <span className={styles.lvl} style={{ background: c.lvlBg, color: c.lvlFg }}>
                          NV {c.level}
                        </span>
                        <span className={styles.commentAgo}>{c.ago}</span>
                      </div>
                      <p className={styles.commentText}>{c.text}</p>
                      <div className={styles.actions}>
                        <button type="button" aria-pressed={c.liked} className={c.liked ? `${styles.action} ${styles.on}` : styles.action} onClick={() => toggleLike(c.id)}>
                          <Icon name="thumb_up" size={18} />
                          {c.likes}
                        </button>
                        <button type="button" className={styles.action}>
                          <Icon name="reply" size={17} />
                          Responder
                        </button>
                        <button type="button" className={styles.reportAction}>
                          <Icon name="flag" size={17} />
                          Denunciar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <div className={styles.removed}>
                  <Icon name="visibility_off" size={19} color="var(--muted-2)" />
                  <div className={styles.removedText}>
                    Comentário removido pela moderação
                    <div>Violou as regras de convivência da torcida.</div>
                  </div>
                  <button type="button" className={styles.link}>
                    Ver motivo
                  </button>
                </div>
                <button type="button" className={styles.more}>
                  Carregar mais comentários
                </button>
              </div>
            </div>
          </div>
        </article>

        <div className={styles.list}>
          {MORE_NEWS.map((n) => (
            <article key={n.title} className={styles.item}>
              <Striped width={104} height={80} stripe={7} radius={10} />
              <div>
                <div className={styles.itemCat}>{n.cat}</div>
                <div className={styles.itemTitle}>{n.title}</div>
                <div className={styles.itemWhen}>{n.when}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
