import { describe, expect, it } from 'vitest';
import { partidaDeTeste } from '../test/catalogoDeTeste';
import { detalhesDeTeste } from '../test/jogoDeTeste';
import { apitoFinal, avaliacao, formatarNota, minutosParaFechar, mvpDe, notasAbertas, quemJogou } from './notas';
import type { Lance } from './tiposDoJogo';

const { escalacoes } = detalhesDeTeste();
const palmeiras = escalacoes!.mandante;

describe('quem jogou', () => {
  it('titulares e quem entrou, com os minutos em campo (mesmo numa troca de quem tinha entrado)', () => {
    const reservas = [...palmeiras.reservas, { id: 35, nome: 'B. Fuchs', numero: 3, posicao: 'D' as const, capitao: false }];
    const lances: Lance[] = [
      { tipo: 'substituicao', minuto: '83', mandante: true, entrou: 'B. Fuchs', saiu: 'R. Sosa', entrou_id: 35, saiu_id: 37 },
      { tipo: 'substituicao', minuto: '70', mandante: false, entrou: 'Allan', saiu: 'Raniele', entrou_id: 1, saiu_id: 267 },
      { tipo: 'substituicao', minuto: '58', mandante: true, entrou: 'R. Sosa', saiu: 'V. Roque', entrou_id: 37, saiu_id: 33 },
    ];
    const lista = quemJogou({ ...palmeiras, reservas }, lances, true);
    expect(lista).toHaveLength(13);
    expect(lista[0]).toEqual({ id: 24, nome: 'C. Miguel', numero: 1, posicao: 'goleiro', minutos: 90 });
    expect(lista.find((j) => j.nome === 'V. Roque')).toMatchObject({ posicao: 'atacante', minutos: 58 });
    expect(lista.slice(-2)).toEqual([
      { id: 37, nome: 'R. Sosa', numero: 19, posicao: 'atacante', minutos: 25 },
      { id: 35, nome: 'B. Fuchs', numero: 3, posicao: 'defensor', minutos: 7 },
    ]);
  });

  it('acréscimos não passam de 90 e quem entrou no fim joga pelo menos 1 min', () => {
    const lances: Lance[] = [{ tipo: 'substituicao', minuto: '90+3', mandante: true, entrou: 'R. Sosa', saiu: 'V. Roque', entrou_id: 37, saiu_id: 33 }];
    expect(quemJogou(palmeiras, lances, true).at(-1)).toMatchObject({ nome: 'R. Sosa', minutos: 1 });
  });
});

describe('notas', () => {
  it('cor e texto de cada faixa', () => {
    expect(avaliacao(0).texto).toBe('sem nota');
    expect(avaliacao(9)).toMatchObject({ texto: 'jogou bem', cor: '#2A6E0D' });
    expect(avaliacao(5)).toMatchObject({ texto: 'cumpriu', cor: '#00419B' });
    expect(avaliacao(4)).toMatchObject({ texto: 'ficou devendo', cor: '#C0342C' });
    expect(formatarNota(8.7)).toBe('8,7');
    expect(formatarNota(9)).toBe('9,0');
  });

  it('MVP: maior média; no empate, mais votos; sem votos, ninguém', () => {
    const n = (jogador_id: number, media: number, votos: number) => ({ jogador_id, media, votos, minha: null, votantes: 10 });
    expect(mvpDe([n(1, 8.1, 3), n(2, 8.7, 2), n(3, 8.7, 5)])?.jogador_id).toBe(3);
    expect(mvpDe([])).toBeNull();
  });

  it('janela: do apito final até 1 h depois; sem a hora do apito, o fim estimado', () => {
    const fim = partidaDeTeste({ status: 'encerrada', encerrada_em: '2026-10-11T22:25:00Z' });
    expect(notasAbertas(fim, new Date('2026-10-11T23:24:00Z'))).toBe(true);
    expect(notasAbertas(fim, new Date('2026-10-11T23:26:00Z'))).toBe(false);
    expect(minutosParaFechar(fim, new Date('2026-10-11T22:38:00Z'))).toBe(47);
    expect(notasAbertas(partidaDeTeste())).toBe(false);
    // Início 20:30Z + 115 min.
    expect(apitoFinal(partidaDeTeste({ status: 'encerrada' })).toISOString()).toBe('2026-10-11T22:25:00.000Z');
  });
});
