import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { haJogoNaJanela, jogosDoClube, type Partida } from '../data/partidas';

/** Com jogo em campo (ou começando, pelo horário) consulta de novo a cada 30 s; fora disso, a cada 5 min. */
export const ATUALIZAR_AO_VIVO_MS = 30_000;
export const ATUALIZAR_SEM_JOGO_MS = 300_000;

type Estado = {
  /** undefined enquanto carrega pela primeira vez. */
  jogos: Partida[] | undefined;
  erro: boolean;
  tentarDeNovo: () => void;
};

const Contexto = createContext<Estado>({ jogos: undefined, erro: false, tentarDeNovo: () => {} });

/** Jogos do clube do torcedor, compartilhados pelo menu (bolinha de ao vivo), pelo início e pela tela Jogos. */
export function JogosDoClubeProvider({ clubeId, children }: { clubeId: number | null; children: ReactNode }) {
  const [estado, setEstado] = useState<{ clubeId: number; jogos?: Partida[]; erro?: boolean } | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!clubeId) return;
    let ativo = true;
    let timer: number | undefined;
    const agendar = (ms: number) => (timer = window.setTimeout(carregar, ms));
    function carregar() {
      jogosDoClube(clubeId!).then(
        (jogos) => {
          if (!ativo) return;
          setEstado({ clubeId: clubeId!, jogos });
          agendar(haJogoNaJanela(jogos) ? ATUALIZAR_AO_VIVO_MS : ATUALIZAR_SEM_JOGO_MS);
        },
        () => {
          if (!ativo) return;
          // Se uma atualização falha, segue com os últimos dados e tenta de novo depois.
          setEstado((anterior) => (anterior?.clubeId === clubeId && anterior.jogos ? anterior : { clubeId: clubeId!, erro: true }));
          agendar(ATUALIZAR_AO_VIVO_MS);
        },
      );
    }
    carregar();
    return () => {
      ativo = false;
      window.clearTimeout(timer);
    };
  }, [clubeId, tentativa]);

  const atual = clubeId && estado?.clubeId === clubeId ? estado : null;
  const valor: Estado = {
    jogos: atual?.jogos,
    erro: !!atual?.erro && !atual.jogos,
    tentarDeNovo: () => setTentativa((t) => t + 1),
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useJogosDoClube = () => useContext(Contexto);
