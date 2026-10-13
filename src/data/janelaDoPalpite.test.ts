import { describe, expect, it } from 'vitest';
import { partidaDeTeste } from '../test/catalogoDeTeste';
import { jogoDoPalpite, situacaoDoPalpite } from './janelaDoPalpite';

const marcada = (id: number, inicio: string) => partidaDeTeste({ id, inicio, status: 'agendada', periodo: null, minuto: null, gols_mandante: null, gols_visitante: null });
// Palmeiras x Flamengo, quarta 21:30 (Brasília).
const jogo = marcada(7301, '2026-10-15T00:30:00Z');

describe('janela do palpite', () => {
  it('aberto até 15 min antes do início; depois, fechado', () => {
    expect(situacaoDoPalpite(jogo, [jogo], new Date('2026-10-15T00:14:59Z'))).toBe('aberto');
    expect(situacaoDoPalpite(jogo, [jogo], new Date('2026-10-15T00:15:00Z'))).toBe('fechado');
  });

  it('jogo ao vivo ou encerrado: fechado', () => {
    const cedo = new Date('2026-10-10T12:00:00Z');
    expect(situacaoDoPalpite({ ...jogo, status: 'ao_vivo' }, [], cedo)).toBe('fechado');
    expect(situacaoDoPalpite({ ...jogo, status: 'encerrada' }, [], cedo)).toBe('fechado');
  });

  it('só abre quando o jogo anterior do clube termina; um marcado parado há mais de 3 h não segura', () => {
    const agora = new Date('2026-10-11T21:00:00Z');
    const aoVivo = partidaDeTeste(); // 11/10 20:30Z, ao vivo
    expect(situacaoDoPalpite(jogo, [aoVivo, jogo], agora)).toBe('nao_abriu');
    expect(situacaoDoPalpite(jogo, [{ ...aoVivo, status: 'encerrada' }, jogo], agora)).toBe('aberto');
    const parado = marcada(7200, '2026-10-11T12:00:00Z');
    expect(situacaoDoPalpite(jogo, [parado, jogo], agora)).toBe('aberto');
    expect(situacaoDoPalpite(jogo, [parado, jogo], new Date('2026-10-11T14:00:00Z'))).toBe('nao_abriu');
  });

  it('o jogo da vez é o próximo marcado que não passou da janela', () => {
    const depois = marcada(7310, '2026-10-18T19:00:00Z');
    expect(jogoDoPalpite([partidaDeTeste({ status: 'encerrada' }), jogo, depois], new Date('2026-10-13T12:00:00Z'))?.id).toBe(7301);
    expect(jogoDoPalpite([jogo, depois], new Date('2026-10-15T04:00:00Z'))?.id).toBe(7310);
    expect(jogoDoPalpite([], new Date())).toBeNull();
  });
});
