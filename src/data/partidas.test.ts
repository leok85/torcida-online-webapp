import { describe, expect, it } from 'vitest';
import { partidaDeTeste } from '../test/catalogoDeTeste';
import { aberturaDoPalpite, contagemRegressiva, diaEMes, haJogoNaJanela, haQuanto, infoDoProximo, momentoDoInicio, resultadoPara, separarJogos } from './partidas';

const marcada = (id: number, inicio: string) => partidaDeTeste({ id, inicio, status: 'agendada', periodo: null, minuto: null, gols_mandante: null, gols_visitante: null, gols: [] });
const encerrada = (id: number, inicio: string, gm: number, gv: number) => partidaDeTeste({ id, inicio, status: 'encerrada', periodo: null, minuto: null, gols_mandante: gm, gols_visitante: gv });

describe('haJogoNaJanela', () => {
  const jogo = marcada(1, '2026-10-18T19:00:00Z');
  it.each([
    ['2026-10-18T18:50:00Z', false], // 10 min antes
    ['2026-10-18T18:56:00Z', true], // 4 min antes
    ['2026-10-18T21:30:00Z', true], // em campo, pelo horário
    ['2026-10-18T22:01:00Z', false], // mais de 3 h depois
  ])('jogo marcado às 19:00 UTC, agora %s → %s', (agora, esperado) => expect(haJogoNaJanela([jogo], new Date(agora))).toBe(esperado));

  it('jogo ao vivo sempre conta; encerrado não', () => {
    expect(haJogoNaJanela([partidaDeTeste()], new Date('2030-01-01'))).toBe(true);
    expect(haJogoNaJanela([encerrada(2, '2026-10-11T20:30:00Z', 1, 0)], new Date('2026-10-11T21:00:00Z'))).toBe(false);
  });
});

describe('separarJogos', () => {
  it('destaque é o ao vivo; sem ele, o último resultado; resultados do mais recente para o mais antigo', () => {
    const jogos = [encerrada(1, '2026-10-01T20:00:00Z', 1, 0), encerrada(2, '2026-10-05T20:00:00Z', 0, 2), marcada(3, '2026-10-20T20:00:00Z')];
    const { aoVivo, destaque, proximos, resultados } = separarJogos(jogos);
    expect(aoVivo).toBeNull();
    expect(destaque?.id).toBe(2);
    expect(resultados.map((p) => p.id)).toEqual([2, 1]);
    expect(proximos.map((p) => p.id)).toEqual([3]);
    expect(separarJogos([...jogos, partidaDeTeste({ id: 9 })]).destaque?.id).toBe(9);
  });
});

describe('resultadoPara', () => {
  it('olha do lado do clube, seja mandante ou visitante', () => {
    const jogo = encerrada(1, '2026-10-01T20:00:00Z', 4, 1); // Palmeiras (162) 4 x 1 Corinthians (167)
    expect(resultadoPara(jogo, 162)).toBe('V');
    expect(resultadoPara(jogo, 167)).toBe('D');
    expect(resultadoPara(encerrada(2, '2026-10-01T20:00:00Z', 1, 1), 167)).toBe('E');
  });
});

describe('aberturaDoPalpite', () => {
  // qua 14/10 21:30, dom 18/10 16:00, qui 22/10 19:00 (horário de Brasília)
  const proximos = [marcada(1, '2026-10-15T00:30:00Z'), marcada(2, '2026-10-18T19:00:00Z'), marcada(3, '2026-10-22T22:00:00Z')];

  it('o primeiro abre no apito final com jogo em campo, e está aberto sem jogo', () => {
    expect(aberturaDoPalpite(proximos, 0, true)).toBe('abre no apito final');
    expect(aberturaDoPalpite(proximos, 0, false)).toBe('palpite aberto');
  });

  it('os seguintes abrem no dia depois do jogo anterior', () => {
    expect(aberturaDoPalpite(proximos, 1, false)).toBe('abre qui');
    expect(aberturaDoPalpite(proximos, 2, false)).toBe('abre seg');
  });
});

describe('formatos', () => {
  it('data da lista e linha do próximo jogo no horário de Brasília', () => {
    expect(diaEMes('2026-10-15T00:30:00Z')).toEqual({ dia: '14', mes: 'OUT' });
    expect(infoDoProximo(partidaDeTeste({ inicio: '2026-10-15T00:30:00Z', rodada: 20 }))).toBe('Brasileirão Série A · rodada 20 · qua 21:30');
  });
});

describe('momentoDoInicio', () => {
  const ultimo = encerrada(1, '2026-10-11T20:30:00Z', 4, 1);
  const proximo = marcada(2, '2026-10-15T00:30:00Z'); // qua 14/10 21:30 em Brasília
  const tipo = (agora: string, jogos = [ultimo, proximo]) => momentoDoInicio(jogos, new Date(agora))?.tipo;

  it('ao vivo manda em tudo', () => {
    expect(tipo('2026-10-12T15:00:00Z', [ultimo, partidaDeTeste({ id: 3 }), proximo])).toBe('ao_vivo');
  });

  it('encerrado até o fim do dia anterior à véspera, em Brasília', () => {
    expect(tipo('2026-10-12T15:00:00Z')).toBe('encerrado');
    expect(tipo('2026-10-13T02:59:00Z')).toBe('encerrado'); // seg 23:59 em Brasília
  });

  it('véspera a partir da meia-noite do dia anterior e até o apito', () => {
    expect(tipo('2026-10-13T03:00:00Z')).toBe('vespera'); // ter 00:00 em Brasília
    expect(tipo('2026-10-15T00:29:00Z')).toBe('vespera');
  });

  it('jogo marcado que passou da janela sem começar deixa de ser o próximo', () => {
    expect(tipo('2026-10-15T04:00:00Z')).toBe('encerrado');
  });

  it('sem jogos, nada', () => {
    expect(momentoDoInicio([], new Date())).toBeNull();
  });
});

describe('contagemRegressiva e haQuanto', () => {
  it.each([
    ['2026-10-13T22:00:00Z', '1d 02h'],
    ['2026-10-14T19:18:00Z', '05h 12min'],
    ['2026-10-15T00:18:00Z', '12 min'],
    ['2026-10-15T00:31:00Z', 'em instantes'],
  ])('agora %s → %s', (agora, esperado) => expect(contagemRegressiva('2026-10-15T00:30:00Z', new Date(agora))).toBe(esperado));

  it.each([
    ['2026-10-11T22:27:00Z', 'AGORA'],
    ['2026-10-11T23:05:00Z', 'HÁ 40 MIN'],
    ['2026-10-12T01:30:00Z', 'HÁ 3 H'],
    ['2026-10-13T23:00:00Z', 'HÁ 2 D'],
  ])('jogo das 20:30 UTC, agora %s → %s', (agora, esperado) => expect(haQuanto('2026-10-11T20:30:00Z', new Date(agora))).toBe(esperado));
});
