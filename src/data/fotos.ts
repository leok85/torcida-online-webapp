// Fotos da torcida (W07). As regras ficam no banco (registrar_foto, curtir_foto, denunciar_foto); aqui, o envio
// para o bucket, a leitura da galeria com URLs assinadas e o que a tela precisa para mostrar.
import { supabase } from '../lib/supabase';
import type { Momento } from './janelaDasFotos';

export { DENUNCIAS_PARA_OCULTAR, LIMITE_DE_JOINHAS, fimDasFotos, janelaDaFoto, joinhasAbertos, type Momento } from './janelaDasFotos';

const BUCKET = 'fotos-torcida';
export const TIPOS_DE_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
export const FOTO_MAX_BYTES = 10 * 1024 * 1024;
/** Fotos por torcedor em cada jogo: uma por janela. */
export const FOTOS_POR_JOGO = 3;
/** O momento do jogo que o torcedor marca na foto (a etiqueta). */
export const ETIQUETAS = ['Antes do jogo', '1º tempo', 'Intervalo', '2º tempo', 'Comemoração'] as const;
export type Etiqueta = (typeof ETIQUETAS)[number];
/** Lado maior da foto salva. */
export const LADO_MAXIMO = 1600;
export const LEGENDA_MAX = 80;
/** De quanto em quanto tempo a galeria busca fotos e joinhas novos enquanto as janelas estão abertas. */
export const ATUALIZAR_GALERIA_MS = 30_000;

export type FotoDaTorcida = {
  id: string;
  autor_apelido: string;
  momento: Momento;
  etiqueta: Etiqueta;
  caminho: string;
  legenda: string;
  curtidas: number;
  eu_curti: boolean;
  minha: boolean;
  criado_em: string;
  /** URL assinada para mostrar a foto (null se não deu para gerar). */
  url: string | null;
};

/** O momento do jogo no subtítulo: "esquenta", "ao vivo", "pós-jogo". */
export const MOMENTO_DO_JOGO: Record<Momento, string> = { pre: 'esquenta', durante: 'ao vivo', pos: 'pós-jogo' };

/** Mensagem de erro do arquivo escolhido, ou null se ele serve. */
export function problemaDoArquivo(arquivo: { type: string; size: number }) {
  if (!TIPOS_DE_FOTO.includes(arquivo.type)) return 'Use uma imagem JPG ou PNG.';
  if (arquivo.size > FOTO_MAX_BYTES) return 'A imagem passa de 10 MB. Escolha uma menor.';
  return null;
}

