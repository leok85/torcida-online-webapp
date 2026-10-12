// E-mail e senha: os dois passam pelo Supabase Auth, com código de 6 dígitos quando ele pede confirmação.
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { mensagemDeErro } from '../../auth/erros';
import { DIGITOS_CODIGO, emailValido, REENVIO_SEGUNDOS, SENHA_MINIMA } from '../../auth/validacao';
import { Alert } from '../../components/form/Alert';
import { CodeInput } from '../../components/form/CodeInput';
import { TextField } from '../../components/form/TextField';
import { supabase } from '../../lib/supabase';
import { PasswordStrength } from '../auth/PasswordStrength';
import { BotoesDaEdicao } from './Linha';
import styles from './DadosDaConta.module.css';

type EdicaoProps = {
  onFechar: () => void;
  onSalvo: (mensagem: string) => void;
};

function useContagem(inicial: number) {
  const [segundos, setSegundos] = useState(inicial);
  useEffect(() => {
    if (segundos <= 0) return;
    const t = window.setTimeout(() => setSegundos((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [segundos]);
  return [segundos, setSegundos] as const;
}

type EtapaEmail = 'novo' | 'codigo-novo' | 'codigo-atual';

/**
 * Troca de e-mail em duas etapas: o endereço novo, depois o código de 6 dígitos enviado para ele.
 * Com a "troca segura" ligada no Supabase, o e-mail atual também recebe um código, pedido em seguida.
 * O e-mail atual continua valendo até a confirmação.
 */
export function EditarEmail({ onFechar, onSalvo }: EdicaoProps) {
  const { sessao } = useAuth();
  const atual = sessao?.user.email ?? '';
  const [etapa, setEtapa] = useState<EtapaEmail>('novo');
  const [novo, setNovo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [reenvioEm, setReenvioEm] = useContagem(0);
  const novoLimpo = novo.trim().toLowerCase();
  const igual = novoLimpo === atual.toLowerCase();

  async function pedirCodigo(e: FormEvent) {
    e.preventDefault();
    if (!emailValido(novoLimpo) || igual) return;
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.auth.updateUser({ email: novoLimpo });
    setEnviando(false);
    if (error) return setErro(mensagemDeErro(error));
    setEtapa('codigo-novo');
    setReenvioEm(REENVIO_SEGUNDOS);
  }

  async function confirmar(token: string) {
    setEnviando(true);
    setErro(null);
    setAviso(null);
    const email = etapa === 'codigo-novo' ? novoLimpo : atual;
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' });
    setEnviando(false);
    setCodigo('');
    if (error) return setErro(mensagemDeErro(error));
    // Na troca segura, o primeiro código só confirma metade: falta o do outro endereço.
    if (data.user?.email?.toLowerCase() !== novoLimpo && etapa === 'codigo-novo') {
      setEtapa('codigo-atual');
      return;
    }
    onSalvo('E-mail atualizado.');
    onFechar();
  }

  function digitar(valor: string) {
    setCodigo(valor);
    if (erro) setErro(null);
    if (valor.length === DIGITOS_CODIGO && !enviando) confirmar(valor);
  }

  async function reenviar() {
    setErro(null);
    setAviso(null);
    const { error } = await supabase.auth.resend({ type: 'email_change', email: novoLimpo });
    if (error) return setErro(mensagemDeErro(error));
    setReenvioEm(REENVIO_SEGUNDOS);
    setAviso('Código reenviado. Confira também a caixa de spam.');
  }

  if (etapa === 'novo') {
    return (
      <form onSubmit={pedirCodigo} noValidate className={styles.edicao}>
        <TextField
          label="Novo e-mail"
          icon="mail"
          type="email"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          placeholder="voce@email.com"
          autoComplete="email"
          autoFocus
          error={igual ? 'Esse já é o seu e-mail.' : null}
          hint="Vamos mandar um código para confirmar que o endereço é seu."
        />
        {erro && <Alert>{erro}</Alert>}
        <BotoesDaEdicao onCancelar={onFechar} salvando={enviando} podeSalvar={emailValido(novoLimpo) && !igual} rotulo="Enviar código" />
      </form>
    );
  }

  return (
    <div className={styles.edicao}>
      <p className={styles.edicaoTexto}>
        {etapa === 'codigo-novo' ? (
          <>
            Digite o código de 6 dígitos que enviamos para <strong>{novoLimpo}</strong>. Seu e-mail atual continua valendo até
            você confirmar.
          </>
        ) : (
          <>
            Falta confirmar pelo e-mail atual: digite o código que enviamos para <strong>{atual}</strong>.
          </>
        )}
      </p>
      <div className={styles.codigo}>
        <CodeInput length={DIGITOS_CODIGO} value={codigo} onChange={digitar} error={!!erro} disabled={enviando} autoFocus />
      </div>
      {erro && <Alert>{erro}</Alert>}
      {aviso && <Alert tone="success">{aviso}</Alert>}
      <button type="button" className={styles.linkPequeno} onClick={reenviar} disabled={reenvioEm > 0 || enviando}>
        {reenvioEm > 0 ? `Reenviar código em ${reenvioEm}s` : 'Reenviar código'}
      </button>
      <BotoesDaEdicao onCancelar={onFechar} salvando={enviando} podeSalvar={false} rotulo={null} />
    </div>
  );
}

type EditarSenhaProps = EdicaoProps & {
  /** Sem senha (entrou só pelo Google ou pela Apple), o formulário cria uma. */
  temSenha: boolean;
  /** Depois de salvar: a lista de aparelhos e o "tem senha" mudam. */
  onAlterada: () => void;
};

/** Alterar (com a senha atual) ou criar a senha. Ao trocar, os outros aparelhos saem da conta. */
export function EditarSenha({ temSenha, onFechar, onSalvo, onAlterada }: EditarSenhaProps) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetida, setRepetida] = useState('');
  // Com a "troca segura de senha" do Supabase, sessões com mais de 24 h precisam de um código enviado por e-mail.
  const [pedindoCodigo, setPedindoCodigo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const diferentes = !!repetida && repetida !== nova;
  const valida = nova.length >= SENHA_MINIMA && repetida === nova && (!temSenha || !!atual);

  async function gravar(nonce?: string) {
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.auth.updateUser({
      password: nova,
      ...(temSenha && { current_password: atual }),
      ...(nonce && { nonce }),
    });
    if (error?.code === 'reauthentication_needed') {
      const { error: erroCodigo } = await supabase.auth.reauthenticate();
      setSalvando(false);
      if (erroCodigo) return setErro(mensagemDeErro(erroCodigo));
      setPedindoCodigo(true);
      return;
    }
    if (error) {
      setSalvando(false);
      setCodigo('');
      return setErro(mensagemDeErro(error));
    }
    // A senha nova vale para todos os aparelhos: os outros precisam entrar de novo.
    await supabase.auth.signOut({ scope: 'others' });
    setSalvando(false);
    onSalvo(temSenha ? 'Senha alterada. Os outros aparelhos saíram da conta.' : 'Senha criada. Agora você também entra com e-mail e senha.');
    onAlterada();
    onFechar();
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (valida) gravar();
  }

  function digitar(valor: string) {
    setCodigo(valor);
    if (erro) setErro(null);
    if (valor.length === DIGITOS_CODIGO && !salvando) gravar(valor);
  }

  if (pedindoCodigo) {
    return (
      <div className={styles.edicao}>
        <p className={styles.edicaoTexto}>Para sua segurança, digite o código de 6 dígitos que enviamos para o seu e-mail.</p>
        <div className={styles.codigo}>
          <CodeInput length={DIGITOS_CODIGO} value={codigo} onChange={digitar} error={!!erro} disabled={salvando} autoFocus />
        </div>
        {erro && <Alert>{erro}</Alert>}
        <BotoesDaEdicao onCancelar={onFechar} salvando={salvando} podeSalvar={false} rotulo={null} />
      </div>
    );
  }

  return (
    <form onSubmit={salvar} noValidate className={styles.edicao}>
      {temSenha && (
        <TextField label="Senha atual" password value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" autoFocus />
      )}
      <TextField
        label={temSenha ? 'Nova senha' : 'Senha'}
        password
        value={nova}
        onChange={(e) => setNova(e.target.value)}
        autoComplete="new-password"
        autoFocus={!temSenha}
        below={nova && <PasswordStrength senha={nova} />}
        hint={`Pelo menos ${SENHA_MINIMA} caracteres.`}
      />
      <TextField
        label="Repita a senha"
        password
        value={repetida}
        onChange={(e) => setRepetida(e.target.value)}
        autoComplete="new-password"
        error={diferentes ? 'As senhas não são iguais.' : null}
      />
      {temSenha && <p className={styles.edicaoTexto}>Ao trocar a senha, os outros aparelhos saem da conta.</p>}
      {erro && <Alert>{erro}</Alert>}
      <BotoesDaEdicao onCancelar={onFechar} salvando={salvando} podeSalvar={valida} rotulo={temSenha ? 'Alterar senha' : 'Criar senha'} />
    </form>
  );
}
