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

/** Mesma regra de chat_aberto(): do início até 2 h depois do fim estimado (115 min após o início). */
export function chatAberto(p: Partida, agora = new Date()) {
  if (p.status === 'ao_vivo') return true;
  return p.status === 'encerrada' && agora.getTime() < new Date(p.inicio).getTime() + (115 + 120) * 60_000;
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
 * Titulares em linhas, do ataque (em cima) ao goleiro, pela formação ("3-4-2-1"). Quem foi substituído dá lugar
 * a quem entrou ("entrou 58'"); gols e cartões viram a etiqueta embaixo do nome.
 */
export function linhasDoCampo(escalacao: Escalacao, lances: Lance[], mandante: boolean): NoCampo[][] {
  const meus = [...lances].filter((l) => l.mandante === mandante).reverse(); // do primeiro ao último
  const etiquetas = new Map<number, string[]>();
  const etiquetar = (id: number | null, tag: string) => id !== null && etiquetas.set(id, [...(etiquetas.get(id) ?? []), tag]);
  const substituto = new Map<number, Jogador & { tag: string }>();
  const porId = new Map([...escalacao.titulares, ...escalacao.reservas].map((j) => [j.id, j]));

  for (const l of meus) {
    if (l.tipo === 'gol' && !l.contra) etiquetar(l.jogador_id, `gol ${l.minuto}'`);
    if (l.tipo === 'cartao') etiquetar(l.jogador_id, l.cor);
    if (l.tipo === 'substituicao' && l.saiu_id !== null && l.entrou_id !== null) {
      const entrou = porId.get(l.entrou_id) ?? { id: l.entrou_id, nome: l.entrou, numero: null, posicao: null, capitao: false };
      // Quem saiu pode ter entrado antes no lugar de um titular: segue a cadeia até o titular.
      const titular = [...substituto].find(([, s]) => s.id === l.saiu_id)?.[0] ?? l.saiu_id;
      substituto.set(titular, { ...entrou, tag: `entrou ${l.minuto}'` });
    }
  }

  const noCampo = (j: Jogador): NoCampo => {
    const s = substituto.get(j.id);
    const quem = s ?? j;
    const tags = etiquetas.get(quem.id) ?? [];
    const gols = tags.filter((t) => t.startsWith('gol')).map((t) => t.slice(4));
    const tag = gols.length ? `gol ${gols.join(', ')}` : tags.includes('vermelho') ? 'vermelho' : s ? s.tag : tags.includes('amarelo') ? 'amarelo' : '';
    return { id: quem.id, nome: quem.nome, numero: quem.numero, tag };
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
