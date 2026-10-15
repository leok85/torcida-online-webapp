// Notícias do clube (W09). Vêm de fontes externas (sites e feeds RSS): o app mostra título, resumo, imagem do feed e o
// botão para o site original, nunca o texto inteiro. O torcedor vê as publicadas do clube dele e as de todas as
// torcidas. As regras ficam no banco (noticias_do_clube, noticia, ler_noticia, abrir_original, curtir_noticia e os
// comentários); aqui, as chamadas e o que a tela precisa para mostrar.
import type { Database } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { MENSAGEM_SILENCIADO, MENSAGEM_SUSPENSO } from './restricoes';

type Funcoes = Database['public']['Functions'];
export type ResumoDaNoticia = Funcoes['noticias_do_clube']['Returns'][number];
export type Noticia = Funcoes['noticia']['Returns'][number];
export type ComentarioDaNoticia = Funcoes['comentarios_da_noticia']['Returns'][number];
export type OrdemDosComentarios = 'relevantes' | 'recentes';

/** Notícias por página na lista ("Carregar mais" pede a próxima). */
export const NOTICIAS_POR_PAGINA = 10;
/** Comentários por leitura ("Carregar mais comentários" pede mais estes). */
export const COMENTARIOS_POR_PAGINA = 50;
export const TEXTO_MAXIMO = 500;

/** Nome do autor do comentário; sem apelido, "Torcedor". */
export const nomeDoAutor = (apelido: string | null | undefined) => apelido?.trim() || 'Torcedor';

/** "RA" para "Rafa_9": as iniciais do avatar do comentário. */
export const iniciais = (apelido: string) => apelido.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?';

/**
 * Notícias para o meu clube (e as gerais), da mais recente. Para a próxima página, `depois` é a última recebida: o
 * cursor é o par (publicada_em, id), porque a busca em lote publica várias no mesmo instante.
 */
export async function buscarNoticias(depois: Pick<ResumoDaNoticia, 'publicada_em' | 'id'> | null = null, limite = NOTICIAS_POR_PAGINA): Promise<ResumoDaNoticia[]> {
  const { data, error } = await supabase.rpc('noticias_do_clube', { p_limite: limite, p_antes: depois?.publicada_em ?? null, p_antes_id: depois?.id ?? null });
  if (error) throw error;
  return data ?? [];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** O id da rota tem cara de uuid? (o banco recusaria com 22P02; aqui vira "não encontrada" sem chamar nada). */
export const idDeNoticiaValido = (id: string) => UUID.test(id);

/** A notícia; null quando não existe ou não é para mim (não publicada, de outro clube) ou o id nem é uuid. */
export async function buscarNoticia(id: string): Promise<Noticia | null> {
  if (!idDeNoticiaValido(id)) return null;
  const { data, error } = await supabase.rpc('noticia', { p_id: id });
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Marca como lida e devolve o XP creditado agora (0 se já lida ou se o limite do dia passou); null se falhou. */
export async function lerNoticia(id: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('ler_noticia', { p_id: id });
  return error ? null : (data ?? 0);
}

/**
 * Conta o clique em "Ler no site" (a contagem é só para a equipe). O link já está no <a>, então a tela não espera:
 * falhar aqui não impede de abrir o site.
 */
export function contarCliqueNoOriginal(id: string) {
  void supabase.rpc('abrir_original', { p_id: id }).then(
    () => {},
    () => {},
  );
}

export async function buscarComentarios(id: string, ordem: OrdemDosComentarios, limite = COMENTARIOS_POR_PAGINA): Promise<ComentarioDaNoticia[]> {
  const { data, error } = await supabase.rpc('comentarios_da_noticia', { p_id: id, p_ordem: ordem, p_limite: limite });
  if (error) throw error;
  return data ?? [];
}

export type ErroDaNoticia = 'sem_perfil' | 'noticia_inexistente' | 'comentario_inexistente' | 'devagar' | 'silenciado' | 'suspenso' | 'falha';

export const MENSAGEM_DA_NOTICIA: Record<ErroDaNoticia, string> = {
  sem_perfil: 'Complete seu perfil para participar.',
  noticia_inexistente: 'Essa notícia não está mais no ar.',
  comentario_inexistente: 'Esse comentário não está mais na conversa.',
  devagar: 'Calma, um comentário de cada vez.',
  silenciado: MENSAGEM_SILENCIADO,
  suspenso: MENSAGEM_SUSPENSO,
  falha: 'Não deu para concluir agora. Tente de novo.',
};

/** Traduz o hint do banco; o que não for conhecido vira 'falha'. */
export function erroDaNoticia(error: unknown): ErroDaNoticia {
  const hint = (error as { hint?: string } | null)?.hint;
  return hint && Object.hasOwn(MENSAGEM_DA_NOTICIA, hint) ? (hint as ErroDaNoticia) : 'falha';
}

type Resultado<T> = ({ ok: true } & T) | { ok: false; erro: ErroDaNoticia };
type Curtida = { curti: boolean; curtidas: number };

export async function curtirNoticia(id: string): Promise<Resultado<Curtida>> {
  const { data, error } = await supabase.rpc('curtir_noticia', { p_id: id });
  if (error || !data?.[0]) return { ok: false, erro: erroDaNoticia(error) };
  return { ok: true, ...data[0] };
}

export async function comentarNoticia(id: string, texto: string): Promise<Resultado<{ id: number }>> {
  const { data, error } = await supabase.rpc('comentar_noticia', { p_id: id, p_texto: texto.trim() });
  return error ? { ok: false, erro: erroDaNoticia(error) } : { ok: true, id: data };
}

export async function apagarComentario(comentario: number): Promise<Resultado<object>> {
  const { error } = await supabase.rpc('apagar_comentario_da_noticia', { p_comentario: comentario });
  return error ? { ok: false, erro: erroDaNoticia(error) } : { ok: true };
}

export async function curtirComentario(comentario: number): Promise<Resultado<Curtida>> {
  const { data, error } = await supabase.rpc('curtir_comentario_da_noticia', { p_comentario: comentario });
  if (error || !data?.[0]) return { ok: false, erro: erroDaNoticia(error) };
  return { ok: true, ...data[0] };
}
