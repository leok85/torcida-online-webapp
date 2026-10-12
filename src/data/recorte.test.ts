import { describe, expect, it } from 'vitest';
import { escalaBase, estiloDaImagem, limitarPosicao, limitarZoom, posicaoComZoom, regiaoDoRecorte } from './recorte';

const PAISAGEM = { w: 1200, h: 800 };
const D = 200;

describe('recorte da foto', () => {
  it('no zoom 1x o lado menor da imagem cabe exatamente no círculo', () => {
    expect(escalaBase(PAISAGEM, D)).toBe(0.25);
    expect(regiaoDoRecorte(PAISAGEM, { x: 0, y: 0 }, 1, D)).toEqual({ x: 200, y: 0, lado: 800 });
  });

  it('não deixa arrastar a imagem a ponto de sobrar espaço vazio no círculo', () => {
    // 1200 x 800 a 0,25 = 300 x 200: sobram 50 px para cada lado na horizontal e nada na vertical.
    expect(limitarPosicao({ x: 500, y: -90 }, PAISAGEM, 1, D)).toEqual({ x: 50, y: 0 });
    expect(limitarPosicao({ x: -500, y: 30 }, PAISAGEM, 1, D)).toEqual({ x: -50, y: 0 });
  });

  it('arrastar para a direita mostra a parte esquerda da imagem', () => {
    expect(regiaoDoRecorte(PAISAGEM, { x: 50, y: 0 }, 1, D)).toEqual({ x: 0, y: 0, lado: 800 });
  });

  it('com zoom o recorte fica menor e a folga para arrastar aumenta', () => {
    expect(regiaoDoRecorte(PAISAGEM, { x: 0, y: 0 }, 2, D)).toEqual({ x: 400, y: 200, lado: 400 });
    expect(limitarPosicao({ x: 999, y: 999 }, PAISAGEM, 2, D)).toEqual({ x: 200, y: 100 });
  });

  it('o zoom fica entre 1x e 3x e mantém o mesmo ponto no centro', () => {
    expect(limitarZoom(0.4)).toBe(1);
    expect(limitarZoom(7)).toBe(3);
    expect(posicaoComZoom({ x: 40, y: 0 }, PAISAGEM, 1, 2, D)).toEqual({ x: 80, y: 0 });
    // Voltando ao 1x, a posição volta para dentro da folga menor.
    expect(posicaoComZoom({ x: 200, y: 100 }, PAISAGEM, 2, 1, D)).toEqual({ x: 50, y: 0 });
  });

  it('as miniaturas mostram o mesmo recorte em outro tamanho', () => {
    const estilo = estiloDaImagem(PAISAGEM, { x: 50, y: 0 }, 1, D, 56);
    expect(estilo.width).toBeCloseTo(84);
    expect(estilo.height).toBeCloseTo(56);
    expect(estilo.left).toBeCloseTo(0);
    expect(estilo.top).toBeCloseTo(0);
  });
});
