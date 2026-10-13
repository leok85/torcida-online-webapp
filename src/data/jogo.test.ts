import { describe, expect, it } from 'vitest';
import { partidaDeTeste } from '../test/catalogoDeTeste';
import { detalhesDeTeste } from '../test/jogoDeTeste';
import { chatAberto, dataDoJogo, linhaDoTempo, linhasDoCampo, relogioDoJogo, linhasDosNumeros, momentoDoJogo, seloDoJogo, textoDoLance, type Lance } from './jogo';

const { escalacoes } = detalhesDeTeste();
const palmeiras = escalacoes!.mandante;
const nomes = (linhas: { nome: string }[][]) => linhas.map((l) => l.map((j) => j.nome));

describe('linhasDoCampo', () => {
  it('monta as linhas pela formação, do ataque ao goleiro', () => {
    expect(nomes(linhasDoCampo(palmeiras, [], true))).toEqual([
      ['V. Roque'],
      ['J. López', 'J. Arias'],
      ['A. Giay', 'A. Pereira', 'L. Evangelista', 'J. Piquerez'],
      ['Murilo', 'G. Gómez', 'A. Barboza'],
      ['C. Miguel'],
    ]);
  });

  it('formação que não fecha a conta com os titulares: agrupa por posição', () => {
    expect(nomes(linhasDoCampo({ ...palmeiras, formacao: '4-4-3' }, [], true))).toHaveLength(4);
    expect(nomes(linhasDoCampo({ ...palmeiras, formacao: null }, [], true))[0]).toEqual(['J. López', 'J. Arias', 'V. Roque']);
  });

  it('quem entrou ocupa o lugar do titular, mesmo numa segunda troca', () => {
    const reservas = [...palmeiras.reservas, { id: 35, nome: 'B. Fuchs', numero: 3, posicao: 'D' as const, capitao: false }];
    const lances: Lance[] = [
      { tipo: 'substituicao', minuto: '83', mandante: true, entrou: 'B. Fuchs', saiu: 'R. Sosa', entrou_id: 35, saiu_id: 37 },
      { tipo: 'substituicao', minuto: '58', mandante: true, entrou: 'R. Sosa', saiu: 'V. Roque', entrou_id: 37, saiu_id: 33 },
    ];
    const ataque = linhasDoCampo({ ...palmeiras, reservas }, lances, true)[0];
    expect(ataque[0]).toEqual({ id: 35, nome: 'B. Fuchs', numero: 3, tag: "entrou 83'" });
  });

  it('etiquetas: gols juntos, vermelho antes da substituição, amarelo por último; lances do outro time não contam', () => {
    const lances: Lance[] = [
      { tipo: 'cartao', minuto: '80', mandante: true, jogador: 'J. Arias', jogador_id: 530, cor: 'vermelho' },
      { tipo: 'gol', minuto: '51', mandante: true, jogador: 'J. López', jogador_id: 34, assistencia: null, contra: false, penalti: true },
      { tipo: 'cartao', minuto: '30', mandante: true, jogador: 'J. Arias', jogador_id: 530, cor: 'amarelo' },
      { tipo: 'gol', minuto: '45+1', mandante: true, jogador: 'J. López', jogador_id: 34, assistencia: null, contra: false, penalti: false },
      { tipo: 'gol', minuto: '20', mandante: false, jogador: 'Gol contra', jogador_id: 33, assistencia: null, contra: true, penalti: false },
    ];
    const [ponta, ataque] = linhasDoCampo(palmeiras, lances, true);
    expect(ataque.map((j) => j.tag)).toEqual(["gol 45+1', 51'", 'vermelho']);
    expect(ponta[0].tag).toBe('');
  });
});

describe('números e lances', () => {
  it('linhas com a fatia de cada lado; quem não veio da BSD some', () => {
    const linhas = linhasDosNumeros(detalhesDeTeste().estatisticas!);
    expect(linhas.map((l) => l.rotulo)).toEqual(['Posse de bola', 'Finalizações', 'No gol', 'Escanteios', 'Faltas', 'Passes certos']);
    expect(linhas[1]).toEqual({ rotulo: 'Finalizações', casa: '11', fora: '6', barraCasa: '65%', barraFora: '35%' });
    expect(linhas[0]).toMatchObject({ casa: '58%', fora: '42%' });
  });

  it('texto de cada lance', () => {
    expect(textoDoLance({ tipo: 'gol', minuto: '46', mandante: true, jogador: 'M. Bidu', jogador_id: 1, assistencia: 'X', contra: true, penalti: false })).toBe(
      'Gol contra de M. Bidu',
    );
    expect(textoDoLance({ tipo: 'gol', minuto: '51', mandante: true, jogador: 'A. Giay', jogador_id: 1, assistencia: null, contra: false, penalti: true })).toBe(
      'Gol de pênalti de A. Giay',
    );
    expect(textoDoLance({ tipo: 'cartao', minuto: '20', mandante: false, jogador: 'Raniele', jogador_id: 1, cor: 'vermelho' })).toBe('Vermelho para Raniele');
  });
});

describe('momento do jogo', () => {
  it('minuto e tempo ao vivo, intervalo e fim de jogo', () => {
    expect(momentoDoJogo(partidaDeTeste())).toBe("67' · 2º tempo");
    expect(momentoDoJogo(partidaDeTeste({ periodo: 'INT', minuto: 45 }))).toBe('Intervalo');
    expect(momentoDoJogo(partidaDeTeste({ status: 'encerrada' }))).toBe('Fim de jogo');
    expect(seloDoJogo(partidaDeTeste({ status: 'encerrada' }), new Date('2026-10-12T02:25:00Z'))).toEqual({ selo: 'ENCERRADO', sub: 'há 4 h', tom: 'encerrado' });
  });

  it('chat aberto só com a bola rolando', () => {
    expect(chatAberto(partidaDeTeste())).toBe(true);
    expect(chatAberto(partidaDeTeste({ status: 'encerrada' }))).toBe(false);
    expect(chatAberto(partidaDeTeste({ status: 'agendada' }))).toBe(false);
  });

  it('relógio do selo ao vivo', () => {
    expect(relogioDoJogo(partidaDeTeste())).toEqual({ minuto: "67'", periodo: '2º tempo' });
    expect(relogioDoJogo(partidaDeTeste({ periodo: 'INT', minuto: 45 }))).toEqual({ minuto: null, periodo: 'Intervalo' });
  });

  it('linha do tempo: quanto de cada tempo já passou', () => {
    expect(linhaDoTempo(partidaDeTeste())).toEqual({ primeiro: 100, segundo: 49, emAndamento: 2 });
    expect(linhaDoTempo(partidaDeTeste({ periodo: '1T', minuto: 30 }))).toEqual({ primeiro: 67, segundo: 0, emAndamento: 1 });
    expect(linhaDoTempo(partidaDeTeste({ periodo: 'INT', minuto: 45 }))).toEqual({ primeiro: 100, segundo: 0, emAndamento: null });
    expect(linhaDoTempo(partidaDeTeste({ periodo: '2T', minuto: 95 }))).toEqual({ primeiro: 100, segundo: 100, emAndamento: 2 });
    expect(linhaDoTempo(partidaDeTeste({ status: 'encerrada' }))).toEqual({ primeiro: 100, segundo: 100, emAndamento: null });
  });

  it('data do jogo no horário de Brasília', () => {
    expect(dataDoJogo(partidaDeTeste())).toBe('dom 11/10 · 17:30');
  });
});
