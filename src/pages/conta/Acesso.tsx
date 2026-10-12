// Cartão Acesso: e-mail, senha e as contas Apple e Google ligadas.
import { useCallback, useEffect, useState } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import { useAuth } from '../../auth/AuthContext';
import { mensagemDeErro } from '../../auth/erros';
import { Alert } from '../../components/form/Alert';
import { Icon } from '../../components/ui/Icon';
import { Carregando, Skeleton } from '../../components/ui/Skeleton';
import { emailDaIdentidade, formasDeEntrar, identidadeDe } from '../../data/conta';
import { provedoresAtivos, supabase } from '../../lib/supabase';
import { EditarEmail, EditarSenha } from './EditarAcesso';
import { Linha } from './Linha';
import styles from './DadosDaConta.module.css';

const SOCIAIS = [
  { id: 'apple', nome: 'Apple', convite: 'Entre com um toque usando sua conta Apple.' },
  { id: 'google', nome: 'Google', convite: 'Entre com um toque usando sua conta Google.' },
] as const;

type Social = (typeof SOCIAIS)[number]['id'];

type Dados = { identidades: UserIdentity[]; temSenha: boolean; ativos: Record<string, boolean> };

function useFormasDeEntrar() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    async function carregar(): Promise<Dados> {
      const [identidades, { data: temSenha, error }, ativos] = await Promise.all([formasDeEntrar(), supabase.rpc('tenho_senha'), provedoresAtivos()]);
      if (error) throw error;
      return { identidades, temSenha: temSenha === true, ativos };
    }
    carregar().then(
      (novos) => {
        if (!ativo) return;
        setDados(novos);
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
  const { sessao } = useAuth();
  const { dados, erro, recarregar } = useFormasDeEntrar();
  const [erroSocial, setErroSocial] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<Social | null>(null);
  const fechar = () => onEditar(null);

  const sociaisLigadas = dados ? SOCIAIS.filter((s) => identidadeDe(dados.identidades, s.id)).length : 0;
  const formas = sociaisLigadas + (dados?.temSenha ? 1 : 0);

  async function conectar(provedor: Social) {
    setErroSocial(null);
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
    onSalvo(`Conta ${nome} desvinculada.`);
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

      <Linha
        rotulo="E-mail"
        valor={sessao?.user.email ?? ''}
        apoio="Usado para entrar, recibos e avisos de prêmios."
        acoes={
          <button type="button" className={styles.acao} onClick={() => onEditar('email')} aria-label="Alterar e-mail">
            Alterar
          </button>
        }
        aberta={editando === 'email'}
      >
        <EditarEmail onFechar={fechar} onSalvo={onSalvo} />
      </Linha>

      {!dados ? (
        erro ? (
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
        ) : (
          <Carregando rotulo="Carregando formas de entrar" className={styles.linha}>
            <Skeleton w={60} h={11} r="pilula" />
            <Skeleton w="60%" h={11} r="pilula" />
            <Skeleton w={70} h={34} r={9} />
          </Carregando>
        )
      ) : (
        <>
          <Linha
            rotulo="Senha"
            valor={dados.temSenha ? <div className={`${styles.valor} ${styles.senhaPontos}`}>••••••••••</div> : <div className={styles.valorApagado}>Sem senha</div>}
            apoio={dados.temSenha ? 'Ao trocar, os outros aparelhos saem da conta.' : 'Crie uma para entrar também com e-mail e senha.'}
            acoes={
              <button type="button" className={styles.acao} onClick={() => onEditar('senha')} aria-label={dados.temSenha ? 'Alterar senha' : 'Criar senha'}>
                {dados.temSenha ? 'Alterar' : 'Criar senha'}
              </button>
            }
            aberta={editando === 'senha'}
          >
            <EditarSenha
              temSenha={dados.temSenha}
              onFechar={fechar}
              onSalvo={onSalvo}
              onAlterada={() => {
                recarregar();
                onSenhaAlterada();
              }}
            />
          </Linha>

          {SOCIAIS.map((s) => {
            const identidade = identidadeDe(dados.identidades, s.id);
            // Provedor desligado no Supabase só aparece se a conta já estiver ligada.
            if (!identidade && !dados.ativos[s.id]) return null;
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
                      <div className={styles.apoio}>{identidade ? (emailDaIdentidade(identidade) ?? `Conta ${s.nome} ligada`) : s.convite}</div>
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
                    <button type="button" className={styles.acaoAzul} onClick={() => conectar(s.id)} disabled={ocupado !== null} aria-label={`Conectar ${s.nome}`}>
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
        </>
      )}

      <div className={styles.nota}>
        <Icon name="info" size={16} />
        Precisa sobrar sempre uma forma de entrar. Para desvincular a última, crie uma senha antes.
      </div>
    </section>
  );
}
