// Nível a partir do XP total, igual a nivel_do_xp() da migration. Sem dependências: o e2e também usa.
// Passar do nível n para o n+1 custa 150 + 50·n XP (1→2 = 200); chegar ao nível n custa (n−1)·(150+25n) no total.

export type Nivel = { nivel: number; xp_no_nivel: number; xp_do_nivel: number };

/** XP total para chegar ao nível n. */
export const xpParaONivel = (n: number) => (n - 1) * (150 + 25 * n);

export function nivelDoXp(xp: number): Nivel {
  const total = Math.max(Math.floor(xp || 0), 0);
  let nivel = Math.max(Math.floor((-125 + Math.sqrt(15625 + 100 * (150 + total))) / 50), 1);
  // A raiz pode errar por um na borda; o acerto fino é pela soma exata.
  while (nivel > 1 && xpParaONivel(nivel) > total) nivel -= 1;
  while (xpParaONivel(nivel + 1) <= total) nivel += 1;
  return { nivel, xp_no_nivel: total - xpParaONivel(nivel), xp_do_nivel: 150 + 50 * nivel };
}
