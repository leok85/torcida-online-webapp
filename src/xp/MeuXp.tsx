import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { buscarMeuXp, buscarRegras, registrarPresenca, REGRAS_PADRAO, type MeuXp, type RegrasDeXp } from '../data/xp';

type Contexto = {
  /** undefined enquanto carrega; null se falhou ou a conta não tem perfil de torcedor. */
  xp: MeuXp | null | undefined;
  regras: RegrasDeXp;
  recarregar: () => void;
};

const XpContext = createContext<Contexto>({ xp: undefined, regras: REGRAS_PADRAO, recarregar: () => {} });

/**
 * XP do torcedor logado e as regras de XP. Com `presenca`, conta o login do dia ao montar (o app logado).
 * Os créditos entram por trigger no banco, então o XP é relido a cada troca de tela.
 */
export function XpProvider({ presenca = false, children }: { presenca?: boolean; children: ReactNode }) {
  const [xp, setXp] = useState<MeuXp | null | undefined>(undefined);
  const [regras, setRegras] = useState<RegrasDeXp>(REGRAS_PADRAO);
  const [presencaContada, setPresencaContada] = useState(!presenca);
  const { pathname } = useLocation();

  const recarregar = useCallback(() => {
    buscarMeuXp().then(setXp, () => setXp((antes) => antes ?? null));
  }, []);

  useEffect(() => {
    let vivo = true;
    buscarRegras().then((r) => vivo && setRegras(r), () => {});
    if (presenca) {
      // Falhar a presença não impede de mostrar o XP.
      registrarPresenca()
        .catch(() => 0)
        .then(() => vivo && setPresencaContada(true));
    }
    return () => {
      vivo = false;
    };
  }, [presenca]);

  useEffect(() => {
    if (presencaContada) recarregar();
  }, [presencaContada, pathname, recarregar]);

  return <XpContext.Provider value={{ xp, regras, recarregar }}>{children}</XpContext.Provider>;
}

export const useMeuXp = () => useContext(XpContext);
