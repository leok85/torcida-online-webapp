// Aparelhos conectados: as sessões abertas da conta, com este navegador primeiro.
import { useEffect, useState } from 'react';
import { mensagemDeErro } from '../../auth/erros';
import { Alert } from '../../components/form/Alert';
import { Icon } from '../../components/ui/Icon';
import { Carregando, Skeleton } from '../../components/ui/Skeleton';
import { encerrarAparelho, meusAparelhos, usadoHa, type Aparelho } from '../../data/conta';
import { supabase } from '../../lib/supabase';
import styles from './DadosDaConta.module.css';

type AparelhosProps = {
  /** Muda quando outra parte da tela mexe nas sessões (ex.: troca de senha). */
  versao: number;
  onSalvo: (mensagem: string) => void;
};

export function Aparelhos({ versao, onSalvo }: AparelhosProps) {
  const [lista, setLista] = useState<Aparelho[] | null>(null);
  const [erroAoCarregar, setErroAoCarregar] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    meusAparelhos().then(
      (aparelhos) => {
        if (!ativo) return;
        setLista(aparelhos);
        setErroAoCarregar(false);
      },
      () => ativo && setErroAoCarregar(true),
    );
    return () => {
      ativo = false;
    };
  }, [versao, tentativa]);

  async function encerrar(a: Aparelho) {
    setOcupado(a.id);
    setErro(null);
    try {
      await encerrarAparelho(a.id);
      setLista((l) => l?.filter((x) => x.id !== a.id) ?? l);
      onSalvo(`${a.nome} saiu da conta.`);
    } catch {
      setErro('Não deu para encerrar esse aparelho agora. Tente de novo.');
    } finally {
      setOcupado(null);
    }
  }

  async function sairDosOutros() {
    setOcupado('todos');
    setErro(null);
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    setOcupado(null);
    if (error) return setErro(mensagemDeErro(error));
    setLista((l) => l?.filter((x) => x.atual) ?? l);
    onSalvo('Os outros aparelhos saíram da conta.');
  }

  const outros = lista?.filter((a) => !a.atual).length ?? 0;
  const agora = new Date();

  return (
    <section className={styles.cartao} aria-labelledby="titulo-aparelhos">
      <div className={styles.cabecalho}>
        <h2 id="titulo-aparelhos" className={styles.cabecalhoTitulo}>
          Aparelhos conectados
        </h2>
      </div>

      {!lista && !erroAoCarregar && (
        <Carregando rotulo="Carregando aparelhos">
          {[0, 1].map((i) => (
            <div key={i} className={styles.aparelho}>
              <Skeleton w={36} h={36} r={10} />
              <div>
                <Skeleton w={120} h={12} r="pilula" />
                <Skeleton w={80} h={10} r="pilula" style={{ marginTop: 6 }} />
              </div>
              <Skeleton w={80} h={34} r={9} />
            </div>
          ))}
        </Carregando>
      )}

      {!lista && erroAoCarregar && (
        <div className={styles.alertaCartao}>
          <Alert
            actions={
              <button type="button" className={styles.acao} onClick={() => setTentativa((t) => t + 1)}>
                Tentar de novo
              </button>
            }
          >
            Não deu para carregar os aparelhos.
          </Alert>
        </div>
      )}

      {lista && (
        <ul className={styles.listaSemMarcador} aria-label="Aparelhos">
          {lista.map((a) => (
            <li key={a.id} className={styles.aparelho}>
              <span className={styles.aparelhoIcone} aria-hidden="true">
                <Icon name={a.tipo === 'celular' ? 'smartphone' : 'laptop_mac'} size={20} />
              </span>
              <div>
                <div className={styles.aparelhoNome}>{a.nome}</div>
                <div className={styles.apoio}>{a.atual ? 'agora' : `último uso ${usadoHa(a.usadoEm, agora)}`}</div>
              </div>
              {a.atual ? (
                <span className={styles.esteNavegador}>Este navegador</span>
              ) : (
                <button type="button" className={styles.acao} onClick={() => encerrar(a)} disabled={ocupado !== null} aria-label={`Encerrar ${a.nome}`}>
                  Encerrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {erro && (
        <div className={styles.alertaCartao}>
          <Alert>{erro}</Alert>
        </div>
      )}

      {outros > 0 && (
        <div className={styles.aparelhosRodape}>
          <button type="button" className={styles.linkVermelho} onClick={sairDosOutros} disabled={ocupado !== null}>
            Sair de todos os outros aparelhos
          </button>
        </div>
      )}
    </section>
  );
}
