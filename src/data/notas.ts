// Pós-jogo e notas (W04): a torcida dá notas de 1 a 10 aos jogadores do próprio time até 1 h depois do apito final.
// As regras ficam no banco (enviar_notas, notas_da_torcida); aqui, o que a tela precisa para mostrar.
import { supabase } from '../lib/supabase';
import type { Partida } from './partidas';
import type { Escalacao, Jogador, Lance } from './tiposDoJogo';
import { MENSAGEM_SUSPENSO } from './restricoes';

export type NotaDaTorcida = { jogador_id: number; media: number; votos: number; minha: number | null; votantes: number };

/** Quanto tempo a janela de notas fica aberta depois do apito final. */
export const JANELA_DAS_NOTAS_MS = 60 * 60_000;
/** Fim estimado quando não sabemos a hora do apito: início + 115 min. */
const FIM_ESTIMADO_MS = 115 * 60_000;

/** Hora do apito final (gravada pelo banco quando o jogo terminou; senão, o fim estimado). */
export const apitoFinal = (p: Partida) => new Date(p.encerrada_em ?? new Date(new Date(p.inicio).getTime() + FIM_ESTIMADO_MS).toISOString());

/** Mesma regra de notas_abertas(): do apito final até 1 h depois. */
export const notasAbertas = (p: Partida, agora = new Date()) =>
  p.status === 'encerrada' && agora.getTime() < apitoFinal(p).getTime() + JANELA_DAS_NOTAS_MS;

/** "47 min" até a janela fechar (mínimo 1). */
export function minutosParaFechar(p: Partida, agora = new Date()) {
  return Math.max(1, Math.ceil((apitoFinal(p).getTime() + JANELA_DAS_NOTAS_MS - agora.getTime()) / 60_000));
}

export async function buscarNotas(partida: number): Promise<NotaDaTorcida[] | null> {
  const { data, error } = await supabase.rpc('notas_da_torcida', { p_partida: partida });
  return error ? null : ((data ?? []) as NotaDaTorcida[]);
}

export type ErroDasNotas = 'notas_fechadas' | 'so_membros' | 'outro_clube' | 'jogador_invalido' | 'suspenso' | 'falha';

export const MENSAGEM_DAS_NOTAS: Record<ErroDasNotas, string> = {
  notas_fechadas: 'As notas deste jogo já fecharam.',
  so_membros: 'Notas são para membros.',
  outro_clube: 'As notas são da torcida dos times em campo.',
  jogador_invalido: 'Um dos jogadores não jogou por este time. Recarregue a página.',
  suspenso: MENSAGEM_SUSPENSO,
  falha: 'Não deu para enviar agora. Tente de novo.',
};

export async function enviarNotas(partida: number, notas: { jogador: number; nota: number }[]): Promise<{ ok: true } | { ok: false; erro: ErroDasNotas }> {
  const { error } = await supabase.rpc('enviar_notas', { p_partida: partida, p_notas: notas });
  if (!error) return { ok: true };
  const hint = (error as { hint?: string }).hint;
  return { ok: false, erro: hint && hint in MENSAGEM_DAS_NOTAS ? (hint as ErroDasNotas) : 'falha' };
}

// ---------- quem jogou ----------

const POSICAO: Record<NonNullable<Jogador['posicao']>, string> = { G: 'goleiro', D: 'defensor', M: 'meia', F: 'atacante' };

export type QuemJogou = { id: number; nome: string; numero: number | null; posicao: string | null; minutos: number };

const minutoInteiro = (m: string) => Math.min(90, parseInt(m, 10) || 0);

/**
 * Os jogadores do time que entraram em campo, na ordem da escalação: titulares e depois quem entrou, com os minutos
 * jogados (titular até sair ou 90; quem entrou, do minuto da troca até sair ou 90).
 */
export function quemJogou(escalacao: Escalacao, lances: Lance[], mandante: boolean): QuemJogou[] {
  const trocas = [...lances]
    .reverse()
    .filter((l): l is Extract<Lance, { tipo: 'substituicao' }> => l.tipo === 'substituicao' && l.mandante === mandante);
  const entrou = new Map(trocas.filter((t) => t.entrou_id !== null).map((t) => [t.entrou_id!, minutoInteiro(t.minuto)]));
  const saiu = new Map(trocas.filter((t) => t.saiu_id !== null).map((t) => [t.saiu_id!, minutoInteiro(t.minuto)]));
  const porId = new Map([...escalacao.titulares, ...escalacao.reservas].map((j) => [j.id, j]));
  const jogador = (id: number, nome: string): QuemJogou => {
    const j = porId.get(id);
    const de = entrou.get(id) ?? 0;
    const ate = saiu.get(id) ?? 90;
    return { id, nome: j?.nome ?? nome, numero: j?.numero ?? null, posicao: j?.posicao ? POSICAO[j.posicao] : null, minutos: Math.max(1, ate - de) };
  };
  return [
    ...escalacao.titulares.map((j) => jogador(j.id, j.nome)),
    ...trocas.filter((t) => t.entrou_id !== null).map((t) => jogador(t.entrou_id!, t.entrou)),
  ];
}

// ---------- notas ----------

/** Cor e texto da nota, como no design: 7+ jogou bem, 5–6 cumpriu, até 4 ficou devendo. */
export function avaliacao(nota: number | null | undefined) {
  if (!nota) return { texto: 'sem nota', cor: '#6E7C93', fundo: '#EBF0F6', preenchido: '' };
  if (nota >= 7) return { texto: 'jogou bem', cor: '#2A6E0D', fundo: '#E1F4D8', preenchido: '#3FA414' };
  if (nota >= 5) return { texto: 'cumpriu', cor: '#00419B', fundo: '#DCE8F9', preenchido: '#00419B' };
  return { texto: 'ficou devendo', cor: '#C0342C', fundo: '#FCEDEC', preenchido: '#C0342C' };
}

/** "8,7" (uma casa, vírgula). */
export const formatarNota = (n: number) => n.toFixed(1).replace('.', ',');

/** MVP: a maior média da torcida; no empate, quem teve mais votos. Null sem votos. */
export function mvpDe(notas: NotaDaTorcida[]) {
  return [...notas].sort((a, b) => b.media - a.media || b.votos - a.votos)[0] ?? null;
}
