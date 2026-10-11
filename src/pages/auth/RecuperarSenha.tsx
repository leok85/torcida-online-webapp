import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { mensagemDeErro } from '../../auth/erros';
import { DIGITOS_CODIGO, emailValido, REENVIO_SEGUNDOS, SENHA_MINIMA } from '../../auth/validacao';
import { Alert } from '../../components/form/Alert';
import { Button } from '../../components/form/Button';
import { CodeInput } from '../../components/form/CodeInput';
import { TextField } from '../../components/form/TextField';
import { supabase } from '../../lib/supabase';
import { AuthLayout } from './AuthLayout';
import { PasswordStrength } from './PasswordStrength';
import styles from './Auth.module.css';

export function RecuperarSenha() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [email, setEmail] = useState((state as { email?: string } | null)?.email ?? '');
  const [etapa, setEtapa] = useState<'email' | 'codigo'>('email');
  const [codigo, setCodigo] = useState('');
  /** O código é de uso único: depois de validado, só a senha nova pode ser redigitada. */
  const [codigoValidado, setCodigoValidado] = useState(false);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [reenvioEm, setReenvioEm] = useState(0);

  useEffect(() => {
    if (reenvioEm <= 0) return;
    const t = window.setTimeout(() => setReenvioEm((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [reenvioEm]);

  const emailLimpo = email.trim().toLowerCase();
  const confirmacaoErro = confirmacao && confirmacao !== senha ? 'As senhas não são iguais.' : null;
  const podeSalvar = (codigoValidado || codigo.length === DIGITOS_CODIGO) && senha.length >= SENHA_MINIMA && senha === confirmacao;

  async function enviarCodigo(e?: FormEvent) {
    e?.preventDefault();
    if (!emailValido(emailLimpo)) return;
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.auth.resetPasswordForEmail(emailLimpo);
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    setEtapa('codigo');
    setCodigo('');
    setReenvioEm(REENVIO_SEGUNDOS);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!podeSalvar) return;
    setEnviando(true);
    setErro(null);
    if (!codigoValidado) {
      const { error } = await supabase.auth.verifyOtp({ email: emailLimpo, token: codigo, type: 'recovery' });
      if (error) {
        setEnviando(false);
        setCodigo('');
        setErro(mensagemDeErro(error));
        return;
      }
      setCodigoValidado(true);
    }
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setEnviando(false);
      setErro(mensagemDeErro(error));
      return;
    }
    navigate('/', { replace: true });
  }

  if (etapa === 'email') {
    return (
      <AuthLayout
        title="Recuperar senha"
        subtitle="Informe o e-mail da sua conta. Vamos enviar um código para você criar uma senha nova."
        onBack={() => navigate('/entrar')}
        footer={
          <>
            Lembrou a senha? <Link to="/entrar">Entrar</Link>
          </>
        }
      >
        <form className={styles.form} onSubmit={enviarCodigo} noValidate>
          {erro && <Alert>{erro}</Alert>}
          <TextField label="E-mail" icon="mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" autoFocus />
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
      title="Nova senha"
      onBack={codigoValidado ? undefined : () => setEtapa('email')}
      subtitle={
        codigoValidado ? (
          'Código confirmado. Agora é só escolher a senha nova.'
        ) : (
          <>
            Se existir uma conta com <span className={styles.email}>{emailLimpo}</span>, enviamos um código de {DIGITOS_CODIGO} dígitos para ela.
          </>
        )
      }
    >
      <form className={styles.form} onSubmit={salvar} noValidate>
        {erro && <Alert>{erro}</Alert>}
        {!codigoValidado && (
          <>
            <CodeInput length={DIGITOS_CODIGO} value={codigo} onChange={setCodigo} error={!!erro && codigo.length === 0} autoFocus />
            <div className={styles.resendRow}>
              <span>
                Não chegou?{' '}
                <button type="button" className={styles.link} disabled={reenvioEm > 0 || enviando} onClick={() => enviarCodigo()}>
                  Reenviar
                </button>
              </span>
              {reenvioEm > 0 && (
                <span className={styles.countdown}>
                  novo envio em {minutos}:{segundos}
                </span>
              )}
            </div>
          </>
        )}
        <TextField
          label="Senha nova"
          icon="lock"
          password
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder={`mínimo ${SENHA_MINIMA} caracteres`}
          autoComplete="new-password"
          below={<PasswordStrength senha={senha} />}
        />
        <TextField
          label="Repita a senha nova"
          icon="lock"
          password
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoComplete="new-password"
          error={confirmacaoErro}
        />
        <Button type="submit" className={styles.submit} disabled={!podeSalvar} loading={enviando}>
          Salvar senha e entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
