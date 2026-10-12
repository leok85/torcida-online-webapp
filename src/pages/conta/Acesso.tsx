// Cartão Acesso: e-mail, senha e as contas Apple e Google ligadas.
import { useCallback, useEffect, useState } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import { useAuth } from '../../auth/AuthContext';
import { mensagemDeErro } from '../../auth/erros';
import { Alert } from '../../components/form/Alert';
import { Icon } from '../../components/ui/Icon';
import { Carregando, Skeleton } from '../../components/ui/Skeleton';
import { emailDaIdentidade, formasDeEntrar, identidadeDe, textoDaSenha } from '../../data/conta';
import { provedoresAtivos, supabase } from '../../lib/supabase';
import { EditarEmail, EditarSenha } from './EditarAcesso';
import { Linha } from './Linha';
import styles from './DadosDaConta.module.css';

const SOCIAIS = [
  { id: 'apple', nome: 'Apple' },
  { id: 'google', nome: 'Google' },
] as const;

type Social = (typeof SOCIAIS)[number]['id'];

type Dados = { identidades: UserIdentity[]; ativos: Record<string, boolean> };

function useFormasDeEntrar() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    Promise.all([formasDeEntrar(), provedoresAtivos()]).then(
      ([identidades, ativos]) => {
        if (!ativo) return;
        setDados({ identidades, ativos });
        setErro(false);
      },
      () => ativo && setErro(true),
    );
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);
  return { dados, erro, recarregar };
}

type AcessoProps = {
  editando: string | null;
  onEditar: (campo: string | null) => void;
  onSalvo: (mensagem: string) => void;
  /** A troca de senha tira os outros aparelhos: a lista precisa recarregar. */
  onSenhaAlterada: () => void;
};

