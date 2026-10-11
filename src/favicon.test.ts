import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = join(import.meta.dirname, '..');

/** Largura e altura lidas do cabeçalho IHDR do PNG. */
function tamanhoPng(arquivo: string) {
  const png = readFileSync(arquivo);
  return { largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) };
}

describe('favicon', () => {
  it('o index.html aponta para o ícone da marca', () => {
    expect(readFileSync(join(raiz, 'index.html'), 'utf8')).toContain('<link rel="icon" type="image/png" href="/icon-color.png" />');
  });

  // O ícone antigo era um recorte de 437 px que cortava o fundo e a lateral direita do escudo.
  it('é o ícone inteiro do design (icon-color-v3), quadrado e com 256 px', () => {
    expect(tamanhoPng(join(raiz, 'public/icon-color.png'))).toEqual({ largura: 256, altura: 256 });
  });
});
