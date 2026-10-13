// Formato dos detalhes do jogo, o mesmo de supabase/functions/detalhes-da-partida. Sem dependências: os falsos
// do Playwright também importam.

export type Numeros = {
  posse: number | null;
  finalizacoes: number | null;
  no_gol: number | null;
  escanteios: number | null;
  faltas: number | null;
  impedimentos: number | null;
  passes_certos: number | null;
};
export type Estatisticas = { mandante: Numeros; visitante: Numeros };

export type Lance =
  | { tipo: 'gol'; minuto: string; mandante: boolean; jogador: string; jogador_id: number | null; assistencia: string | null; contra: boolean; penalti: boolean }
  | { tipo: 'cartao'; minuto: string; mandante: boolean; jogador: string; jogador_id: number | null; cor: 'amarelo' | 'vermelho' }
  | { tipo: 'substituicao'; minuto: string; mandante: boolean; entrou: string; saiu: string; entrou_id: number | null; saiu_id: number | null };

export type Jogador = { id: number; nome: string; numero: number | null; posicao: 'G' | 'D' | 'M' | 'F' | null; capitao: boolean };
export type Escalacao = { formacao: string | null; titulares: Jogador[]; reservas: Jogador[] };
export type Escalacoes = { mandante: Escalacao; visitante: Escalacao };

/** Nota TO de cada jogador (calculada com os números dele em campo): { "<id>": 8.7 }. */
export type Notas = Record<string, number>;
export type Detalhes = { estatisticas: Estatisticas | null; lances: Lance[]; escalacoes: Escalacoes | null; notas: Notas };
