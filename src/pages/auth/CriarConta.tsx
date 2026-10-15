import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { guardarEmailPendente } from '../../auth/emailPendente';
import { mensagemDeErro } from '../../auth/erros';
import { GoogleLogin } from '../../auth/GoogleLogin';
import { contaCorporativa } from '../../auth/contaCorporativa';
import { emailValido, SENHA_MINIMA, useApelido } from '../../auth/validacao';
import { Alert } from '../../components/form/Alert';
import { Button } from '../../components/form/Button';
import { Checkbox } from '../../components/form/Checkbox';
import { TextField } from '../../components/form/TextField';
import { Icon } from '../../components/ui/Icon';
import { BONUS_DO_CONVITE, conviteDe, lerConvitePendente, limparConvitePendente } from '../../convites/convites';
import { SITE } from '../../data/common';
import { setManterConectado, supabase } from '../../lib/supabase';
import { AuthLayout } from './AuthLayout';
import { PasswordStrength } from './PasswordStrength';
import styles from './Auth.module.css';

/** "Léo.Mansur" → "LM"; "Rafa_9" → "RA". */
function iniciais(apelido: string) {
  const partes = apelido.split(/[._]/).filter(Boolean);
  return (partes.length > 1 ? partes[0][0] + partes[1][0] : apelido.slice(0, 2)).toUpperCase();
}

