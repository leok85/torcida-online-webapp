import { useEffect, useState } from 'react';
import { Alert } from '../components/form/Alert';
import { Button } from '../components/form/Button';
import { provedoresAtivos, setManterConectado, supabase } from '../lib/supabase';
import { mensagemDeErro } from './erros';
import styles from '../pages/auth/Auth.module.css';

/** Divisor + botão do Google. Não aparece enquanto o provedor estiver desligado no Supabase. */
export function GoogleLogin({ divider }: { divider: string }) {
  const [ativo, setAtivo] = useState(false);
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    provedoresAtivos().then((p) => vivo && setAtivo(!!p.google));
    return () => {
      vivo = false;
    };
  }, []);

  if (!ativo) return null;

  async function entrar() {
    setIndo(true);
    setErro(null);
    setManterConectado(true);
    // Volta para a raiz; os guards mandam para o onboarding se o perfil ainda não estiver completo.
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } });
    if (error) {
      setIndo(false);
      setErro(mensagemDeErro(error));
    }
  }

  return (
    <>
      <div className={styles.divider}>{divider}</div>
      <Button variant="neutral" loading={indo} onClick={entrar}>
        <svg className={styles.googleMark} viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        Google
      </Button>
      {erro && (
        <div className={styles.submit}>
          <Alert>{erro}</Alert>
        </div>
      )}
    </>
  );
}
