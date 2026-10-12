import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chamarFuncao } from '../../assinatura/funcoes';
import { guardarAvisoDeEntrada } from '../../auth/avisoDeEntrada';
import { useAuth } from '../../auth/AuthContext';
import { Alert } from '../../components/form/Alert';
import { Icon } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';
import { dataCurta, DIAS_PARA_DESISTIR } from '../../data/conta';
import { Campo } from './Linha';
import styles from './DadosDaConta.module.css';

const PALAVRA = 'EXCLUIR';

/** Confirmação da exclusão (W21): o que se perde, o prazo para desistir e só libera com EXCLUIR digitado. */
export function ExcluirConta({ onFechar }: { onFechar: () => void }) {
  const { perfil, assinante, sair } = useAuth();
  const navigate = useNavigate();
  const [digitado, setDigitado] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const liberado = digitado.trim().toUpperCase() === PALAVRA;

  const itens = [
    { icone: 'close', cor: '#B0261E', texto: 'Seu nível, moedas, conquistas e fotos são apagados.' },
    { icone: 'close', cor: '#B0261E', texto: `O apelido @${perfil?.apelido ?? ''} fica livre para outro torcedor.` },
    { icone: 'schedule', cor: 'var(--gold)', texto: `Você tem ${DIAS_PARA_DESISTIR} dias para desistir entrando de novo. Depois disso, a exclusão é definitiva.` },
    ...(assinante ? [{ icone: 'workspace_premium', cor: 'var(--gold)', texto: 'A assinatura feita no web app é cancelada agora, sem novas cobranças.' }] : []),
    { icone: 'workspace_premium', cor: 'var(--gold)', texto: 'Se assinou pelo app, cancele também nos ajustes da App Store ou do Google Play.' },
  ];

  async function excluir() {
    if (!liberado) return;
    setExcluindo(true);
    setErro(null);
    const resultado = await chamarFuncao<{ exclui_em: string }>('excluir-conta', {});
    if (!resultado.ok) {
      setExcluindo(false);
      setErro(
        resultado.erro === 'falha_ao_encerrar_assinatura'
          ? 'Não conseguimos encerrar sua assinatura agora, então a conta não foi excluída. Tente de novo em instantes.'
          : 'Não foi possível excluir sua conta agora. Tente de novo em instantes.',
      );
      return;
    }
    // O servidor já tirou a conta de todos os aparelhos; aqui só limpa a sessão deste navegador.
    guardarAvisoDeEntrada(`Sua conta será excluída em ${dataCurta(resultado.dados.exclui_em)}. Se mudar de ideia, é só entrar de novo até lá.`);
    await sair();
    navigate('/entrar', { replace: true });
  }

  return (
    <Modal rotulo="Excluir conta" onFechar={excluindo ? () => undefined : onFechar} largura={480}>
      <div className={styles.janelaExcluir}>
        <div className={styles.excluirTopo}>
          <span className={styles.excluirAlerta}>
            <Icon name="warning" size={24} />
          </span>
          <h2 className={styles.excluirJanelaTitulo}>Excluir conta</h2>
        </div>
        <ul className={styles.perdas}>
          {itens.map((i) => (
            <li key={i.texto}>
              <Icon name={i.icone} size={17} color={i.cor} />
              {i.texto}
            </li>
          ))}
        </ul>
        <Campo
          rotulo={`Digite ${PALAVRA} para confirmar`}
          rotuloVisivel
          className={styles.campoExcluir}
          value={digitado}
          onChange={(e) => setDigitado(e.target.value)}
          placeholder={PALAVRA}
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
        {erro && <Alert>{erro}</Alert>}
        <div className={styles.edicaoBotoes} style={{ marginTop: 4 }}>
          <button type="button" className={styles.cancelar} onClick={onFechar} disabled={excluindo}>
            Manter conta
          </button>
          <button type="button" className={styles.botaoExcluir} onClick={excluir} disabled={!liberado || excluindo} aria-busy={excluindo || undefined}>
            Excluir definitivamente
          </button>
        </div>
      </div>
    </Modal>
  );
}
