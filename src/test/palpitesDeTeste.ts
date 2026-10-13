// Regras de escalação e palpite (W03) para os dois falsos do Supabase (Vitest e Playwright): as mesmas de
// enviar_palpite() e meu_palpite() da migration e o elenco que a função elenco-da-partida devolveria.
import { situacaoDoPalpite } from '../data/janelaDoPalpite';
import type { Autor, Elencos, JogadorDoElenco, Palpite } from '../data/tiposDoPalpite';
import type { Partida } from '../lib/database.types';

const j = (id: number, nome: string, numero: number, posicao: JogadorDoElenco['posicao'], disponibilidade = 'available'): JogadorDoElenco => ({
  id,
  nome,
  numero,
  posicao,
  disponibilidade,
  motivo: '',
  volta: null,
});

/** Elencos (trechos reais da BSD): Palmeiras (162) e Corinthians (167). */
export function elencosDeTeste(): Map<number, JogadorDoElenco[]> {
  return new Map([
    [
      162,
      [
        j(24, 'C. Miguel', 1, 'G'),
        j(40, 'M. Lomba', 14, 'G'),
        j(3876, 'A. Barboza', 2, 'D'),
        j(35, 'B. Fuchs', 3, 'D'),
        j(3622, 'A. Giay', 4, 'D', 'suspended'),
        j(25, 'Khellven', 12, 'D'),
        j(28, 'J. Piquerez', 22, 'D'),
        j(27, 'Murilo', 26, 'D'),
        j(3624, 'F. Anderson', 7, 'M'),
        j(30, 'A. Pereira', 8, 'M'),
        j(530, 'J. Arias', 11, 'M'),
        j(1154, 'M. Freitas', 17, 'M'),
        j(33, 'V. Roque', 9, 'F'),
        j(5053, 'Paulinho', 10, 'F'),
        j(37, 'R. Sosa', 19, 'F', 'injured'),
        j(34, 'J. López', 42, 'F'),
      ],
    ],
    [167, [j(253, 'H. Souza', 1, 'G'), j(256, 'G. Henrique', 13, 'D'), j(260, 'Yuri Alberto', 9, 'F'), j(262, 'M. Depay', 10, 'F')]],
  ]);
}

export const elencosDaPartida = (elencos: Map<number, JogadorDoElenco[]>, p: Partida): Elencos => ({
  mandante: elencos.get(p.mandante_id) ?? [],
  visitante: elencos.get(p.visitante_id) ?? [],
});

export type PalpiteDeTeste = Palpite & { partida_id: number; usuario_id: string; clube_id: number };

type AutorDoPalpite = { id: string; time_id: number | null } | undefined;
type Pedido = { p_partida?: number; p_formacao?: string; p_escalacao?: Record<string, number>; p_gols_mandante?: number; p_gols_visitante?: number; p_autores?: Autor[] };

const FORMACOES = ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '3-4-3', '5-3-2', '4-1-4-1'];

/** enviar_palpite(): devolve o erro (hint) ou grava/troca o palpite. */
export function enviarPalpiteDeTeste(
  palpites: PalpiteDeTeste[],
  autor: AutorDoPalpite,
  assinante: boolean,
  partidas: Partida[],
  elencos: Map<number, JogadorDoElenco[]>,
  pedido: Pedido,
  agora = new Date(),
): { hint: string; code: string } | null {
  const recusa = (hint: string) => ({ hint, code: 'P0001' });
  if (!autor?.time_id) return recusa('sem_perfil');
  if (!assinante) return recusa('so_membros');
  const partida = partidas.find((p) => p.id === pedido.p_partida);
  if (!partida || ![partida.mandante_id, partida.visitante_id].includes(autor.time_id)) return recusa('outro_clube');
  const doClube = partidas.filter((p) => [p.mandante_id, p.visitante_id].includes(autor.time_id!));
  const situacao = situacaoDoPalpite(partida, doClube, agora);
  if (situacao === 'fechado') return recusa('palpite_fechado');
  if (situacao === 'nao_abriu') return recusa('palpite_nao_abriu');
  if (!pedido.p_formacao || !FORMACOES.includes(pedido.p_formacao)) return recusa('formacao_invalida');

  const escalacao = pedido.p_escalacao ?? {};
  const ids = Object.values(escalacao);
  const meuElenco = new Set((elencos.get(autor.time_id) ?? []).map((x) => x.id));
  if (!('gol0' in escalacao) || ids.length !== 11 || new Set(ids).size !== 11 || ids.some((id) => !meuElenco.has(id))) return recusa('escalacao_invalida');

  const gm = pedido.p_gols_mandante ?? -1;
  const gv = pedido.p_gols_visitante ?? -1;
  if (gm < 0 || gm > 9 || gv < 0 || gv > 9) return recusa('placar_invalido');

  const autores = pedido.p_autores ?? [];
  for (const a of autores) {
    const lado = new Set((elencos.get(a.mandante ? partida.mandante_id : partida.visitante_id) ?? []).map((x) => x.id));
    if (!lado.has(a.jogador)) return recusa('autor_invalido');
  }
  if (autores.filter((a) => a.mandante).length > gm || autores.filter((a) => !a.mandante).length > gv) return recusa('autor_invalido');

  const novo: PalpiteDeTeste = {
    partida_id: partida.id,
    usuario_id: autor.id,
    clube_id: autor.time_id,
    formacao: pedido.p_formacao,
    escalacao,
    gols_mandante: gm,
    gols_visitante: gv,
    autores,
    atualizado_em: agora.toISOString(),
  };
  const i = palpites.findIndex((p) => p.partida_id === partida.id && p.usuario_id === autor.id);
  if (i >= 0) palpites[i] = novo;
  else palpites.push(novo);
  return null;
}

/** meu_palpite(): lista com o meu palpite do jogo (ou vazia). */
export function meuPalpiteDeTeste(palpites: PalpiteDeTeste[], usuarioId: string | undefined, partidaId: number): Palpite[] {
  return palpites
    .filter((p) => p.partida_id === partidaId && p.usuario_id === usuarioId)
    .map(({ formacao, escalacao, gols_mandante, gols_visitante, autores, atualizado_em }) => ({ formacao, escalacao, gols_mandante, gols_visitante, autores, atualizado_em }));
}