/** Tamanho final mantendo a proporção, com o lado maior em até LADO_MAXIMO. */
export function tamanhoReduzido(largura: number, altura: number, maximo = LADO_MAXIMO) {
  const escala = Math.min(1, maximo / Math.max(largura, altura));
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

/** A galeria da minha torcida no jogo, com URLs assinadas por 1 h. null quando não deu para buscar. */
export async function buscarFotos(partida: number): Promise<FotoDaTorcida[] | null> {
  const { data, error } = await supabase.rpc('fotos_do_jogo', { p_partida: partida });
  if (error) return null;
  const linhas = (data ?? []) as Omit<FotoDaTorcida, 'url'>[];
  if (!linhas.length) return [];
  const { data: urls } = await supabase.storage.from(BUCKET).createSignedUrls(
    linhas.map((f) => f.caminho),
    60 * 60,
  );
  const porCaminho = new Map((urls ?? []).map((u: { path: string | null; signedUrl: string | null }) => [u.path, u.signedUrl]));
  return linhas.map((f) => ({ ...f, url: porCaminho.get(f.caminho) ?? null }));
}

export type ErroDaFoto =
  | 'fora_da_janela'
  | 'ja_enviou'
  | 'so_membros'
  | 'outro_clube'
  | 'legenda_longa'
  | 'etiqueta_invalida'
  | 'propria_foto'
  | 'joinhas_fechados'
  | 'limite_de_joinhas'
  | 'foto_invalida'
  | 'falha';

export const MENSAGEM_DA_FOTO: Record<ErroDaFoto, string> = {
  fora_da_janela: 'O envio de fotos deste jogo está fechado agora.',
  ja_enviou: 'Você já enviou a foto desta janela.',
  so_membros: 'Fotos são para membros.',
  outro_clube: 'As fotos são da torcida dos times em campo.',
  legenda_longa: `A legenda tem no máximo ${LEGENDA_MAX} caracteres.`,
  etiqueta_invalida: 'Escolha o momento do jogo.',
  propria_foto: 'Não vale joinha na própria foto.',
  joinhas_fechados: 'Os joinhas deste jogo já fecharam.',
  limite_de_joinhas: 'Você já deu os 20 joinhas deste jogo.',
  foto_invalida: 'Essa foto não está mais na galeria.',
  falha: 'Não deu para concluir agora. Tente de novo.',
};

const erroDe = (error: unknown): ErroDaFoto => {
  const hint = (error as { hint?: string } | null)?.hint;
  return hint && hint in MENSAGEM_DA_FOTO ? (hint as ErroDaFoto) : 'falha';
};

/** Envia a foto (já reduzida) para a pasta do torcedor e registra na janela aberta. */
export async function enviarFotoDaTorcida(
  partida: number,
  clubeId: number,
  usuarioId: string,
  imagem: Blob,
  etiqueta: Etiqueta,
  legenda: string,
): Promise<{ ok: true } | { ok: false; erro: ErroDaFoto }> {
  const tipo = imagem.type === 'image/jpeg' ? 'jpg' : 'webp';
  const caminho = `${partida}/${clubeId}/${usuarioId}/${crypto.randomUUID()}.${tipo}`;
  const envio = await supabase.storage.from(BUCKET).upload(caminho, imagem, { contentType: imagem.type, cacheControl: '31536000' });
  if (envio.error) return { ok: false, erro: 'falha' };
  const { error } = await supabase.rpc('registrar_foto', { p_partida: partida, p_caminho: caminho, p_etiqueta: etiqueta, p_legenda: legenda.trim() });
  if (!error) return { ok: true };
  // Sem registro, o arquivo não serve para nada: apaga.
  await supabase.storage.from(BUCKET).remove([caminho]);
  return { ok: false, erro: erroDe(error) };
}

export async function curtirFoto(foto: string): Promise<{ ok: true; curtida: boolean } | { ok: false; erro: ErroDaFoto }> {
  const { data, error } = await supabase.rpc('curtir_foto', { p_foto: foto });
  return error ? { ok: false, erro: erroDe(error) } : { ok: true, curtida: !!data };
}

export async function denunciarFoto(foto: string): Promise<{ ok: true } | { ok: false; erro: ErroDaFoto }> {
  const { error } = await supabase.rpc('denunciar_foto', { p_foto: foto });
  return error ? { ok: false, erro: erroDe(error) } : { ok: true };
}

/** Reduz a foto no navegador (lado maior em até 1600 px). WebP quando o navegador gera, senão JPEG. */
export async function reduzirFoto(arquivo: Blob): Promise<Blob> {
  // Navegador sem createImageBitmap: manda o arquivo como está (o bucket limita a 3 MB).
  if (typeof createImageBitmap === 'undefined') return arquivo;
  const bitmap = await createImageBitmap(arquivo);
  const { largura, altura } = tamanhoReduzido(bitmap.width, bitmap.height);
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext('2d');
  if (!ctx) throw new Error('sem_canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close?.();
  return new Promise<Blob>((resolver, rejeitar) =>
    tela.toBlob(
      (webp) => {
        if (webp?.type === 'image/webp') return resolver(webp);
        tela.toBlob((jpeg) => (jpeg ? resolver(jpeg) : rejeitar(new Error('sem_imagem'))), 'image/jpeg', 0.85);
      },
      'image/webp',
      0.85,
    ),
  );
}
