// Nome, apelido e cidade: edição na própria linha, salvando direto no perfil.
import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useApelido } from '../../auth/validacao';
import { Alert } from '../../components/form/Alert';
import { CampoCidade, type ValorCidade } from '../../components/form/CampoCidade';
import { TextField } from '../../components/form/TextField';
import { Icon } from '../../components/ui/Icon';
import { PAISES_COM_CIDADES, rotuloCidade } from '../../data/cidades';
import { cidadeDaLocalizacao } from '../../data/localizacao';
import { BotoesDaEdicao } from './Linha';
import styles from './DadosDaConta.module.css';

type EdicaoProps = {
  onFechar: () => void;
  /** Mostra o aviso rápido de alteração salva. */
  onSalvo: (mensagem: string) => void;
};

const ERRO_AO_SALVAR = 'Não foi possível salvar agora. Tente de novo.';

export function EditarNome({ onFechar, onSalvo }: EdicaoProps) {
  const { perfil, atualizarPerfil } = useAuth();
  const [nome, setNome] = useState(perfil?.nome ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const limpo = nome.trim().replace(/\s+/g, ' ');
  const valido = limpo.length >= 2;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setSalvando(true);
    setErro(null);
    const error = await atualizarPerfil({ nome: limpo });
    setSalvando(false);
    if (error) return setErro(ERRO_AO_SALVAR);
    onSalvo('Nome atualizado.');
    onFechar();
  }

  return (
    <form onSubmit={salvar} noValidate className={styles.edicao}>
      <TextField
        label="Nome completo"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        autoComplete="name"
        maxLength={80}
        autoFocus
        error={nome && !valido ? 'Digite seu nome.' : null}
        hint="Só a torcida do seu clube vê seu nome completo."
      />
      {erro && <Alert>{erro}</Alert>}
      <BotoesDaEdicao onCancelar={onFechar} salvando={salvando} podeSalvar={valido && limpo !== perfil?.nome} />
    </form>
  );
}

export function EditarApelido({ onFechar, onSalvo }: EdicaoProps) {
  const { perfil, atualizarPerfil } = useAuth();
  const [digitado, setDigitado] = useState(perfil?.apelido ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const apelido = useApelido(digitado);
  const mudou = apelido.limpo !== perfil?.apelido;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!apelido.ok || !mudou) return;
    setSalvando(true);
    setErro(null);
    const error = await atualizarPerfil({ apelido: apelido.limpo });
    setSalvando(false);
    if (error) {
      setErro(
        error.code === '23505'
          ? 'Esse apelido acabou de ser escolhido por outra pessoa. Tente outro.'
          : error.hint === 'apelido_recente'
            ? 'Você trocou de apelido há menos de 30 dias.'
            : ERRO_AO_SALVAR,
      );
      return;
    }
    onSalvo('Apelido atualizado.');
    onFechar();
  }

  return (
    <form onSubmit={salvar} noValidate className={styles.edicao}>
      <TextField
        label="Apelido na torcida"
        value={digitado}
        onChange={(e) => setDigitado(e.target.value)}
        autoCapitalize="none"
        spellCheck={false}
        maxLength={20}
        autoFocus
        pending={mudou && apelido.status === 'verificando'}
        error={apelido.erro}
        success={mudou && apelido.ok ? 'Apelido disponível.' : null}
        hint="Depois de trocar, a próxima troca só em 30 dias."
      />
      {erro && <Alert>{erro}</Alert>}
      <BotoesDaEdicao onCancelar={onFechar} salvando={salvando} podeSalvar={apelido.ok && mudou} />
    </form>
  );
}

export function EditarCidade({ onFechar, onSalvo }: EdicaoProps) {
  const { perfil, atualizarPerfil } = useAuth();
  const pais = perfil?.pais ?? 'BR';
  const comCatalogo = PAISES_COM_CIDADES.includes(pais);
  const [cidade, setCidade] = useState<ValorCidade>({ texto: '', cidade: null });
  const [localizando, setLocalizando] = useState(false);
  const [erroLocalizacao, setErroLocalizacao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // No Brasil a cidade vem da lista do IBGE; nos outros países, o texto livre vale.
  const valida = comCatalogo ? !!cidade.cidade : cidade.texto.trim().length >= 2;

  async function usarLocalizacao() {
    setLocalizando(true);
    setErroLocalizacao(false);
    try {
      setCidade(await cidadeDaLocalizacao(pais, comCatalogo));
    } catch {
      setErroLocalizacao(true);
    } finally {
      setLocalizando(false);
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!valida) return;
    setSalvando(true);
    setErro(null);
    const error = await atualizarPerfil({
      cidade: comCatalogo ? rotuloCidade(cidade.cidade!) : cidade.texto.trim(),
      cidade_id: comCatalogo ? cidade.cidade!.id : null,
    });
    setSalvando(false);
    if (error) return setErro(ERRO_AO_SALVAR);
    onSalvo('Cidade atualizada.');
    onFechar();
  }

  return (
    <form onSubmit={salvar} noValidate className={styles.edicao}>
      <CampoCidade
        label="Sua cidade"
        valor={cidade}
        onChange={setCidade}
        comCatalogo={comCatalogo}
        pais={pais}
        error={erroLocalizacao ? 'Não deu para descobrir sua cidade. Digite o nome dela.' : null}
      />
      <button type="button" className={styles.linkPequeno} onClick={usarLocalizacao} disabled={localizando}>
        <Icon name="my_location" size={15} />
        {localizando ? 'Localizando…' : 'Usar minha localização'}
      </button>
      {erro && <Alert>{erro}</Alert>}
      <BotoesDaEdicao onCancelar={onFechar} salvando={salvando} podeSalvar={valida} />
    </form>
  );
}
