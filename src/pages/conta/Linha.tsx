import type { ReactNode } from 'react';
import { Button } from '../../components/form/Button';
import styles from './DadosDaConta.module.css';

type LinhaProps = {
  rotulo: string;
  valor?: ReactNode;
  apoio?: ReactNode;
  /** Botões à direita (Alterar, Conectar...). */
  acoes?: ReactNode;
  /** Com a edição aberta, o formulário (children) toma o lugar do valor e dos botões. */
  aberta?: boolean;
  children?: ReactNode;
};

/** Uma linha dos cartões de Dados da conta: rótulo, valor com a frase de apoio e a ação à direita. */
export function Linha({ rotulo, valor, apoio, acoes, aberta, children }: LinhaProps) {
  return (
    <div className={aberta ? styles.linhaAberta : styles.linha}>
      <div className={styles.rotulo}>{rotulo}</div>
      {/* O formulário usa a classe edicao para ocupar as duas colunas da direita. */}
      {aberta ? (
        children
      ) : (
        <>
          <div className={styles.valorBloco}>
            {typeof valor === 'string' ? <div className={styles.valor}>{valor}</div> : valor}
            {apoio && <div className={styles.apoio}>{apoio}</div>}
          </div>
          <div className={styles.acoes}>{acoes}</div>
        </>
      )}
    </div>
  );
}

type BotoesProps = {
  onCancelar: () => void;
  salvando: boolean;
  podeSalvar: boolean;
  /** null esconde o Salvar (ex.: etapa de código, que confirma sozinha ao completar os dígitos). */
  rotulo?: string | null;
};

/** Cancelar e Salvar no pé de um formulário de linha. O Salvar é o submit do formulário. */
export function BotoesDaEdicao({ onCancelar, salvando, podeSalvar, rotulo = 'Salvar' }: BotoesProps) {
  return (
    <div className={styles.edicaoBotoes}>
      <Button variant="neutral" fullWidth={false} onClick={onCancelar} disabled={salvando}>
        Cancelar
      </Button>
      {rotulo !== null && (
        <Button type="submit" fullWidth={false} loading={salvando} disabled={!podeSalvar}>
          {rotulo}
        </Button>
      )}
    </div>
  );
}
