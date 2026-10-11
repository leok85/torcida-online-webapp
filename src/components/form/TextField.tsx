import { useId, useRef, useState, type InputHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import styles from './TextField.module.css';

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label?: string;
  icon?: string;
  error?: string | null;
  /** Validação positiva: borda verde, check à direita e mensagem em verde. */
  success?: string | null;
  /** Texto de ajuda abaixo do campo quando não há erro nem sucesso. */
  hint?: ReactNode;
  /** Campo de senha com botão de mostrar/ocultar. */
  password?: boolean;
  /** Mostra um indicador de verificação em andamento à direita. */
  pending?: boolean;
  /** Conteúdo logo abaixo da caixa (ex.: medidor de força da senha). */
  below?: ReactNode;
};

export function TextField({ label, icon, error, success, hint, password, pending, below, id, type, disabled, ...inputProps }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const message = error ?? success ?? hint;

  // Clicar em qualquer ponto da caixa (ícone, borda, espaço vazio) foca o campo. O próprio input e o botão de
  // mostrar a senha seguem o comportamento normal.
  function focarCampo(e: MouseEvent<HTMLDivElement>) {
    const alvo = e.target as HTMLElement;
    if (disabled || alvo === inputRef.current || alvo.closest('button')) return;
    e.preventDefault();
    inputRef.current?.focus();
  }

  const boxCls = [styles.box, disabled && styles.disabled, error ? styles.error : success && styles.success].filter(Boolean).join(' ');

  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <div className={boxCls} onMouseDown={focarCampo}>
        {icon && <Icon name={icon} size={20} className={styles.icon} />}
        <input
          ref={inputRef}
          id={inputId}
          className={styles.input}
          type={password ? (showPassword ? 'text' : 'password') : type}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? msgId : undefined}
          {...inputProps}
        />
        {pending && <span className={styles.pending} aria-label="Verificando" />}
        {!error && !pending && success && <Icon name="check_circle" size={20} color="var(--green-dark)" />}
        {password && (
          <button
            type="button"
            className={styles.eye}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={21} />
          </button>
        )}
      </div>
      {below}
      {error ? (
        <div id={msgId} className={styles.errorMsg} role="alert">
          <Icon name="error_outline" size={15} />
          {error}
        </div>
      ) : success ? (
        <div id={msgId} className={styles.successMsg}>
          {success}
        </div>
      ) : hint ? (
        <div id={msgId} className={styles.hint}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
