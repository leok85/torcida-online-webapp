import { describe, expect, it } from 'vitest';
import { APP_IPHONE, CHROME_MAC, EDGE_WINDOWS } from '../test/supabaseFalso';
import { descreverAparelho, problemaDaFoto, proximaTrocaDeApelido, textoDaSenha, textoDoApelido, usadoHa } from './conta';

const AGORA = new Date('2026-10-14T15:00:00Z');

describe('aparelhos', () => {
  it.each([
    [CHROME_MAC, 'Chrome · macOS', 'computador'],
    [EDGE_WINDOWS, 'Edge · Windows', 'computador'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'Safari · macOS', 'computador'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari · iPhone', 'celular'],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36', 'Chrome · Android', 'celular'],
    [APP_IPHONE, 'iPhone · app', 'celular'],
    ['okhttp/4.12.0', 'Android · app', 'celular'],
    [null, 'Aparelho desconhecido', 'computador'],
  ])('%s vira "%s"', (ua, nome, tipo) => {
    expect(descreverAparelho(ua)).toEqual({ nome, tipo });
  });

  it('último uso em palavras', () => {
    expect(usadoHa('2026-10-14T14:58:00Z', AGORA)).toBe('agora');
    expect(usadoHa('2026-10-14T14:20:00Z', AGORA)).toBe('há 40 min');
    expect(usadoHa('2026-10-14T13:00:00Z', AGORA)).toBe('há 2 h');
    expect(usadoHa('2026-10-13T12:00:00Z', AGORA)).toBe('há 1 dia');
    expect(usadoHa('2026-10-11T12:00:00Z', AGORA)).toBe('há 3 dias');
  });
});

describe('apelido', () => {
  it('libera a troca 30 dias depois da última', () => {
    expect(proximaTrocaDeApelido(null, AGORA)).toBeNull();
    expect(proximaTrocaDeApelido('2026-09-01T12:00:00Z', AGORA)).toBeNull();
    expect(proximaTrocaDeApelido('2026-10-04T12:00:00Z', AGORA)).toEqual(new Date('2026-11-03T12:00:00Z'));
  });

  it('frase de apoio da linha', () => {
    expect(textoDoApelido(null, AGORA)).toBe('Dá para trocar uma vez a cada 30 dias');
    expect(textoDoApelido('2026-07-14T12:00:00Z', AGORA)).toBe('Última troca há 92 dias · pode trocar agora');
    expect(textoDoApelido('2026-10-13T12:00:00Z', AGORA)).toBe('Última troca há 1 dia · próxima troca em 12/11/2026');
    expect(textoDoApelido('2026-10-14T12:00:00Z', AGORA)).toBe('Trocado hoje · próxima troca em 13/11/2026');
  });
});

describe('senha', () => {
  it('quando foi alterada, em dias, meses ou anos', () => {
    expect(textoDaSenha('2026-10-14T09:00:00Z', AGORA)).toBe('Alterada hoje');
    expect(textoDaSenha('2026-10-13T12:00:00Z', AGORA)).toBe('Alterada há 1 dia');
    expect(textoDaSenha('2026-09-20T12:00:00Z', AGORA)).toBe('Alterada há 24 dias');
    expect(textoDaSenha('2026-06-10T12:00:00Z', AGORA)).toBe('Alterada há 4 meses');
    expect(textoDaSenha('2025-09-01T12:00:00Z', AGORA)).toBe('Alterada há 1 ano');
  });
});

describe('foto', () => {
  it('aceita JPG, PNG e WebP de até 5 MB', () => {
    expect(problemaDaFoto({ type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull();
    expect(problemaDaFoto({ type: 'image/heic', size: 1000 })).toBe('Use uma imagem JPG, PNG ou WebP.');
    expect(problemaDaFoto({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 })).toBe('A imagem passa de 5 MB. Escolha uma menor.');
  });
});
