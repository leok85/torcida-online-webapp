import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/ui/Icon';
import { proximaTrocaDeApelido, textoDoApelido } from '../../data/conta';
import { Acesso } from './Acesso';
import { Aparelhos } from './Aparelhos';
import { EditarApelido, EditarCidade, EditarNome } from './EditarPerfil';
import { ExcluirConta } from './ExcluirConta';
import { FotoDoPerfil } from './FotoDoPerfil';
import { Linha } from './Linha';
import styles from './DadosDaConta.module.css';

const AVISO_MS = 2200;

/** Aviso rápido no pé da tela depois de salvar. */
function useAviso() {
  const [aviso, setAviso] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const mostrar = useCallback((texto: string) => {
    setAviso(texto);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAviso(null), AVISO_MS);
  }, []);
  return [aviso, mostrar] as const;
}

/**
 * W21 · Dados da conta, aberta pelo menu de conta. Perfil (foto, nome, apelido e cidade), acesso (e-mail, senha,
 * Apple e Google), aparelhos conectados e a exclusão da conta. Cada "Alterar" abre a edição no lugar da linha.
 * A troca de time fica no item próprio do menu.
 */
export function DadosDaConta() {
  const { perfil } = useAuth();
  const [editando, setEditando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [versaoDosAparelhos, setVersaoDosAparelhos] = useState(0);
  const [aviso, mostrarAviso] = useAviso();
  const fechar = () => setEditando(null);
  // Salvou: avisa e fecha a edição.
  const salvo = useCallback(
    (mensagem: string) => {
      mostrarAviso(mensagem);
      setEditando(null);
    },
    [mostrarAviso],
  );
  const apelidoLiberaEm = proximaTrocaDeApelido(perfil?.apelido_alterado_em ?? null);

  const alterar = (campo: string, rotulo: string, bloqueado = false) => (
    <button
      type="button"
      className={styles.acao}
      onClick={() => setEditando(campo)}
      disabled={bloqueado}
      aria-label={`Alterar ${rotulo}`}
      title={bloqueado ? 'Dá para trocar uma vez a cada 30 dias' : undefined}
    >
      Alterar
    </button>
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.titulo}>Dados da conta</h1>

      <section className={styles.cartao} aria-labelledby="titulo-perfil">
        <div className={styles.cabecalho}>
          <h2 id="titulo-perfil" className={styles.cabecalhoTitulo}>
            Perfil
          </h2>
        </div>
        <FotoDoPerfil onSalvo={salvo} />
        {editando === 'nome' ? (
          <EditarNome onFechar={fechar} onSalvo={salvo} />
        ) : (
          <Linha rotulo="Nome" valor={perfil?.nome || 'Sem nome'} apoio="Só a torcida do seu clube vê seu nome completo." acoes={alterar('nome', 'nome')} />
        )}
        {editando === 'apelido' ? (
          <EditarApelido onFechar={fechar} onSalvo={salvo} />
        ) : (
          <Linha
            rotulo="Apelido"
            valor={`@${perfil?.apelido ?? ''}`}
            apoio={textoDoApelido(perfil?.apelido_alterado_em ?? null)}
            acoes={alterar('apelido', 'apelido', !!apelidoLiberaEm)}
          />
        )}
        {editando === 'cidade' ? (
          <EditarCidade onFechar={fechar} onSalvo={salvo} />
        ) : (
          <Linha
            rotulo="Cidade"
            valor={perfil?.cidade || 'Sem cidade'}
            apoio="Só entra nas estatísticas da torcida. Não aparece no perfil."
            acoes={alterar('cidade', 'cidade')}
          />
        )}
      </section>

      <Acesso editando={editando} onEditar={setEditando} onSalvo={salvo} onSenhaAlterada={() => setVersaoDosAparelhos((v) => v + 1)} />

      <Aparelhos versao={versaoDosAparelhos} onSalvo={salvo} />

      <section className={styles.excluir} aria-labelledby="titulo-excluir">
        <div className={styles.excluirConteudo}>
          <Icon name="delete_forever" size={22} className={styles.excluirIcone} />
          <div className={styles.excluirTextos}>
            <h2 id="titulo-excluir" className={styles.excluirTitulo}>
              Excluir minha conta
            </h2>
            <div className={styles.apoio}>Apaga XP, moedas, conquistas e fotos no app e no web app. Não tem volta.</div>
          </div>
          <button type="button" className={styles.acaoExcluir} onClick={() => setExcluindo(true)}>
            Excluir conta
          </button>
        </div>
      </section>

      {excluindo && <ExcluirConta onFechar={() => setExcluindo(false)} />}

      {aviso && (
        <div className={styles.aviso} role="status">
          <Icon name="check_circle" size={19} />
          {aviso}
        </div>
      )}
    </div>
  );
}