export function CriarConta() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [nome, setNome] = useState('');
  const [apelidoDigitado, setApelido] = useState('');
  const [email, setEmail] = useState('');
  const [emailTocado, setEmailTocado] = useState(false);
  const [senha, setSenha] = useState('');
  const [maiorDeIdade, setMaiorDeIdade] = useState(false);
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [novidades, setNovidades] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** E-mail que o Supabase disse já ter conta; o alerta some quando o e-mail digitado muda. */
  const [emailEmUso, setEmailEmUso] = useState<string | null>(null);

  /** Quem chamou, quando a pessoa chegou pelo link /r/APELIDO. */
  const [convite, setConvite] = useState<{ apelido: string; clube: string | null } | null>(null);

  useEffect(() => {
    const codigo = lerConvitePendente();
    if (!codigo) return;
    let vivo = true;
    conviteDe(codigo).then((dono) => {
      if (!vivo) return;
      if (dono) setConvite(dono);
      else limparConvitePendente();
    });
    return () => {
      vivo = false;
    };
  }, []);

  const apelido = useApelido(apelidoDigitado);
  const emailLimpo = email.trim().toLowerCase();
  const emailInvalido = !!emailLimpo && !emailValido(emailLimpo);
  const jaTemConta = !!emailLimpo && emailEmUso === emailLimpo;
  const corporativo = contaCorporativa(emailLimpo);
  const emailErro = jaTemConta
    ? 'Já existe uma conta com esse e-mail.'
    : corporativo
      ? 'E-mail corporativo é só para o back-office. Use seu e-mail pessoal.'
      : emailTocado && emailInvalido
        ? 'Confira o e-mail digitado.'
        : null;

  const valido =
    !!nome.trim() && apelido.ok && !!emailLimpo && !emailInvalido && !corporativo && !jaTemConta && senha.length >= SENHA_MINIMA && maiorDeIdade && aceitouTermos;

  async function continuar(e: FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setEnviando(true);
    setErro(null);
    setManterConectado(true);
    const { data, error } = await supabase.auth.signUp({
      email: emailLimpo,
      password: senha,
      // Vai para raw_user_meta_data; o trigger criar_perfil_do_usuario monta o perfil com esses campos.
      options: { data: { nome: nome.trim(), apelido: apelido.limpo, aceitou_termos: true, quer_novidades: novidades, ...(convite && { convite: convite.apelido }) } },
    });
    setEnviando(false);

    if (error) {
      if (error.code === 'user_already_exists' || error.code === 'email_exists') setEmailEmUso(emailLimpo);
      else setErro(mensagemDeErro(error));
      return;
    }
    // Com confirmação de e-mail ligada, o Supabase não revela se a conta existe: devolve um usuário sem identidades.
    if (data.user && data.user.identities?.length === 0) {
      setEmailEmUso(emailLimpo);
      return;
    }
    // Sem confirmação de e-mail no projeto, a sessão já vem pronta e os guards seguem para o onboarding.
    if (data.session) return;

    guardarEmailPendente(emailLimpo);
    navigate('/verificar-email', { state: { email: emailLimpo } });
  }

  return (
    <AuthLayout
      title={convite ? 'Aceite o convite' : 'Crie sua conta'}
      subtitle="Leva menos de um minuto. Depois você escolhe seu time."
      step="Passo 1 de 3 · dados de acesso"
      onBack={() => navigate('/entrar', { state })}
      footer={
        <>
          Já tem conta? <Link to="/entrar" state={state}>Entrar</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={continuar} noValidate>
        {convite && (
          <div className={styles.convite}>
            <span className={styles.conviteAvatar} aria-hidden="true">
              {iniciais(convite.apelido)}
            </span>
            <div className={styles.conviteTexto}>
              <strong>
                {convite.apelido} te chamou para {convite.clube ? `a torcida do ${convite.clube}` : 'a Torcida Online'}
              </strong>
              <span>Convite já aplicado. Quando você escolher o clube, vocês dois ganham +{BONUS_DO_CONVITE} XP.</span>
            </div>
            <span className={styles.conviteXp}>
              <Icon name="bolt" size={15} />+{BONUS_DO_CONVITE} XP
            </span>
          </div>
        )}
        {jaTemConta && (
          <Alert
            title="Esse e-mail já tem conta na Torcida Online"
            actions={
              <>
                <Button fullWidth={false} onClick={() => navigate('/entrar', { state })}>
                  Entrar
                </Button>
                <Button variant="neutral" fullWidth={false} onClick={() => navigate('/recuperar-senha', { state: { email: emailLimpo } })}>
                  Recuperar senha
                </Button>
              </>
            }
          >
            Você pode entrar com ele ou recuperar a senha. Se não foi você que criou,{' '}
            <a href={SITE.suporte} target="_blank" rel="noreferrer">
              fale com o suporte
            </a>
            .
          </Alert>
        )}
        {erro && <Alert>{erro}</Alert>}

        <TextField label="Nome" icon="person_outline" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" autoComplete="name" maxLength={80} autoFocus />
        <TextField
          label="Apelido na torcida"
          icon="alternate_email"
          value={apelidoDigitado}
          onChange={(e) => setApelido(e.target.value)}
          placeholder="apelido"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          pending={apelido.status === 'verificando'}
          error={apelido.erro}
          success={apelido.ok ? 'Apelido disponível.' : null}
          hint="É assim que a torcida vai te ver no chat e no ranking."
        />
        <TextField
          label="E-mail"
          icon="mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTocado(true)}
          placeholder="seu@email.com"
          autoComplete="email"
          error={emailErro}
        />
        <TextField
          label="Senha"
          icon="lock"
          password
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder={`mínimo ${SENHA_MINIMA} caracteres`}
          autoComplete="new-password"
          below={<PasswordStrength senha={senha} />}
        />

        <div className={styles.consents}>
          <Checkbox checked={maiorDeIdade} onChange={setMaiorDeIdade}>
            Tenho 18 anos ou mais.
          </Checkbox>
          <Checkbox checked={aceitouTermos} onChange={setAceitouTermos}>
            Li e aceito os{' '}
            <a href={SITE.termos} target="_blank" rel="noreferrer">
              Termos de uso
            </a>{' '}
            e a{' '}
            <a href={SITE.privacidade} target="_blank" rel="noreferrer">
              Política de privacidade
            </a>
            .
          </Checkbox>
          <Checkbox checked={novidades} onChange={setNovidades} muted>
            Quero receber novidades e avisos de premiação por e-mail. <span className={styles.optional}>Opcional.</span>
          </Checkbox>
        </div>

        <Button type="submit" className={styles.submit} disabled={!valido} loading={enviando}>
          {jaTemConta ? 'Corrija o e-mail para continuar' : 'Criar conta'}
        </Button>
      </form>

      <GoogleLogin divider="OU" />
    </AuthLayout>
  );
}
