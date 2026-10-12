// E-mail e senha: os dois passam pelo Supabase Auth, com código de 6 dígitos quando ele pede confirmação.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { mensagemDeErro } from '../../auth/erros';
import { DIGITOS_CODIGO, emailValido, forcaDaSenha, REENVIO_SEGUNDOS, SENHA_MINIMA } from '../../auth/validacao';
import { Alert } from '../../components/form/Alert';
import { CodeInput } from '../../components/form/CodeInput';
import { supabase } from '../../lib/supabase';
import type { EdicaoProps } from './EditarPerfil';
import { Botoes, Campo, Edicao } from './Linha';
import styles from './DadosDaConta.module.css';

function useContagem() {
  const [segundos, setSegundos] = useState(0);
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
  const [reenvioEm, setReenvioEm] = useContagem();
  const novoLimpo = novo.trim().toLowerCase();
  const valido = emailValido(novoLimpo) && novoLimpo !== atual.toLowerCase();

  async function pedirCodigo() {
    if (!valido) return;
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.auth.updateUser({ email: novoLimpo });
    setEnviando(false);
    if (error) return setErro(mensagemDeErro(error));
    setCodigo('');
    setEtapa('codigo-novo');
    setReenvioEm(REENVIO_SEGUNDOS);
  }

  async function confirmar() {
    if (codigo.length !== DIGITOS_CODIGO) return;
    setEnviando(true);
    setErro(null);
    setAviso(null);
    const email = etapa === 'codigo-novo' ? novoLimpo : atual;
    const { data, error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email_change' });
    setEnviando(false);
    setCodigo('');
    if (error) return setErro(mensagemDeErro(error));
    // Na troca segura, o primeiro código só confirma metade: falta o do outro endereço.
    if (etapa === 'codigo-novo' && data.user?.email?.toLowerCase() !== novoLimpo) return setEtapa('codigo-atual');
    onSalvo('E-mail confirmado');
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
      <Edicao titulo="Novo e-mail" onSubmit={pedirCodigo}>
        <Campo
          icone="mail"
          rotulo="Novo e-mail"
          type="email"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          placeholder="novo@email.com"
          autoComplete="email"
          autoFocus
          estado={novoLimpo && !valido ? 'erro' : 'normal'}
        />
        <div className={styles.ajuda}>
          {novoLimpo && novoLimpo === atual.toLowerCase()
            ? 'Esse já é o seu e-mail.'
            : 'Enviamos um código para o novo endereço. O e-mail atual continua valendo até você confirmar.'}
        </div>
        {erro && <Alert>{erro}</Alert>}
        <Botoes onCancelar={onFechar} rotulo="Enviar código" podeSalvar={valido} salvando={enviando} />
      </Edicao>
    );
  }

  return (
    <Edicao titulo={etapa === 'codigo-novo' ? 'Confirme o novo e-mail' : 'Confirme pelo e-mail atual'} onSubmit={confirmar}>
      <p className={styles.edicaoTexto}>
        Digite o código de 6 dígitos enviado para <strong>{etapa === 'codigo-novo' ? novoLimpo : atual}</strong>.
        {etapa === 'codigo-atual' && ' Ele confirma que a troca foi pedida por você.'}
      </p>
      <div className={styles.codigo}>
        <CodeInput length={DIGITOS_CODIGO} value={codigo} onChange={setCodigo} error={!!erro} disabled={enviando} autoFocus />
      </div>
      <div className={styles.codigoLinks}>
        <span>
          Não chegou?{' '}
          <button type="button" onClick={reenviar} disabled={reenvioEm > 0 || enviando}>
            {reenvioEm > 0 ? `Reenviar em ${reenvioEm}s` : 'Reenviar'}
          </button>
        </span>
        {etapa === 'codigo-novo' && (
          <button type="button" onClick={() => setEtapa('novo')} disabled={enviando}>
            Corrigir e-mail
          </button>
        )}
      </div>
      {erro && <Alert>{erro}</Alert>}
      {aviso && <Alert tone="success">{aviso}</Alert>}
      <Botoes onCancelar={onFechar} rotulo="Confirmar" podeSalvar={codigo.length === DIGITOS_CODIGO} salvando={enviando} />
    </Edicao>
  );
}

type EditarSenhaProps = EdicaoProps & {
  /** Sem senha (entrou só pelo Google ou pela Apple), o formulário cria uma. */
  temSenha: boolean;
  /** Depois de salvar: a data da senha e a lista de aparelhos mudam. */
  onAlterada: () => void;
};

/** Alterar (com a senha atual) ou criar a senha. Ao trocar, os outros aparelhos saem da conta. */
export function EditarSenha({ temSenha, onFechar, onSalvo, onAlterada }: EditarSenhaProps) {
  const { sessao } = useAuth();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  // Com a "troca segura de senha" do Supabase, sessões com mais de 24 h precisam de um código enviado por e-mail.
  const [pedindoCodigo, setPedindoCodigo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const forca = forcaDaSenha(nova);
  const valida = nova.length >= SENHA_MINIMA && (!temSenha || !!atual);

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
    onAlterada();
    onSalvo(temSenha ? 'Senha alterada. Outros aparelhos foram desconectados.' : 'Senha criada');
  }

  if (pedindoCodigo) {
    return (
      <Edicao titulo="Confirme que é você" onSubmit={() => gravar(codigo)}>
        <p className={styles.edicaoTexto}>
          Para sua segurança, digite o código de 6 dígitos enviado para <strong>{sessao?.user.email}</strong>.
        </p>
        <div className={styles.codigo}>
          <CodeInput length={DIGITOS_CODIGO} value={codigo} onChange={setCodigo} error={!!erro} disabled={salvando} autoFocus />
        </div>
        {erro && <Alert>{erro}</Alert>}
        <Botoes onCancelar={onFechar} rotulo="Confirmar" podeSalvar={codigo.length === DIGITOS_CODIGO} salvando={salvando} />
      </Edicao>
    );
  }

  return (
    <Edicao titulo={temSenha ? 'Alterar senha' : 'Criar senha'} onSubmit={() => valida && gravar()}>
      <div className={styles.senhaGrade}>
        {temSenha && (
          <div>
            <Campo icone="lock" rotulo="Senha atual" rotuloVisivel senha value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" autoFocus />
            <Link to="/recuperar-senha" state={{ email: sessao?.user.email }} className={styles.linkPequeno}>
              Esqueci a senha atual
            </Link>
          </div>
        )}
        <div>
          <Campo
            icone="key"
            rotulo="Nova senha"
            rotuloVisivel
            senha
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            placeholder={`mínimo ${SENHA_MINIMA} caracteres`}
            autoComplete="new-password"
            autoFocus={!temSenha}
          />
          <div className={styles.forca} aria-live="polite">
            <div className={styles.forcaBarras}>
              {[1, 2, 3, 4].map((i) => (
                <span key={i} style={i <= forca.nivel ? { background: forca.cor } : undefined} />
              ))}
            </div>
            <span className={styles.forcaRotulo} style={{ color: forca.cor }}>
              {forca.rotulo}
            </span>
          </div>
        </div>
      </div>
      <div className={styles.ajuda}>Ao trocar, os outros aparelhos saem da conta e precisam entrar de novo.</div>
      {erro && <Alert>{erro}</Alert>}
      <Botoes onCancelar={onFechar} rotulo={temSenha ? 'Salvar nova senha' : 'Criar senha'} podeSalvar={valida} salvando={salvando} />
    </Edicao>
  );
}
