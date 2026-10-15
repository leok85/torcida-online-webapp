import { describe, expect, it } from 'vitest';
import { nivelDoXp, xpParaONivel } from './nivelDoXp';

describe('nível a partir do XP (igual a nivel_do_xp do banco)', () => {
  it('passar do nível n para o n+1 custa 150 + 50·n', () => {
    expect(nivelDoXp(0)).toEqual({ nivel: 1, xp_no_nivel: 0, xp_do_nivel: 200 });
    expect(nivelDoXp(199)).toEqual({ nivel: 1, xp_no_nivel: 199, xp_do_nivel: 200 });
    expect(nivelDoXp(200)).toEqual({ nivel: 2, xp_no_nivel: 0, xp_do_nivel: 250 });
    expect(nivelDoXp(449)).toEqual({ nivel: 2, xp_no_nivel: 249, xp_do_nivel: 250 });
    expect(nivelDoXp(450)).toEqual({ nivel: 3, xp_no_nivel: 0, xp_do_nivel: 300 });
    expect(nivelDoXp(17250).nivel).toBe(24);
  });

  it('acerta a borda de todo nível até o 200', () => {
    for (let n = 1; n <= 200; n++) {
      expect(nivelDoXp(xpParaONivel(n)).nivel).toBe(n);
      if (n > 1) expect(nivelDoXp(xpParaONivel(n) - 1).nivel).toBe(n - 1);
    }
  });

  it('XP negativo ou vazio é nível 1', () => {
    expect(nivelDoXp(-30).nivel).toBe(1);
    expect(nivelDoXp(Number.NaN).nivel).toBe(1);
  });
});
