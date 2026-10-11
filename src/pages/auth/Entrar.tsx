import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { guardarEmailPendente } from '../../auth/emailPendente';
import { mensagemDeErro } from '../../auth/erros';
import { GoogleLogin } from '../../auth/GoogleLogin';
import { emailValido } from '../../auth/validacao';
import { Alert } from '../../components/form/Alert';
import { Button } from '../../components/form/Button';
import { Checkbox } from '../../components/form/Checkbox';
import { TextField } from '../../components/form/TextField';
import { Icon } from '../../components/ui/Icon';
import { setManterConectado, supabase } from '../../lib/supabase';
import { AuthLayout } from './AuthLayout';
import styles from './Auth.module.css';

export function Entrar() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [manterConectado, setManter] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [naoConfirmado, setNaoConfirmado] = useState(false);
  const [reenviando, setReenviando] = useState(false);

  const emailLimpo = email.trim().toLowerCase();

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setNaoConfirmado(false);
    if (!emailValido(emailLimpo) || !senha) {
      setErro('Preencha seu e-mail e sua senha.');
      return;
    }
    setEnviando(true);
    setManterConectado(manterConectado);
    const { error } = await supabase.auth.signInWithPassword({ email: emailLimpo, password: senha });
    // Com sucesso, a sessão nova faz o guard levar o torcedor para onde ele queria ir.
    if (!error) return;
    setEnviando(false);
    if (error.code === 'email_not_confirmed') setNaoConfirmado(true);
    else setErro(mensagemDeErro(error));
  }

  async function confirmarEmail() {
    setReenviando(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: emailLimpo });
    setReenviando(false);
    // Limite de envio estourado quer dizer que um código saiu há pouco: segue para digitá-lo.
    if (error && error.code !== 'over_email_send_rate_limit') {
      setErro(mensagemDeErro(error));
      return;
    }
    guardarEmailPendente(emailLimpo);
    navigate('/verificar-email', { state: { email: emailLimpo } });
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Acompanhe seu time e suba de nível junto com a torcida."
      footer={
        <>
          Primeira vez aqui? <Link to="/criar-conta" state={state}>Criar conta</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={entrar} noValidate>
        {naoConfirmado && (
          <Alert
            tone="warn"
            title="Falta confirmar seu e-mail"
            actions={
              <Button fullWidth={false} loading={reenviando} onClick={confirmarEmail}>
                Enviar código
              </Button>
            }
          >
            Enviamos um código para {emailLimpo} quando você criou a conta. Peça um novo para confirmar e entrar.
          </Alert>
        )}
        {erro && <Alert>{erro}</Alert>}
        <TextField
          label="E-mail"
          icon="mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@email.com"
          autoComplete="email"
          autoFocus
        />
        <TextField
          label="Senha"
          icon="lock"
          password
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="current-password"
        />
        <div className={styles.rowBetween}>
          <Checkbox checked={manterConectado} onChange={setManter}>
            Manter conectado
          </Checkbox>
          <Link to="/recuperar-senha" state={{ email: emailLimpo }} className={styles.link}>
            Esqueci a senha
          </Link>
        </div>
        <Button type="submit" className={styles.submit} loading={enviando}>
          Entrar
        </Button>
      </form>

      <GoogleLogin divider="OU ENTRE COM" />

      <div className={styles.tip}>
        <Icon name="bolt" size={19} color="var(--green-dark)" />
        <div>Entrar todo dia rende XP. Sua sequência de login conta para as missões da semana.</div>
      </div>
    </AuthLayout>
  );
}
