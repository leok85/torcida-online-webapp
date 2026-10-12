import { describe, expect, it } from 'vitest';
import { areaDaRota, enviosComXpNaSemana, inicioDaSemana, problemaDoAnexo } from './feedback';

describe('feedback', () => {
  it('a área vem da tela de onde a pessoa abriu', () => {
    expect(areaDaRota('/')).toBe('inicio');
    expect(areaDaRota('/ao-vivo')).toBe('jogo');
    expect(areaDaRota('/jogos')).toBe('jogo');
    expect(areaDaRota('/escalacao')).toBe('palpite');
    expect(areaDaRota('/loja')).toBe('loja');
    expect(areaDaRota('/assinar/pagamento')).toBe('assinatura');
    expect(areaDaRota('/conta/assinatura')).toBe('assinatura');
    expect(areaDaRota('/conta/dados')).toBe('conta');
    expect(areaDaRota('/campeonatos')).toBe('outro');
    expect(areaDaRota(undefined)).toBe('outro');
  });

  it('a semana do XP começa na segunda 00:00 em Brasília', () => {
    // Quarta 14/10 às 12:00 em Brasília → segunda 12/10 00:00 (03:00 UTC).
    expect(inicioDaSemana(new Date('2026-10-14T15:00:00Z')).toISOString()).toBe('2026-10-12T03:00:00.000Z');
    // Domingo 18/10 às 23:30 em Brasília ainda é a mesma semana.
    expect(inicioDaSemana(new Date('2026-10-19T02:30:00Z')).toISOString()).toBe('2026-10-12T03:00:00.000Z');
    // Segunda 19/10 à 00:10 em Brasília já é a semana nova.
    expect(inicioDaSemana(new Date('2026-10-19T03:10:00Z')).toISOString()).toBe('2026-10-19T03:00:00.000Z');
  });

  it('conta só os envios desta semana que renderam XP', () => {
    const agora = new Date('2026-10-14T15:00:00Z');
    expect(
      enviosComXpNaSemana(
        [
          { xp: 50, criado_em: '2026-10-13T12:00:00Z' },
          { xp: 0, criado_em: '2026-10-13T13:00:00Z' },
          { xp: 50, criado_em: '2026-10-11T12:00:00Z' },
        ],
        agora,
      ),
    ).toBe(1);
  });

  it('o print aceita PNG, JPG ou WebP de até 5 MB', () => {
    expect(problemaDoAnexo({ type: 'image/png', size: 1000 })).toBeNull();
    expect(problemaDoAnexo({ type: 'image/gif', size: 1000 })).toBe('Use uma imagem PNG, JPG ou WebP.');
    expect(problemaDoAnexo({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).toBe('O print passa de 5 MB. Escolha uma imagem menor.');
  });
});
