import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chamarFuncao } from '../../assinatura/funcoes';
import { guardarAvisoDeEntrada } from '../../auth/avisoDeEntrada';
import { useAuth } from '../../auth/AuthContext';
import { Alert } from '../../components/form/Alert';
import { Button } from '../../components/form/Button';
import { TextField } from '../../components/form/TextField';
import { Icon } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';
import { dataCurta, DIAS_PARA_DESISTIR } from '../../data/conta';
import styles from './DadosDaConta.module.css';

const PALAVRA = 'EXCLUIR';

const PERDAS = [
  { icone: 'bolt', texto: 'XP, nível e posição no ranking' },
  { icone: 'monetization_on', texto: 'Moedas e conquistas' },
  { icone: 'photo_library', texto: 'Fotos, comentários, palpites e notas' },
];

/** Confirmação da exclusão: explica o que se perde, o prazo para desistir e só libera com EXCLUIR digitado. */
export function ExcluirConta({ onFechar }: { onFechar: () => void }) {
  const { assinante, sair } = useAuth();
  const navigate = useNavigate();
  const [digitado, setDigitado] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const liberado = digitado.trim().toUpperCase() === PALAVRA;

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
    guardarAvisoDeEntrada(
      `Sua conta será excluída em ${dataCurta(resultado.dados.exclui_em)}. Se mudar de ideia, é só entrar de novo até lá.`,
    );
    await sair();
    navigate('/entrar', { replace: true });
  }

  return (
    <Modal
      titulo="Excluir sua conta?"
      subtitulo="Ela sai do app e do web app. Leia antes de confirmar."
      onFechar={excluindo ? () => undefined : onFechar}
      largura={500}
      rodape={
        <>
          <Button variant="neutral" fullWidth={false} onClick={onFechar} disabled={excluindo}>
            Cancelar
          </Button>
          <Button variant="danger" fullWidth={false} onClick={excluir} disabled={!liberado} loading={excluindo}>
            Excluir minha conta
          </Button>
        </>
      }
    >
      <p className={styles.modalTexto}>Depois do prazo, apagamos de vez:</p>
      <ul className={styles.perdas}>
        {PERDAS.map((p) => (
          <li key={p.icone}>
            <Icon name={p.icone} size={18} />
            {p.texto}
          </li>
        ))}
      </ul>
      <div className={styles.modalBloco}>
        <Alert tone="info" title={`Você tem ${DIAS_PARA_DESISTIR} dias para desistir`}>
          É só entrar de novo nesse prazo para manter a conta. Depois disso, não tem volta.
        </Alert>
        <Alert tone="warn" title="Assinatura">
          {assinante ? 'A assinatura feita no web app é encerrada agora, sem novas cobranças. ' : ''}
          Se você assinou pelo app, cancele também na App Store ou no Google Play: a loja continua cobrando até você cancelar lá.
        </Alert>
      </div>
      <TextField
        label={`Digite ${PALAVRA} para confirmar`}
        value={digitado}
        onChange={(e) => setDigitado(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
      />
      {erro && (
        <div className={styles.modalBloco} style={{ marginTop: 12, marginBottom: 0 }}>
          <Alert>{erro}</Alert>
        </div>
      )}
    </Modal>
  );
}
