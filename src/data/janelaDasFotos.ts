// Janelas das fotos da torcida (W07), sem dependências: a tela, os falsos do Supabase e o e2e usam as mesmas regras
// de janela_da_foto() e joinhas_abertos() da migration.
import type { Partida } from '../lib/database.types';

export type Momento = 'pre' | 'durante' | 'pos';

const HORA_MS = 60 * 60_000;
/** Fim estimado quando não sabemos a hora do apito: início + 115 min. */
const FIM_ESTIMADO_MS = 115 * 60_000;

/** Até quando vale o envio do pós-jogo e os joinhas: 1 h depois do apito. */
export const fimDasFotos = (p: Partida) =>
  new Date((p.encerrada_em ? new Date(p.encerrada_em).getTime() : new Date(p.inicio).getTime() + FIM_ESTIMADO_MS) + HORA_MS);

/** Janela de envio aberta agora: pré-jogo (1 h antes do início), durante (bola rolando), pós-jogo (até 1 h depois). */
export function janelaDaFoto(p: Partida, agora = new Date()): Momento | null {
  const t = agora.getTime();
  const inicio = new Date(p.inicio).getTime();
  if (p.status === 'ao_vivo') return 'durante';
  if (p.status === 'agendada') return t >= inicio ? 'durante' : t >= inicio - HORA_MS ? 'pre' : null;
  if (p.status === 'encerrada') return t < fimDasFotos(p).getTime() ? 'pos' : null;
  return null;
}

/** Os joinhas valem até a última janela fechar. */
export const joinhasAbertos = (p: Partida, agora = new Date()) => p.status !== 'encerrada' || agora.getTime() < fimDasFotos(p).getTime();

/** Joinhas por torcedor em cada jogo. */
export const LIMITE_DE_JOINHAS = 20;
/** Com tantas denúncias a foto sai da galeria. */
export const DENUNCIAS_PARA_OCULTAR = 3;
