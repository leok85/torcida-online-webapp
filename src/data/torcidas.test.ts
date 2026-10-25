import { describe, expect, it } from 'vitest';
import { torcidaEmTexto } from './torcidas';

describe('torcidaEmTexto', () => {
  it('número cheio até 10 mil; depois compacto em português', () => {
    expect(torcidaEmTexto(1)).toBe('1');
    expect(torcidaEmTexto(9_999)).toBe('9.999');
    expect(torcidaEmTexto(48_200)).toBe('48,2\u00a0mil');
    expect(torcidaEmTexto(28_600_000)).toBe('28,6\u00a0mi');
  });
});
