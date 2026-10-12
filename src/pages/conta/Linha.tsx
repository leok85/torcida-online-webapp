import { useId, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from '../../components/ui/Icon';
import styles from './DadosDaConta.module.css';

type LinhaProps = {
  rotulo: string;
  valor?: ReactNode;
  apoio?: ReactNode;
  /** Botões à direita (Alterar, Conectar...). */
  acoes?: ReactNode;
};

/** Uma linha dos cartões de Dados da conta: rótulo (180px), valor com a frase de apoio e a ação à direita. */
export function Linha({ rotulo, valor, apoio, acoes }: LinhaProps) {
  return (
    <div className={styles.linha}>
      <div className={styles.rotulo}>{rotulo}</div>
      <div className={styles.valorBloco}>
        {typeof valor === 'string' ? <div className={styles.valor}>{valor}</div> : valor}
        {apoio && <div className={styles.apoio}>{apoio}</div>}
      </div>
      {acoes && <div className={styles.acoes}>{acoes}</div>}
    </div>
  );
}

type EdicaoProps = {
  titulo: string;
  /** Com onSubmit, o bloco é um formulário (Enter salva). */
  onSubmit?: () => void;
  children: ReactNode;
};

/** Edição aberta: toma o lugar da linha, com fundo azul-claro e o título do que está sendo alterado. */
export function Edicao({ titulo, onSubmit, children }: EdicaoProps) {
  const tituloId = useId();
  const conteudo = (
    <>
      <div id={tituloId} className={styles.edicaoTitulo}>
        {titulo}
      </div>
      {children}
    </>
  );
  if (!onSubmit) {
    return (
      <div className={styles.edicao} role="group" aria-labelledby={tituloId}>
        {conteudo}
      </div>
    );
  }
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form className={styles.edicao} onSubmit={enviar} noValidate aria-labelledby={tituloId}>
      {conteudo}
    </form>
  );
}

type BotoesProps = {
  onCancelar: () => void;
  rotulo: string;
  podeSalvar: boolean;
  salvando: boolean;
  /** Sem formulário em volta, o botão principal chama esta função. */
  onSalvar?: () => void;
};

/** Cancelar e o botão principal (cinza enquanto não dá para salvar). */
export function Botoes({ onCancelar, rotulo, podeSalvar, salvando, onSalvar }: BotoesProps) {
  return (
    <div className={styles.edicaoBotoes}>
      <button type="button" className={styles.cancelar} onClick={onCancelar} disabled={salvando}>
        Cancelar
      </button>
      <button
        type={onSalvar ? 'button' : 'submit'}
        className={styles.botaoPrimario}
        onClick={onSalvar}
        disabled={!podeSalvar || salvando}
        aria-busy={salvando || undefined}
      >
        {rotulo}
      </button>
    </div>
  );
}

type CampoProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  icone?: string;
  /** Nome acessível; com `rotuloVisivel`, aparece acima da caixa. */
  rotulo: string;
  rotuloVisivel?: boolean;
  estado?: 'normal' | 'ok' | 'erro';
  /** Ícone à direita (ex.: check do apelido disponível). */
  direita?: ReactNode;
  senha?: boolean;
  className?: string;
};

/** Caixa de 44px com ícone à esquerda, como os campos do W21. */
export function Campo({ icone, rotulo, rotuloVisivel, estado = 'normal', direita, senha, className, type, ...input }: CampoProps) {
  const id = useId();
  const [mostrar, setMostrar] = useState(false);
  const caixa = estado === 'ok' ? styles.campoOk : estado === 'erro' ? styles.campoErro : styles.campo;
  return (
    <div className={className}>
      {rotuloVisivel && (
        <label htmlFor={id} className={styles.campoRotulo}>
          {rotulo}
        </label>
      )}
      <div className={caixa}>
        {icone && <Icon name={icone} size={19} />}
        <input
          id={id}
          type={senha ? (mostrar ? 'text' : 'password') : type}
          aria-label={rotuloVisivel ? undefined : rotulo}
          aria-invalid={estado === 'erro' || undefined}
          {...input}
        />
        {direita}
        {senha && (
          <button type="button" className={styles.olho} onClick={() => setMostrar((m) => !m)} aria-label={mostrar ? `Ocultar ${rotulo.toLowerCase()}` : `Mostrar ${rotulo.toLowerCase()}`}>
            <Icon name={mostrar ? 'visibility_off' : 'visibility'} size={19} />
          </button>
        )}
      </div>
    </div>
  );
}
