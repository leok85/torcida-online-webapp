import { useState } from 'react';
import { LevelTag } from '../components/ui/Avatar';
import { Icon } from '../components/ui/Icon';
import { Striped } from '../components/ui/Striped';
import ui from '../styles/ui.module.css';
import styles from './Fotos.module.css';

type Photo = { id: string; author: string; level: number; moment: string; caption: string; likes: number; liked: boolean };

const PHOTOS: Photo[] = [
  { id: 'p1', author: 'Bia.T', level: 47, moment: 'pós-jogo', caption: 'Setor norte não sentou um minuto', likes: 1284, liked: false },
  { id: 'p2', author: 'Léo.Mansur', level: 12, moment: 'pré-jogo', caption: 'Chegando com a bandeira nova', likes: 412, liked: true },
  { id: 'p3', author: 'Rafa_9', level: 24, moment: 'durante', caption: 'Do meu ângulo o gol foi assim', likes: 318, liked: false },
  { id: 'p4', author: 'Marcela_10', level: 8, moment: 'pós-jogo', caption: 'Volta olímpica da arquibancada', likes: 265, liked: false },
  { id: 'p5', author: 'gustavo.b', level: 3, moment: 'durante', caption: 'Bar lotado, todo mundo de pé', likes: 190, liked: false },
];

const fmt = (n: number) => n.toLocaleString('pt-BR');

export function Fotos() {
  const [photos, setPhotos] = useState(PHOTOS);
  const [champion, ...gallery] = photos;

  const toggleLike = (id: string) =>
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p)));

  return (
    <div className={styles.page}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Fotos da torcida</h2>
        <span className={ui.pageSub}>Clube B 2 x 1 Clube E · 218 fotos</span>
        <div className={ui.spacer} />
        <button type="button" className={styles.upload}>
          <Icon name="add_a_photo" size={20} />
          Enviar foto · +40 XP
        </button>
      </div>

      <div className={styles.top}>
        <section className={styles.champion}>
          <div className={styles.championBar}>
            <Icon name="emoji_events" size={19} color="var(--gold)" />
            <div className={styles.championLabel}>Foto campeã do jogo</div>
            <div className={styles.championXp}>
              <Icon name="bolt" size={15} />
              +500 XP
            </div>
          </div>
          <Striped height={300} stripe={10} />
          <div className={styles.championFoot}>
            <div className={styles.championAvatar}>
              <Icon name="person" size={20} color="var(--gold)" />
            </div>
            <div className={styles.championInfo}>
              <div className={styles.author}>
                {champion.author}
                <LevelTag level={champion.level} size={9.5} />
              </div>
              <div className={styles.caption}>{champion.caption}</div>
            </div>
            <div className={styles.likesBig}>
              <Icon name="thumb_up" size={20} color="var(--gold)" />
              {fmt(champion.likes)}
            </div>
            <button type="button" className={styles.report} title="Denunciar" aria-label="Denunciar">
              <Icon name="flag" size={19} />
            </button>
          </div>
        </section>

        <div className={styles.stack}>
          <section className={ui.card}>
            <h3 className={styles.howTitle}>Como ganhar XP aqui</h3>
            <div className={styles.how}>
              <div className={styles.howRow}>
                <Icon name="add_a_photo" size={19} color="var(--primary)" />
                <div className={styles.howText}>Enviar foto</div>
                <strong className={styles.howXp}>+40 XP</strong>
              </div>
              <div className={styles.howRow}>
                <Icon name="thumb_up" size={19} color="var(--primary)" />
                <div className={styles.howText}>
                  Dar joinha <span>(até 20 por jogo)</span>
                </div>
                <strong className={styles.howXp}>+5 XP</strong>
              </div>
              <div className={styles.howRow}>
                <Icon name="emoji_events" size={19} color="var(--gold)" />
                <div className={styles.howText}>Foto mais votada</div>
                <strong className={styles.howXp}>+500 XP</strong>
              </div>
            </div>
          </section>
          <div className={styles.window}>
            <Icon name="lock_clock" size={19} color="var(--muted)" />
            <div>O envio abre 1 h antes do apito e fecha 1 h depois. Três fotos por partida, uma por janela.</div>
          </div>
        </div>
      </div>

      <div className={styles.gallery}>
        {gallery.map((p) => (
          <article key={p.id} className={styles.photo}>
            <div className={styles.thumb}>
              <Striped height={180} />
              <div className={styles.moment}>{p.moment}</div>
              <button
                type="button"
                aria-pressed={p.liked}
                className={p.liked ? `${styles.like} ${styles.liked}` : styles.like}
                onClick={() => toggleLike(p.id)}
              >
                <Icon name={p.liked ? 'thumb_up' : 'thumb_up_off_alt'} size={19} />
                {fmt(p.likes)}
              </button>
            </div>
            <div className={styles.photoBody}>
              <div className={styles.photoAuthor}>
                {p.author}
                <LevelTag level={p.level} />
                <button type="button" className={styles.flag} aria-label="Denunciar">
                  <Icon name="flag" size={17} />
                </button>
              </div>
              <div className={styles.photoCaption}>{p.caption}</div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
