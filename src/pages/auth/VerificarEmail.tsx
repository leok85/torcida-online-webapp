import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { guardarEmailPendente, lerEmailPendente, limparEmailPendente } from '../../auth/emailPendente';
import { mensagemDeErro } from '../../auth/erros';
import { DIGITOS_CODIGO, emailValido, REENVIO_SEGUNDOS } from '../../auth/validacao';
import { Alert } from '../../components/form/Alert';
import { Button } from '../../components/form/Button';
import { CodeInput } from '../../components/form/CodeInput';
import { TextField } from '../../components/form/TextField';
import { Icon } from '../../components/ui/Icon';
import { supabase } from '../../lib/supabase';
import { AuthLayout } from './AuthLayout';
import styles from './Auth.module.css';

export function VerificarEmail() {
  const navigate = useNavigate();
  const { state } = useLocation();
  // Chegando do cadastro ou do login o e-mail vem no state; num recarregamento, do sessionStorage.
  const [email, setEmail] = useState(() => (state as { email?: string } | null)?.email ?? lerEmailPendente() ?? '');
  const [temEmail, setTemEmail] = useState(!!email);
  const [codigo, setCodigo] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [reenvioEm, setReenvioEm] = useState(temEmail ? REENVIO_SEGUNDOS : 0);

  useEffect(() => {
    if (reenvioEm <= 0) return;
    const t = window.setTimeout(() => setReenvioEm((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [reenvioEm]);

  const emailLimpo = email.trim().toLowerCase();

  async function confirmar(token: string) {
    setVerificando(true);
    setErro(null);
    setAviso(null);
    const { error } = await supabase.auth.verifyOtp({ email: emailLimpo, token, type: 'email' });
    if (error) {
      setVerificando(false);
      setCodigo('');
      setErro(mensagemDeErro(error));
      return;
    }
    limparEmailPendente();
    navigate('/boas-vindas', { replace: true });
  }

  function digitar(valor: string) {
    setCodigo(valor);
    if (erro) setErro(null);
    if (valor.length === DIGITOS_CODIGO && !verificando) confirmar(valor);
  }

  async function enviarCodigo() {
    setEnviando(true);
    setErro(null);
    setAviso(null);
    const { error } = await supabase.auth.resend({ type: 'signup', email: emailLimpo });
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    guardarEmailPendente(emailLimpo);
    setTemEmail(true);
    setCodigo('');
    setReenvioEm(REENVIO_SEGUNDOS);
    setAviso('Código enviado. Confira também a caixa de spam.');
  }

  function pedirCodigo(e: FormEvent) {
    e.preventDefault();
    if (emailValido(emailLimpo)) enviarCodigo();
  }

  if (!temEmail) {
    return (
      <AuthLayout
        title="Confirme o e-mail"
        subtitle="Informe o e-mail da sua conta e enviaremos um código para confirmar que ele é seu."
        onBack={() => navigate('/entrar')}
      >
        <form className={styles.form} onSubmit={pedirCodigo} noValidate>
          {erro && <Alert>{erro}</Alert>}
          <TextField label="E-mail" icon="mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
          <Button type="submit" className={styles.submit} disabled={!emailValido(emailLimpo)} loading={enviando}>
            Enviar código
          </Button>
        </form>
      </AuthLayout>
    );
  }

  const minutos = Math.floor(reenvioEm / 60);
  const segundos = String(reenvioEm % 60).padStart(2, '0');

  return (
    <AuthLayout
      title="Confirme o e-mail"
      step="Passo 2 de 3 · verificação"
      onBack={() => navigate('/criar-conta')}
      subtitle={
        <>
          Enviamos um código de {DIGITOS_CODIGO} dígitos para <span className={styles.email}>{emailLimpo}</span>. Digite abaixo para confirmar
          que o e-mail é seu.
        </>
      }
      footer={
        <>
          E-mail errado? <Link to="/criar-conta">Voltar ao cadastro</Link>
        </>
      }
    >
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (codigo.length === DIGITOS_CODIGO) confirmar(codigo);
        }}
      >
        {erro && <Alert>{erro}</Alert>}
        {aviso && <Alert tone="success">{aviso}</Alert>}
        <CodeInput length={DIGITOS_CODIGO} value={codigo} onChange={digitar} error={!!erro} disabled={verificando} autoFocus />
        <div className={styles.resendRow}>
          <span>
            Não chegou?{' '}
            <button type="button" className={styles.link} disabled={reenvioEm > 0 || enviando} onClick={enviarCodigo}>
              Reenviar
            </button>
          </span>
          {reenvioEm > 0 && (
            <span className={styles.countdown}>
              novo envio em {minutos}:{segundos}
            </span>
          )}
        </div>
        <Button type="submit" className={styles.submit} disabled={codigo.length < DIGITOS_CODIGO} loading={verificando}>
          Confirmar
        </Button>
        <div className={styles.info}>
          <Icon name="schedule" size={19} />
          <span>O código vale por 1 hora. Se expirar, é só pedir outro. Confira também a caixa de spam.</span>
        </div>
      </form>
    </AuthLayout>
  );
}
