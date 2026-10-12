// Recorte redondo da foto do perfil: a imagem fica atrás de um círculo de diâmetro D, com zoom de 1x a 3x,
// e sempre cobre o círculo inteiro. A posição é o deslocamento do centro da imagem em relação ao centro do círculo.

export type Tamanho = { w: number; h: number };
export type Posicao = { x: number; y: number };

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;

/** Escala em que o lado menor da imagem cabe exatamente no círculo (zoom 1x). */
export const escalaBase = (img: Tamanho, diametro: number) => diametro / Math.min(img.w, img.h);

export const limitarZoom = (zoom: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

/** Segura a imagem para ela nunca deixar sobra dentro do círculo. */
export function limitarPosicao(pos: Posicao, img: Tamanho, zoom: number, diametro: number): Posicao {
  const escala = escalaBase(img, diametro) * zoom;
  const folgaX = Math.max(0, (img.w * escala - diametro) / 2);
  const folgaY = Math.max(0, (img.h * escala - diametro) / 2);
  const limitar = (v: number, folga: number) => Math.min(folga, Math.max(-folga, v)) || 0;
  return { x: limitar(pos.x, folgaX), y: limitar(pos.y, folgaY) };
}

/** Ao mudar o zoom, mantém o mesmo ponto da imagem no centro do círculo. */
export function posicaoComZoom(pos: Posicao, img: Tamanho, zoomAntes: number, zoomDepois: number, diametro: number) {
  const fator = zoomDepois / zoomAntes;
  return limitarPosicao({ x: pos.x * fator, y: pos.y * fator }, img, zoomDepois, diametro);
}

/** O quadrado da imagem original que está dentro do círculo, em pixels da imagem. */
export function regiaoDoRecorte(img: Tamanho, pos: Posicao, zoom: number, diametro: number) {
  const escala = escalaBase(img, diametro) * zoom;
  const lado = diametro / escala;
  const centroX = img.w / 2 - pos.x / escala;
  const centroY = img.h / 2 - pos.y / escala;
  return { x: centroX - lado / 2, y: centroY - lado / 2, lado };
}

/** Onde desenhar a imagem numa janela redonda de `tamanho` px que mostra o mesmo recorte (miniaturas). */
export function estiloDaImagem(img: Tamanho, pos: Posicao, zoom: number, diametro: number, tamanho: number) {
  const fator = tamanho / diametro;
  const escala = escalaBase(img, diametro) * zoom * fator;
  const largura = img.w * escala;
  const altura = img.h * escala;
  return {
    width: largura,
    height: altura,
    left: tamanho / 2 + pos.x * fator - largura / 2,
    top: tamanho / 2 + pos.y * fator - altura / 2,
  };
}
