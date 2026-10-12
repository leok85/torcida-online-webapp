// Nome, apelido e cidade: edição no lugar da linha, salvando direto no perfil.
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useApelido } from '../../auth/validacao';
import { Alert } from '../../components/form/Alert';
import { useBuscaDeCidade, type ValorCidade } from '../../components/form/CampoCidade';
import { Icon } from '../../components/ui/Icon';
import { PAISES_COM_CIDADES, rotuloCidade } from '../../data/cidades';
import { cidadeDaLocalizacao } from '../../data/localizacao';
import { Botoes, Campo, Edicao } from './Linha';
import styles from './DadosDaConta.module.css';

export type EdicaoProps = {
  onFechar: () => void;
  /** Mostra o aviso rápido de alteração salva (e fecha a edição). */
  onSalvo: (mensagem: string) => void;
};

const ERRO_AO_SALVAR = 'Não foi possível salvar agora. Tente de novo.';

export function EditarNome({ onFechar, onSalvo }: EdicaoProps) {
  const { perfil, atualizarPerfil } = useAuth();
  const [nome, setNome] = useState(perfil?.nome ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const limpo = nome.trim().replace(/\s+/g, ' ');
  const pode = limpo.length >= 2 && limpo !== perfil?.nome;

  async function salvar() {
    if (!pode) return;
    setSalvando(true);
    setErro(null);
    const error = await atualizarPerfil({ nome: limpo });
    setSalvando(false);
    if (error) return setErro(ERRO_AO_SALVAR);
    onSalvo('Nome atualizado');
  }

  return (
    <Edicao titulo="Nome" onSubmit={salvar}>
      <Campo icone="person" rotulo="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={80} autoFocus />
      {erro && <Alert>{erro}</Alert>}
      <Botoes onCancelar={onFechar} rotulo="Salvar" podeSalvar={pode} salvando={salvando} />
    </Edicao>
  );
}

export function EditarApelido({ onFechar, onSalvo }: EdicaoProps) {
  const { perfil, atualizarPerfil } = useAuth();
  const [digitado, setDigitado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const apelido = useApelido(digitado);
  const igual = apelido.limpo.toLowerCase() === perfil?.apelido?.toLowerCase();
  const ok = apelido.ok && !igual;

  const mensagem =
    apelido.status === 'vazio'
      ? '3 a 20 caracteres: letras, números, ponto ou _.'
      : apelido.status === 'invalido'
        ? 'Use de 3 a 20 caracteres: letras, números, ponto ou _.'
        : igual
          ? 'Esse já é o seu apelido.'
          : apelido.status === 'em-uso'
            ? 'Esse apelido já é de outro torcedor.'
            : apelido.status === 'verificando'
              ? 'Verificando…'
              : apelido.status === 'sem-conexao'
                ? (apelido.erro ?? '')
                : 'Apelido disponível.';
  const estado = apelido.status === 'vazio' || apelido.status === 'verificando' ? 'normal' : ok ? 'ok' : 'erro';

  async function salvar() {
    if (!ok) return;
    setSalvando(true);
    setErro(null);
    const error = await atualizarPerfil({ apelido: apelido.limpo });
    setSalvando(false);
    if (error) {
      setErro(
        error.code === '23505' || error.hint === 'apelido_reservado'
          ? 'Esse apelido acabou de ser escolhido por outro torcedor. Tente outro.'
          : error.hint === 'apelido_recente'
            ? 'Você trocou de apelido há menos de 30 dias.'
            : ERRO_AO_SALVAR,
      );
      return;
    }
    onSalvo(`Apelido atualizado para @${apelido.limpo}`);
  }

  return (
    <Edicao titulo="Novo apelido" onSubmit={salvar}>
      <Campo
        icone="alternate_email"
        rotulo="Novo apelido"
        value={digitado}
        onChange={(e) => setDigitado(e.target.value)}
        placeholder="novo apelido"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={20}
        autoFocus
        estado={estado}
        direita={estado !== 'normal' && <Icon name={ok ? 'check_circle' : 'error'} size={19} color={ok ? 'var(--green-dark)' : '#B0261E'} />}
      />
      <div className={estado === 'ok' ? styles.ajudaOk : estado === 'erro' ? styles.ajudaErro : styles.ajuda} aria-live="polite">
        {mensagem}
      </div>
      <div className={styles.avisoApelido}>
        <Icon name="history" size={18} />
        <div>Dá para trocar uma vez a cada 30 dias. O apelido anterior fica reservado por esse período e o histórico do chat não muda.</div>
      </div>
      {erro && <Alert>{erro}</Alert>}
      <Botoes onCancelar={onFechar} rotulo="Salvar apelido" podeSalvar={ok} salvando={salvando} />
    </Edicao>
  );
}

export function EditarCidade({ onFechar, onSalvo }: EdicaoProps) {
  const { perfil, atualizarPerfil } = useAuth();
  const pais = perfil?.pais ?? 'BR';
  const comCatalogo = PAISES_COM_CIDADES.includes(pais);
  const [cidade, setCidade] = useState<ValorCidade>({ texto: perfil?.cidade ?? '', cidade: null });
  const [localizando, setLocalizando] = useState(false);
  const [erroLocalizacao, setErroLocalizacao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const busca = useBuscaDeCidade({ valor: cidade, onChange: setCidade, comCatalogo, pais });
  // No Brasil a cidade vem da lista do IBGE; nos outros países, o texto livre vale.
  const valida = comCatalogo ? !!cidade.cidade : cidade.texto.trim().length >= 2 && cidade.texto.trim() !== perfil?.cidade;

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

  async function salvar() {
    if (!valida) return;
    setSalvando(true);
    setErro(null);
    const error = await atualizarPerfil({
      cidade: comCatalogo ? rotuloCidade(cidade.cidade!) : cidade.texto.trim(),
      cidade_id: comCatalogo ? cidade.cidade!.id : null,
    });
    setSalvando(false);
    if (error) return setErro(ERRO_AO_SALVAR);
    onSalvo('Cidade atualizada');
  }

  return (
    <Edicao titulo="Cidade" onSubmit={salvar}>
      <div className={styles.cidadeLinha}>
        <div>
          <Campo icone="search" rotulo="Sua cidade" placeholder="Buscar cidade" autoFocus {...busca.input} />
          {busca.lista}
        </div>
        <button type="button" className={styles.localizacao} onClick={usarLocalizacao} disabled={localizando}>
          <Icon name="my_location" size={17} />
          {localizando ? 'Localizando…' : 'Usar minha localização'}
        </button>
      </div>
      {erroLocalizacao && <div className={styles.ajudaErro}>Não deu para descobrir sua cidade. Digite o nome dela.</div>}
      {comCatalogo && busca.semResultado && <div className={styles.ajuda}>Nenhuma cidade encontrada com esse nome.</div>}
      {erro && <Alert>{erro}</Alert>}
      <Botoes onCancelar={onFechar} rotulo="Salvar" podeSalvar={valida} salvando={salvando} />
    </Edicao>
  );
}
