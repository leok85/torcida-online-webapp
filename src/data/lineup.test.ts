import { describe, expect, it } from 'vitest';
import { elencosDeTeste } from '../test/palpitesDeTeste';
import { escalar, resolveLineup, slotsFor } from './lineup';

const palmeiras = elencosDeTeste().get(162)!;
const nomes = (lineup: Record<string, number>) => Object.fromEntries(Object.entries(lineup).map(([v, id]) => [v, palmeiras.find((j) => j.id === id)?.nome]));

describe('escalação ideal', () => {
  it('preenche pela posição natural e deixa de fora lesionado e suspenso', () => {
    expect(nomes(resolveLineup(slotsFor('4-3-3'), {}, palmeiras))).toEqual({
      gol0: 'C. Miguel',
      l0p0: 'A. Barboza',
      l0p1: 'B. Fuchs',
      l0p2: 'Khellven',
      l0p3: 'J. Piquerez',
      l1p0: 'F. Anderson',
      l1p1: 'A. Pereira',
      l1p2: 'J. Arias',
      l2p0: 'V. Roque',
      l2p1: 'Paulinho',
      l2p2: 'J. López',
    });
  });

  it('respeita as escolhas (até um suspenso) e ignora quem não está no elenco ou repetido', () => {
    const lineup = resolveLineup(slotsFor('4-3-3'), { l0p0: 3622, l0p1: 3622, l2p1: 999 }, palmeiras);
    expect(nomes(lineup)).toMatchObject({ l0p0: 'A. Giay', l0p1: 'A. Barboza', l2p1: 'Paulinho' });
    expect(new Set(Object.values(lineup)).size).toBe(11);
  });

  it('sem gente da posição, a vaga usa quem cabe nela; sem ninguém, fica vazia', () => {
    const lineup = resolveLineup(slotsFor('4-3-3'), {}, palmeiras.filter((j) => j.posicao !== 'F'));
    expect(nomes(lineup)).toMatchObject({ l2p0: 'M. Freitas' });
    expect(lineup.l2p1).toBeUndefined();
  });

  it('escalar quem já está em campo troca os dois de lugar; do banco, só entra', () => {
    const base = resolveLineup(slotsFor('4-3-3'), {}, palmeiras);
    expect(nomes(escalar(base, 'l0p1', 25))).toMatchObject({ l0p1: 'Khellven', l0p2: 'B. Fuchs' });
    const doBanco = escalar(base, 'l0p1', 27);
    expect(nomes(doBanco)).toMatchObject({ l0p1: 'Murilo', l0p2: 'Khellven' });
    expect(Object.values(doBanco)).not.toContain(35);
  });
});
