import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { buscarMeuXp, buscarRanking, buscarRegras, registrarPresenca, REGRAS_PADRAO, type MeuXp, type RegrasDeXp } from '../data/xp';

type Contexto = {
  /** undefined enquanto carrega; null se falhou ou a conta não tem perfil de torcedor. */
  xp: MeuXp | null | undefined;
  /** Posição na torcida do clube na temporada (a mesma do Ranking); null sem XP na temporada. */
  posicao: number | null | undefined;
  regras: RegrasDeXp;
  recarregar: () => void;
};

const XpContext = createContext<Contexto>({ xp: undefined, posicao: undefined, regras: REGRAS_PADRAO, recarregar: () => {} });

const hojeEmBrasilia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

/**
 * XP do torcedor logado e as regras de XP. Com `presenca`, conta o login do dia (o app logado): ao montar e, se a aba
 * ficou aberta de um dia para o outro, na primeira troca de tela do dia novo. Os créditos entram por trigger no banco,
 * então o XP é relido a cada troca de tela.
 */
export function XpProvider({ presenca = false, children }: { presenca?: boolean; children: ReactNode }) {
  const { perfil } = useAuth();
  const clube = perfil?.time_id ?? null;
  const [xp, setXp] = useState<MeuXp | null | undefined>(undefined);
  const [posicao, setPosicao] = useState<number | null | undefined>(undefined);
  const [regras, setRegras] = useState<RegrasDeXp>(REGRAS_PADRAO);
  const { pathname } = useLocation();
  // Dia já contado e a chamada em andamento: toda leitura espera a presença do dia antes de ler o XP.
  const presencaDoDia = useRef<{ dia: string; feita: Promise<unknown> } | null>(null);
  // Só a resposta da leitura mais recente vale (navegação rápida dispara várias).
  const leitura = useRef(0);

  const recarregar = useCallback(async () => {
    const n = ++leitura.current;
    if (presenca) {
      const hoje = hojeEmBrasilia();
      // Falhar a presença não impede de mostrar o XP.
      if (presencaDoDia.current?.dia !== hoje) presencaDoDia.current = { dia: hoje, feita: registrarPresenca().catch(() => 0) };
      await presencaDoDia.current.feita;
    }
    const [meu, ranking] = await Promise.all([
      buscarMeuXp().catch(() => undefined),
      clube ? buscarRanking('temporada', clube, 1).catch(() => undefined) : Promise.resolve([]),
    ]);
    if (n !== leitura.current) return;
    setXp((antes) => (meu === undefined ? (antes ?? null) : meu));
    if (ranking) setPosicao(ranking.find((l) => l.eu)?.posicao ?? null);
  }, [presenca, clube]);

  useEffect(() => {
    let vivo = true;
    buscarRegras().then((r) => vivo && setRegras(r), () => {});
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    void recarregar();
  }, [pathname, recarregar]);

  return <XpContext.Provider value={{ xp, posicao, regras, recarregar: () => void recarregar() }}>{children}</XpContext.Provider>;
}

export const useMeuXp = () => useContext(XpContext);
