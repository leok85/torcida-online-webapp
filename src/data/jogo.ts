// Página do jogo (W02): o jogo salvo (tabela partidas) e os detalhes que a Edge Function detalhes-da-partida
// busca na BSD (estatísticas, lances e escalações). Mesmo formato de supabase/functions/detalhes-da-partida.
import { chamarFuncao } from '../assinatura/funcoes';
import { supabase } from '../lib/supabase';
import { haQuanto, type Partida } from './partidas';
import type { Detalhes, Escalacao, Estatisticas, Jogador, Lance, Numeros } from './tiposDoJogo';

export type { Detalhes, Escalacao, Escalacoes, Estatisticas, Jogador, Lance, Numeros } from './tiposDoJogo';

export async function partidaPorId(id: number): Promise<Partida | null> {
  const { data, error } = await supabase.from('partidas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Partida | null;
}

export async function buscarDetalhes(id: number): Promise<Detalhes | null> {
  const r = await chamarFuncao<Detalhes>('detalhes-da-partida', { partida: id });
  return r.ok ? r.dados : null;
}

// ---------- cabeçalho e placar ----------

const PERIODOS: Record<string, string> = { '1T': '1º tempo', INT: 'Intervalo', '2T': '2º tempo', PRO: 'Prorrogação', PEN: 'Pênaltis' };

/** Linha embaixo do placar: "67' · 2º tempo", "Intervalo", "Fim de jogo". */
export function momentoDoJogo(p: Partida) {
  if (p.status === 'encerrada') return 'Fim de jogo';
  if (p.status === 'agendada') return 'Antes do jogo';
  if (p.status !== 'ao_vivo') return p.status === 'adiada' ? 'Jogo adiado' : 'Jogo cancelado';
  if (p.periodo === 'INT' || p.periodo === 'PEN') return PERIODOS[p.periodo];
  const periodo = p.periodo ? PERIODOS[p.periodo] : null;
  return [p.minuto != null ? `${p.minuto}'` : null, periodo].filter(Boolean).join(' · ') || 'Ao vivo';
}

/** Selo e subtítulo da faixa do jogo: AO VIVO · 67' ou ENCERRADO · há 3 h. */
export function seloDoJogo(p: Partida, agora = new Date()) {
  if (p.status === 'ao_vivo') return { selo: 'AO VIVO', sub: p.minuto != null && p.periodo !== 'INT' ? `${p.minuto}'` : momentoDoJogo(p), tom: 'aoVivo' as const };
  if (p.status === 'encerrada') return { selo: 'ENCERRADO', sub: haQuanto(p.inicio, agora).toLowerCase(), tom: 'encerrado' as const };
  return { selo: p.status === 'agendada' ? 'PRÓXIMO JOGO' : momentoDoJogo(p).toUpperCase(), sub: '', tom: 'encerrado' as const };
}

/** Mesma regra de chat_aberto(): o chat só aceita mensagem com a bola rolando; o apito final fecha. */
export const chatAberto = (p: Partida) => p.status === 'ao_vivo';

/** Relógio do selo ao vivo: o minuto e o tempo ("67'" + "2º tempo"), ou só "Intervalo"/"Pênaltis". */
export function relogioDoJogo(p: Partida): { minuto: string | null; periodo: string | null } {
  if (p.periodo === 'INT' || p.periodo === 'PEN') return { minuto: null, periodo: PERIODOS[p.periodo] };
  return { minuto: p.minuto != null ? `${p.minuto}'` : null, periodo: p.periodo ? PERIODOS[p.periodo] : null };
}

/**
 * Linha do tempo embaixo do placar: quanto de cada tempo já passou (0–100) e qual está em andamento.
 * Encerrado, os dois cheios; no intervalo, só o primeiro; na prorrogação e nos pênaltis, os dois.
 */
export function linhaDoTempo(p: Partida): { primeiro: number; segundo: number; emAndamento: 1 | 2 | null } {
  const pct = (min: number) => Math.max(0, Math.min(100, Math.round((min / 45) * 100)));
  if (p.status === 'encerrada') return { primeiro: 100, segundo: 100, emAndamento: null };
  if (p.status !== 'ao_vivo') return { primeiro: 0, segundo: 0, emAndamento: null };
  if (p.periodo === 'INT') return { primeiro: 100, segundo: 0, emAndamento: null };
  if (p.periodo === 'PRO' || p.periodo === 'PEN') return { primeiro: 100, segundo: 100, emAndamento: null };
  if (p.periodo === '2T') return { primeiro: 100, segundo: pct((p.minuto ?? 45) - 45), emAndamento: 2 };
  return { primeiro: pct(p.minuto ?? 0), segundo: 0, emAndamento: 1 };
}

const DIA_E_HORA = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** "sáb 11/10 · 17:30": quando foi o jogo, no canto do placar encerrado. */
export function dataDoJogo(p: Partida) {
  const partes = Object.fromEntries(DIA_E_HORA.formatToParts(new Date(p.inicio)).map((x) => [x.type, x.value]));
  return `${partes.weekday.replace('.', '')} ${partes.day}/${partes.month} · ${partes.hour}:${partes.minute}`;
}

// ---------- números da partida ----------

const NUMEROS: { chave: keyof Numeros; rotulo: string; porcento?: boolean }[] = [
  { chave: 'posse', rotulo: 'Posse de bola', porcento: true },
  { chave: 'finalizacoes', rotulo: 'Finalizações' },
  { chave: 'no_gol', rotulo: 'No gol' },
  { chave: 'escanteios', rotulo: 'Escanteios' },
  { chave: 'faltas', rotulo: 'Faltas' },
  { chave: 'impedimentos', rotulo: 'Impedimentos' },
  { chave: 'passes_certos', rotulo: 'Passes certos', porcento: true },
];

/** Linhas de "Números da partida", com a fatia de cada lado na barra; some quem a BSD não mandou. */
export function linhasDosNumeros(e: Estatisticas) {
  return NUMEROS.filter((n) => e.mandante[n.chave] !== null || e.visitante[n.chave] !== null).map((n) => {
    const casa = e.mandante[n.chave] ?? 0;
    const fora = e.visitante[n.chave] ?? 0;
    const total = casa + fora;
    const fatia = (v: number) => `${total ? Math.round((v / total) * 100) : 0}%`;
    const texto = (v: number | null) => (v === null ? '—' : `${v}${n.porcento ? '%' : ''}`);
    return { rotulo: n.rotulo, casa: texto(e.mandante[n.chave]), fora: texto(e.visitante[n.chave]), barraCasa: fatia(casa), barraFora: fatia(fora) };
  });
}

// ---------- lances ----------

export function textoDoLance(l: Lance) {
  if (l.tipo === 'gol') {
    if (l.contra) return `Gol contra de ${l.jogador}`;
    const de = l.penalti ? `Gol de pênalti de ${l.jogador}` : `Gol de ${l.jogador}`;
    return l.assistencia ? `${de}, assistência de ${l.assistencia}` : de;
  }
  if (l.tipo === 'cartao') return `${l.cor === 'vermelho' ? 'Vermelho' : 'Amarelo'} para ${l.jogador}`;
  return `Entra ${l.entrou}, sai ${l.saiu}`;
}

export function iconeDoLance(l: Lance) {
  if (l.tipo === 'gol') return { icone: 'sports_soccer', cor: '#2A6E0D' };
  if (l.tipo === 'cartao') return { icone: 'square', cor: l.cor === 'vermelho' ? '#C0342C' : '#C8901A' };
  return { icone: 'swap_horiz', cor: '#00419B' };
}

// ---------- escalação no campo ----------

export type NoCampo = { id: number; nome: string; numero: number | null; tag: string };

/**
 * A escalação inicial em linhas, do ataque (em cima) ao goleiro, pela formação ("3-4-2-1"). O campo não muda com as
 * trocas: quem saiu leva "saiu 58'" e as entradas ficam na lista de substituições. Gols e cartões viram a etiqueta.
 */
export function linhasDoCampo(escalacao: Escalacao, lances: Lance[], mandante: boolean): NoCampo[][] {
  const meus = [...lances].filter((l) => l.mandante === mandante).reverse(); // do primeiro ao último
  const etiquetas = new Map<number, string[]>();
  const etiquetar = (id: number | null, tag: string) => id !== null && etiquetas.set(id, [...(etiquetas.get(id) ?? []), tag]);
  for (const l of meus) {
    if (l.tipo === 'gol' && !l.contra) etiquetar(l.jogador_id, `gol ${l.minuto}'`);
    if (l.tipo === 'cartao') etiquetar(l.jogador_id, l.cor);
    if (l.tipo === 'substituicao') etiquetar(l.saiu_id, `saiu ${l.minuto}'`);
  }

  const noCampo = (j: Jogador): NoCampo => {
    const tags = etiquetas.get(j.id) ?? [];
    const gols = tags.filter((t) => t.startsWith('gol')).map((t) => t.slice(4));
    const saiu = tags.find((t) => t.startsWith('saiu'));
    const tag = gols.length ? `gol ${gols.join(', ')}` : tags.includes('vermelho') ? 'vermelho' : (saiu ?? (tags.includes('amarelo') ? 'amarelo' : ''));
    return { id: j.id, nome: j.nome, numero: j.numero, tag };
  };

  const [goleiro, ...linha] = escalacao.titulares;
  const numeros = (escalacao.formacao ?? '').split('-').map(Number).filter((n) => n > 0);
  let linhas: Jogador[][];
  if (numeros.length && numeros.reduce((a, b) => a + b, 0) === linha.length) {
    let i = 0;
    linhas = numeros.map((n) => linha.slice(i, (i += n)));
  } else {
    // Sem formação que feche a conta: agrupa por posição.
    linhas = (['D', 'M', 'F'] as const).map((p) => linha.filter((j) => j.posicao === p)).filter((l) => l.length);
  }
  return [...linhas.reverse(), ...(goleiro ? [[goleiro]] : [])].map((l) => l.map(noCampo));
}

export type Substituicao = { minuto: string; entra: { numero: number | null; nome: string }; sai: { numero: number | null; nome: string } };

/** "Substituições": as trocas de um time na ordem do jogo, com o número de quem entra e de quem sai. */
export function substituicoesDe(escalacao: Escalacao | undefined, lances: Lance[], mandante: boolean): Substituicao[] {
  const porId = new Map([...(escalacao?.titulares ?? []), ...(escalacao?.reservas ?? [])].map((j) => [j.id, j]));
  const numero = (id: number | null) => (id !== null ? (porId.get(id)?.numero ?? null) : null);
  return [...lances]
    .reverse()
    .filter((l): l is Extract<Lance, { tipo: 'substituicao' }> => l.tipo === 'substituicao' && l.mandante === mandante)
    .map((l) => ({ minuto: l.minuto, entra: { numero: numero(l.entrou_id), nome: l.entrou }, sai: { numero: numero(l.saiu_id), nome: l.saiu } }));
}

/** Limite de trocas por time (regra da IFAB nas competições da CBF e da Conmebol). */
export const MAXIMO_DE_SUBSTITUICOES = 5;
