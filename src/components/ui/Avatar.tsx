import { Icon } from './Icon';
import styles from './Avatar.module.css';

type AvatarProps = {
  size: number;
  iconSize: number;
  level?: number;
  /** URL da foto do torcedor; sem ela, mostra o boneco. */
  foto?: string | null;
};

export function Avatar({ size, iconSize, level, foto }: AvatarProps) {
  const circle = (
    <div className={styles.avatar} style={{ width: size, height: size }}>
      {foto ? <img src={foto} alt="" className={styles.foto} /> : <Icon name="person" size={iconSize} />}
    </div>
  );
  if (level === undefined) return circle;
  const badge = size >= 40 ? 20 : 17;
  return (
    <div className={styles.wrap}>
      {circle}
      <div className={styles.level} style={{ height: badge, minWidth: badge, padding: `0 ${badge > 17 ? 5 : 4}px`, fontSize: badge > 17 ? 12 : 10.5 }}>
        {level}
      </div>
    </div>
  );
}

export function LevelTag({ level, size = 9 }: { level: number; size?: number }) {
  return (
    <span className={styles.levelTag} style={{ fontSize: size }}>
      {level}
    </span>
  );
}
