import { useState } from 'react';
import styles from './CodeInput.module.css';

type CodeInputProps = {
  length: number;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
};

/** Um input invisível recebe os dígitos (inclusive colados); as caixas só mostram o valor. */
export function CodeInput({ length, value, onChange, error, disabled, autoFocus }: CodeInputProps) {
  const [focused, setFocused] = useState(false);
  const complete = value.length === length;

  return (
    <div className={styles.cells}>
      {Array.from({ length }, (_, i) => {
        const active = focused && (i === value.length || (complete && i === length - 1));
        const cls = [styles.cell, value[i] && styles.filled, active && styles.active, error && styles.error].filter(Boolean).join(' ');
        return (
          <div key={i} className={cls} aria-hidden="true">
            {value[i] ?? ''}
          </div>
        );
      })}
      <input
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        // Sem maxLength: o navegador cortaria o texto colado ("123 456") antes de tirarmos os não-dígitos.
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={`Código de ${length} dígitos`}
        aria-invalid={error || undefined}
      />
    </div>
  );
}
