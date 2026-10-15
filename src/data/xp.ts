// XP, nível, extrato, missões e ranking. O webapp não credita nada: o banco credita por trigger (palpite, notas, chat,
// fotos, convite, feedback, apito) e o login diário entra por registrar_presenca() ao abrir o app. A leitura de notícia
// é creditada por ler_noticia() (src/data/noticias.ts).
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type Funcoes = Database['public']['Functions'];
export type MeuXp = Funcoes['meu_xp']['Returns'][number];
export type LancamentoDeXp = Funcoes['meu_extrato']['Returns'][number];
export type Missao = Funcoes['minhas_missoes']['Returns'][number];
export type LinhaDoRanking = Funcoes['ranking_xp']['Returns'][number];
export type PeriodoDoRanking = 'temporada' | 'mes' | 'semana';
export type RegraDeXp = Database['public']['Tables']['xp_regras']['Row'];

/** Valores iniciais de xp_regras: valem enquanto as regras não chegam (ou se a leitura falhar). */
export const XP_PADRAO = {
  login_diario: 20,
  palpite_enviado: 50,
  palpite_vencedor: 60,
  palpite_exato: 240,
  palpite_autor: 40,
  notas: 50,
  mensagem_chat: 2,
  foto_enviada: 40,
  foto_campea: 500,
  convite_aceito: 100,
  feedback: 50,
  leitura_noticia: 10,
} as const;
export type AcaoDeXp = keyof typeof XP_PADRAO;

/** Limites iniciais (mesmo período da regra). */
export const LIMITE_PADRAO: Partial<Record<AcaoDeXp, number>> = { login_diario: 1, palpite_enviado: 1, notas: 1, mensagem_chat: 30, foto_enviada: 3, feedback: 2, leitura_noticia: 3 };

/** Login diário: credita uma vez por dia (Brasília). Devolve o XP creditado agora. */
export async function registrarPresenca() {
  const { data, error } = await supabase.rpc('registrar_presenca');
  if (error) throw error;
  return data ?? 0;
}

/** null quando a conta não tem perfil de torcedor. */
export async function buscarMeuXp(): Promise<MeuXp | null> {
  const { data, error } = await supabase.rpc('meu_xp');
  if (error) throw error;
  return data?.[0] ?? null;
}

export type Presenca = { sequencia: number; dias: string[] };

/** Sequência de login e os dias desta semana (yyyy-mm-dd, Brasília) com login. */
export async function buscarPresenca(): Promise<Presenca> {
  const { data, error } = await supabase.rpc('minha_presenca');
  if (error) throw error;
  return data?.[0] ?? { sequencia: 0, dias: [] };
}

export async function buscarExtrato(limite = 30): Promise<LancamentoDeXp[]> {
  const { data, error } = await supabase.rpc('meu_extrato', { p_limite: limite });
  if (error) throw error;
  return data ?? [];
}

export async function buscarMissoes(): Promise<Missao[]> {
  const { data, error } = await supabase.rpc('minhas_missoes');
  if (error) throw error;
  return data ?? [];
}

export async function buscarRanking(periodo: PeriodoDoRanking, clube: number | null, limite = 50): Promise<LinhaDoRanking[]> {
  const { data, error } = await supabase.rpc('ranking_xp', { p_periodo: periodo, p_clube: clube, p_limite: limite });
  if (error) throw error;
  return data ?? [];
}

export type RegrasDeXp = Record<AcaoDeXp, number> & { limites: Partial<Record<AcaoDeXp, number>> };

export const REGRAS_PADRAO: RegrasDeXp = { ...XP_PADRAO, limites: LIMITE_PADRAO };

/** XP de cada ação como a equipe configurou (tabela xp_regras); o que não vier fica no padrão. */
export async function buscarRegras(): Promise<RegrasDeXp> {
  const { data, error } = await supabase.from('xp_regras').select('acao, xp, limite');
  if (error) throw error;
  const regras: RegrasDeXp = { ...REGRAS_PADRAO, limites: { ...LIMITE_PADRAO } };
  for (const r of data ?? []) {
    if (!(r.acao in XP_PADRAO)) continue;
    regras[r.acao as AcaoDeXp] = r.xp;
    if (r.limite == null) delete regras.limites[r.acao as AcaoDeXp];
    else regras.limites[r.acao as AcaoDeXp] = r.limite;
  }
  return regras;
}

// ---------- texto ----------

const NUMERO = new Intl.NumberFormat('pt-BR');
/** 5910 → "5.910". */
export const xpEmTexto = (xp: number) => NUMERO.format(xp);

const FUSO = 'America/Sao_Paulo';
const DIA_MS = 86_400_000;
const diaEmBrasilia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(d);
const horaEmBrasilia = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(d);

/** "hoje 23:12", "ontem 22:40" ou "3 d atrás" (dias de Brasília). */
export function quandoFoi(iso: string, agora = new Date()) {
  const quando = new Date(iso);
  const dias = Math.round((Date.parse(diaEmBrasilia(agora)) - Date.parse(diaEmBrasilia(quando))) / DIA_MS);
  if (dias <= 0) return `hoje ${horaEmBrasilia(quando)}`;
  if (dias === 1) return `ontem ${horaEmBrasilia(quando)}`;
  return `${dias} d atrás`;
}

/** "4 d 6 h restantes" até `fim`. */
export function tempoRestante(fim: Date, agora = new Date()) {
  const horas = Math.max(Math.floor((fim.getTime() - agora.getTime()) / 3_600_000), 0);
  const d = Math.floor(horas / 24);
  const h = horas % 24;
  return d ? `${d} d ${h} h restantes` : `${h} h restantes`;
}
