import { useEffect, useState } from 'react';

/** Carrega dados do catálogo e guarda de qual chave eles são, para nunca mostrar os clubes de outro país. */
/** Com `manter`, mostra o dado da chave anterior enquanto a nova carrega (ex.: releitura depois de um crédito de XP). */
export function useCarga<T>(chave: string | null, carregar: (chave: string) => Promise<T>, { manter = false } = {}) {
  const [estado, setEstado] = useState<{ chave: string; dados?: T; erro?: boolean } | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!chave) return;
    let ativo = true;
    carregar(chave).then(
      (dados) => ativo && setEstado({ chave, dados }),
      () => ativo && setEstado({ chave, erro: true }),
    );
    return () => {
      ativo = false;
    };
    // carregar é uma função do módulo: não muda entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, tentativa]);

  const atual = chave && (estado?.chave === chave || (manter && estado && !estado.erro)) ? estado : null;
  return { dados: atual?.dados, erro: !!atual?.erro, tentarDeNovo: () => setTentativa((t) => t + 1) };
}