export function Acesso({ editando, onEditar, onSalvo, onSenhaAlterada }: AcessoProps) {
  const { sessao, perfil } = useAuth();
  const { dados, erro, recarregar } = useFormasDeEntrar();
  // A data vem do perfil (trigger ao_trocar_senha); depois de salvar aqui, vale a hora da troca.
  const [senhaAlteradaEm, setSenhaAlteradaEm] = useState(perfil?.senha_alterada_em ?? null);
  const [erroSocial, setErroSocial] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<Social | null>(null);
  const fechar = () => onEditar(null);
  const temSenha = !!senhaAlteradaEm;

  const ligadas = dados ? SOCIAIS.filter((s) => identidadeDe(dados.identidades, s.id)).length : 0;
  const formas = ligadas + (temSenha ? 1 : 0);

  async function conectar(provedor: Social, nome: string) {
    setErroSocial(null);
    if (!dados?.ativos[provedor]) return setErroSocial(`Entrar com ${nome === 'Apple' ? 'a Apple' : 'o Google'} ainda não está disponível.`);
    setOcupado(provedor);
    // Sai para o Google ou a Apple e volta para esta tela com a conta ligada.
    const { error } = await supabase.auth.linkIdentity({ provider: provedor, options: { redirectTo: `${window.location.origin}/conta/dados` } });
    if (error) {
      setOcupado(null);
      setErroSocial(mensagemDeErro(error));
    }
  }

  async function desvincular(provedor: Social, nome: string) {
    const identidade = dados && identidadeDe(dados.identidades, provedor);
    if (!identidade) return;
    setErroSocial(null);
    setOcupado(provedor);
    const { error } = await supabase.auth.unlinkIdentity(identidade);
    setOcupado(null);
    if (error) return setErroSocial(mensagemDeErro(error));
    onSalvo(`${nome} desvinculado`);
    recarregar();
  }

  return (
    <section className={styles.cartao} aria-labelledby="titulo-acesso">
      <div className={styles.cabecalho}>
        <h2 id="titulo-acesso" className={styles.cabecalhoTitulo}>
          Acesso
        </h2>
        {dados && <span className={styles.cabecalhoInfo}>{formas === 1 ? '1 forma de entrar' : `${formas} formas de entrar`}</span>}
      </div>

      {editando === 'email' ? (
        <EditarEmail onFechar={fechar} onSalvo={onSalvo} />
      ) : (
        <Linha
          rotulo="E-mail"
          valor={sessao?.user.email ?? ''}
          apoio="Usado para entrar, recibos e avisos de prêmios."
          acoes={
            <button type="button" className={styles.acao} onClick={() => onEditar('email')} aria-label="Alterar e-mail">
              Alterar
            </button>
          }
        />
      )}

      {editando === 'senha' ? (
        <EditarSenha
          temSenha={temSenha}
          onFechar={fechar}
          onSalvo={onSalvo}
          onAlterada={() => {
            setSenhaAlteradaEm(new Date().toISOString());
            onSenhaAlterada();
          }}
        />
      ) : (
        <Linha
          rotulo="Senha"
          valor={temSenha ? '••••••••••' : <div className={styles.valorApagado}>Sem senha</div>}
          apoio={temSenha ? textoDaSenha(senhaAlteradaEm!) : 'Hoje você entra só pelo Google ou pela Apple.'}
          acoes={
            <button type="button" className={styles.acao} onClick={() => onEditar('senha')} aria-label={temSenha ? 'Alterar senha' : 'Criar senha'}>
              {temSenha ? 'Alterar' : 'Criar senha'}
            </button>
          }
        />
      )}

      {!dados && erro && (
        <div className={styles.alertaCartao}>
          <Alert
            actions={
              <button type="button" className={styles.acao} onClick={recarregar}>
                Tentar de novo
              </button>
            }
          >
            Não deu para carregar suas formas de entrar.
          </Alert>
        </div>
      )}

      {!dados && !erro && (
        <Carregando rotulo="Carregando formas de entrar">
          {SOCIAIS.map((s) => (
            <div key={s.id} className={styles.linha}>
              <div className={styles.rotulo}>{s.nome}</div>
              <div className={styles.valorBloco}>
                <Skeleton w={110} h={12} r="pilula" />
                <Skeleton w={220} h={10} r="pilula" style={{ marginTop: 6 }} />
              </div>
              <Skeleton w={92} h={36} r={9} />
            </div>
          ))}
        </Carregando>
      )}

      {dados &&
        SOCIAIS.map((s) => {
          const identidade = identidadeDe(dados.identidades, s.id);
          const ultima = !!identidade && formas <= 1;
          return (
            <Linha
              key={s.id}
              rotulo={s.nome}
              valor={
                <div className={styles.status}>
                  <span className={identidade ? styles.pontoVerde : styles.ponto} aria-hidden="true" />
                  <div className={styles.statusTexto}>
                    <div className={identidade ? styles.valor : styles.valorApagado}>{identidade ? 'Conectado' : 'Não conectado'}</div>
                    <div className={styles.apoio}>
                      {identidade ? (emailDaIdentidade(identidade) ?? `Conta ${s.nome} ligada`) : `Entre com um toque usando sua conta ${s.nome}.`}
                    </div>
                  </div>
                </div>
              }
              acoes={
                identidade ? (
                  <button
                    type="button"
                    className={styles.acaoVermelha}
                    onClick={() => desvincular(s.id, s.nome)}
                    disabled={ultima || ocupado !== null}
                    aria-label={`Desvincular ${s.nome}`}
                    title={ultima ? 'É a única forma de entrar da conta' : undefined}
                  >
                    Desvincular
                  </button>
                ) : (
                  <button type="button" className={styles.acaoAzul} onClick={() => conectar(s.id, s.nome)} disabled={ocupado !== null} aria-label={`Conectar ${s.nome}`}>
                    Conectar
                  </button>
                )
              }
            />
          );
        })}

      {erroSocial && (
        <div className={styles.alertaCartao}>
          <Alert>{erroSocial}</Alert>
        </div>
      )}

      <div className={styles.nota}>
        <Icon name="info" size={18} />
        <div>Precisa sobrar sempre uma forma de entrar. Para desvincular a última, crie uma senha antes.</div>
      </div>
    </section>
  );
}
