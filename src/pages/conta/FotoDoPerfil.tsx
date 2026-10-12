import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/ui/Icon';
import { apagarFoto, enviarFoto, problemaDaFoto, TIPOS_DE_FOTO, urlDaFoto } from '../../data/conta';
import { RecorteDeFoto } from './RecorteDeFoto';
import styles from './DadosDaConta.module.css';

/** Foto do perfil: escolher o arquivo, ajustar o recorte redondo e salvar; ou remover. */
export function FotoDoPerfil({ onSalvo }: { onSalvo: (mensagem: string) => void }) {
  const { perfil, atualizarPerfil } = useAuth();
  const arquivo = useRef<HTMLInputElement>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const atual = perfil?.foto ?? null;
  const url = urlDaFoto(atual);

  // Libera a imagem escolhida da memória quando ela sai de cena.
  useEffect(() => () => void (escolhida && URL.revokeObjectURL(escolhida)), [escolhida]);

  function escolher(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Limpa o campo para escolher o mesmo arquivo de novo funcionar.
    e.target.value = '';
    if (!f) return;
    const problema = problemaDaFoto(f);
    setErro(problema);
    // Arquivo inválido no "Trocar imagem" fecha o ajuste para o erro aparecer na linha.
    setEscolhida(problema ? null : URL.createObjectURL(f));
  }

  async function salvar(foto: Blob) {
    if (!perfil) return;
    const caminho = await enviarFoto(perfil.id, foto);
    const error = await atualizarPerfil({ foto: caminho });
    if (error) {
      await apagarFoto(caminho);
      throw error;
    }
    if (atual) await apagarFoto(atual);
    setEscolhida(null);
    onSalvo('Foto atualizada');
  }

  async function remover() {
    if (!atual) return;
    setRemovendo(true);
    setErro(null);
    const error = await atualizarPerfil({ foto: null });
    setRemovendo(false);
    if (error) return setErro('Não foi possível remover a foto agora. Tente de novo.');
    await apagarFoto(atual);
    onSalvo('Foto removida');
  }

  return (
    <div className={styles.linha}>
      <div className={styles.rotulo}>Foto</div>
      <div className={styles.foto}>
        <div className={styles.fotoCirculo}>{url ? <img src={url} alt="Sua foto" /> : <Icon name="person" size={26} />}</div>
        <div className={erro ? styles.fotoErro : styles.fotoMsg} role={erro ? 'alert' : undefined}>
          {erro ?? 'JPG, PNG ou WebP, até 5 MB. Você ajusta o corte depois de escolher.'}
        </div>
        <input ref={arquivo} type="file" accept={TIPOS_DE_FOTO.join(',')} hidden onChange={escolher} data-testid="arquivo-da-foto" aria-label="Arquivo da foto" />
      </div>
      <div className={styles.acoes}>
        <button type="button" className={styles.acao} onClick={() => arquivo.current?.click()} aria-label={atual ? 'Trocar foto' : 'Escolher foto'}>
          {atual ? 'Trocar' : 'Escolher'}
        </button>
        {atual && (
          <button type="button" className={styles.acaoVermelha} onClick={remover} disabled={removendo}>
            Remover
          </button>
        )}
      </div>
      {escolhida && (
        <RecorteDeFoto key={escolhida} imagem={escolhida} onTrocarImagem={() => arquivo.current?.click()} onCancelar={() => setEscolhida(null)} onSalvar={salvar} />
      )}
    </div>
  );
}
