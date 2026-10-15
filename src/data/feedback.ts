// Enviar feedback (W23): tipos, áreas do app, envio com print opcional e o histórico do torcedor.
import type { FeedbackRow, Json } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { descreverAparelho } from './conta';
import { inicioDaSemana } from './semana';

export { inicioDaSemana };

export type Tipo = 'problema' | 'sugestao' | 'elogio';
export type Area = 'inicio' | 'jogo' | 'palpite' | 'missoes' | 'ranking' | 'loja' | 'assinatura' | 'conta' | 'outro';

export const TIPOS: { id: Tipo; rotulo: string; sub: string; icone: string; pergunta: string; exemplo: string }[] = [
  {
    id: 'problema',
    rotulo: 'Problema',
    sub: 'algo quebrou ou travou',
    icone: 'bug_report',
    pergunta: 'O que aconteceu? Se puder, conte o passo a passo.',
    exemplo: 'Ex.: abri o chat do jogo e as mensagens pararam de atualizar depois do intervalo.',
  },
  {
    id: 'sugestao',
    rotulo: 'Sugestão',
    sub: 'ideia para melhorar',
    icone: 'lightbulb',
    pergunta: 'O que você gostaria de ver?',
    exemplo: 'Ex.: poder filtrar o chat só pelos lances do jogo.',
  },
  {
    id: 'elogio',
    rotulo: 'Elogio',
    sub: 'o que está funcionando',
    icone: 'favorite',
    pergunta: 'O que você curtiu?',
    exemplo: 'Ex.: as notas do pós-jogo ficaram muito boas.',
  },
];

export const AREAS: { id: Area; rotulo: string }[] = [
  { id: 'inicio', rotulo: 'Início' },
  { id: 'jogo', rotulo: 'Jogo e chat' },
  { id: 'palpite', rotulo: 'Palpites' },
  { id: 'missoes', rotulo: 'Missões' },
  { id: 'ranking', rotulo: 'Ranking' },
  { id: 'loja', rotulo: 'Loja e moedas' },
  { id: 'assinatura', rotulo: 'Assinatura' },
  { id: 'conta', rotulo: 'Conta' },
  { id: 'outro', rotulo: 'Outro' },
];

export const TEXTO_MIN = 10;
export const TEXTO_MAX = 1000;
export const XP_POR_ENVIO = 50;
export const ENVIOS_COM_XP_POR_SEMANA = 2;
export const ANEXO_MAX_BYTES = 5 * 1024 * 1024;
export const TIPOS_DE_ANEXO = ['image/png', 'image/jpeg', 'image/webp'];

/** A área já vem marcada pela tela de onde a pessoa abriu o feedback. */
export function areaDaRota(caminho: string | undefined): Area {
  if (!caminho) return 'outro';
  if (caminho === '/') return 'inicio';
  if (caminho === '/escalacao' || /^\/jogo\/\d+\/escalacao$/.test(caminho)) return 'palpite';
  if (['/jogos', '/pos-jogo', '/fotos'].includes(caminho) || caminho.startsWith('/jogo/')) return 'jogo';
  if (caminho === '/missoes') return 'missoes';
  if (caminho === '/ranking') return 'ranking';
  if (caminho === '/loja') return 'loja';
  if (caminho.startsWith('/assinar') || caminho.startsWith('/conta/assinatura')) return 'assinatura';
  if (caminho.startsWith('/conta') || caminho === '/perfil') return 'conta';
  return 'outro';
}

/** Navegador, sistema, idioma, tamanho da janela e a última tela aberta. */
export function dadosDoNavegador(ultimaTela: string | undefined) {
  return {
    navegador: descreverAparelho(navigator.userAgent).nome,
    user_agent: navigator.userAgent,
    idioma: navigator.language,
    janela: `${window.innerWidth}x${window.innerHeight}`,
    ultima_tela: ultimaTela ?? null,
  };
}

export function problemaDoAnexo(arquivo: { type: string; size: number }) {
  if (!TIPOS_DE_ANEXO.includes(arquivo.type)) return 'Use uma imagem PNG, JPG ou WebP.';
  if (arquivo.size > ANEXO_MAX_BYTES) return 'O print passa de 5 MB. Escolha uma imagem menor.';
  return null;
}

const FUSO = 'America/Sao_Paulo';

/** Quantos envios desta semana já renderam XP (o limite é 2). */
export function enviosComXpNaSemana(lista: Pick<FeedbackRow, 'xp' | 'criado_em'>[], agora = new Date()) {
  const inicio = inicioDaSemana(agora).getTime();
  return lista.filter((f) => f.xp > 0 && new Date(f.criado_em).getTime() >= inicio).length;
}

export const ESTADOS: Record<string, { rotulo: string; fundo: string; cor: string }> = {
  recebido: { rotulo: 'Recebido', fundo: 'var(--soft)', cor: 'var(--ink-2)' },
  analise: { rotulo: 'Em análise', fundo: 'var(--gold-soft)', cor: 'var(--gold-dark)' },
  implementado: { rotulo: 'Implementado', fundo: 'var(--green-soft)', cor: 'var(--green-dark)' },
  resolvido: { rotulo: 'Resolvido', fundo: 'var(--green-soft)', cor: 'var(--green-dark)' },
};

export const rotuloDoTipo = (tipo: string) => TIPOS.find((t) => t.id === tipo)?.rotulo ?? tipo;

const DIA_E_MES = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO });
export const diaEMes = (iso: string) => DIA_E_MES.format(new Date(iso));

export async function meusFeedbacks(): Promise<FeedbackRow[]> {
  const { data, error } = await supabase.from('feedbacks').select('*').order('criado_em', { ascending: false });
  if (error) throw error;
  return data;
}

type NovoFeedback = {
  usuarioId: string;
  tipo: Tipo;
  area: Area;
  texto: string;
  anexo: File | null;
  dadosNavegador: Record<string, string | null> | null;
  podeResponder: boolean;
};

/** Envia o print (se houver) e grava o feedback; o servidor decide o XP e o estado. */
export async function enviarFeedback(novo: NovoFeedback): Promise<FeedbackRow> {
  let anexo: string | null = null;
  if (novo.anexo) {
    const extensao = novo.anexo.type === 'image/png' ? 'png' : novo.anexo.type === 'image/webp' ? 'webp' : 'jpg';
    anexo = `${novo.usuarioId}/${crypto.randomUUID()}.${extensao}`;
    const { error } = await supabase.storage.from('feedback').upload(anexo, novo.anexo, { contentType: novo.anexo.type });
    if (error) throw error;
  }
  const { data, error } = await supabase
    .from('feedbacks')
    .insert({
      tipo: novo.tipo,
      area: novo.area,
      texto: novo.texto.trim(),
      anexo,
      dados_navegador: novo.dadosNavegador as Json,
      pode_responder: novo.podeResponder,
    })
    .select()
    .single();
  if (error) {
    // Recusado (limite, conta suspensa...): o print não fica sobrando no bucket.
    if (anexo) await supabase.storage.from('feedback').remove([anexo]);
    throw error;
  }
  return data;
}
