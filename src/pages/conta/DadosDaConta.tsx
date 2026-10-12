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

const AVISO_MS = 3500;

/** Aviso rápido no pé da tela depois de salvar. */
function useAviso() {
  const [aviso, setAviso] = useState<{ id: number; texto: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const mostrar = useCallback((texto: string) => {
    setAviso((a) => ({ id: (a?.id ?? 0) + 1, texto }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAviso(null), AVISO_MS);
  }, []);
  return [aviso, mostrar] as const;
}

/**
 * W21 · Dados da conta, aberta pelo menu de conta. Perfil (foto, nome, apelido e cidade), acesso (e-mail, senha,
 * Apple e Google), aparelhos conectados e a exclusão da conta. Cada "Alterar" abre a edição na própria linha.
 * A troca de time fica no item próprio do menu.
 */
export function DadosDaConta() {
  const { perfil } = useAuth();
  const [editando, setEditando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [versaoDosAparelhos, setVersaoDosAparelhos] = useState(0);
  const [aviso, mostrarAviso] = useAviso();
  const fechar = () => setEditando(null);
  const apelidoLiberaEm = proximaTrocaDeApelido(perfil?.apelido_alterado_em ?? null);

  const alterar = (campo: string, rotulo: string, bloqueado = false) => (
    <button type="button" className={styles.acao} onClick={() => setEditando(campo)} disabled={bloqueado} aria-label={`Alterar ${rotulo}`}>
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
        <FotoDoPerfil onSalvo={mostrarAviso} />
        <Linha
          rotulo="Nome"
          valor={perfil?.nome || 'Sem nome'}
          apoio="Só a torcida do seu clube vê seu nome completo."
          acoes={alterar('nome', 'nome')}
          aberta={editando === 'nome'}
        >
          <EditarNome onFechar={fechar} onSalvo={mostrarAviso} />
        </Linha>
        <Linha
          rotulo="Apelido"
          valor={`@${perfil?.apelido ?? ''}`}
          apoio={textoDoApelido(perfil?.apelido_alterado_em ?? null)}
          acoes={alterar('apelido', 'apelido', !!apelidoLiberaEm)}
          aberta={editando === 'apelido'}
        >
          <EditarApelido onFechar={fechar} onSalvo={mostrarAviso} />
        </Linha>
        <Linha
          rotulo="Cidade"
          valor={perfil?.cidade || 'Sem cidade'}
          apoio="Só entra nas estatísticas da torcida. Não aparece no perfil."
          acoes={alterar('cidade', 'cidade')}
          aberta={editando === 'cidade'}
        >
          <EditarCidade onFechar={fechar} onSalvo={mostrarAviso} />
        </Linha>
      </section>

      <Acesso editando={editando} onEditar={setEditando} onSalvo={mostrarAviso} onSenhaAlterada={() => setVersaoDosAparelhos((v) => v + 1)} />

      <Aparelhos versao={versaoDosAparelhos} onSalvo={mostrarAviso} />

      <section className={styles.excluir} aria-labelledby="titulo-excluir">
        <Icon name="no_accounts" size={22} className={styles.excluirIcone} />
        <div>
          <h2 id="titulo-excluir" className={styles.excluirTitulo}>
            Excluir minha conta
          </h2>
          <div className={styles.apoio}>Apaga XP, moedas, conquistas e fotos no app e no web app. Não tem volta.</div>
        </div>
        <button type="button" className={styles.acaoVermelha} onClick={() => setExcluindo(true)}>
          Excluir conta
        </button>
      </section>

      {excluindo && <ExcluirConta onFechar={() => setExcluindo(false)} />}

      {aviso && (
        <div key={aviso.id} className={styles.aviso} role="status">
          <Icon name="check_circle" size={18} />
          {aviso.texto}
        </div>
      )}
    </div>
  );
}
