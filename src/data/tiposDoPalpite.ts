// Formatos da escalação e do palpite (W03), sem dependências: o e2e e os falsos importam daqui.
// Mesmo formato de supabase/functions/elenco-da-partida e da RPC meu_palpite.

export type JogadorDoElenco = {
  id: number;
  nome: string;
  numero: number | null;
  posicao: 'G' | 'D' | 'M' | 'F' | null;
  /** available, injured, doubtful ou suspended. */
  disponibilidade: string;
  motivo: string;
  volta: string | null;
};

export type Elencos = { mandante: JogadorDoElenco[]; visitante: JogadorDoElenco[] };

export type Autor = { mandante: boolean; jogador: number };

export type Palpite = {
  formacao: string;
  escalacao: Record<string, number>;
  gols_mandante: number;
  gols_visitante: number;
  autores: Autor[];
  atualizado_em?: string;
};
