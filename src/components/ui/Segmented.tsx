import styles from './Segmented.module.css';

type Option<T extends string> = { id: T; label: string };

type SegmentedProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: 'xs' | 'sm' | 'lg';
  className?: string;
};

export function Segmented<T extends string>({ options, value, onChange, size = 'sm', className }: SegmentedProps<T>) {
  const rootClass = [styles.root, size !== 'sm' && styles[size], className].filter(Boolean).join(' ');
  return (
    <div className={rootClass} role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={o.id === value}
          className={o.id === value ? `${styles.option} ${styles.active}` : styles.option}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
