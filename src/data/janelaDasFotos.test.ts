import { describe, expect, it } from 'vitest';
import { partidaDeTeste } from '../test/catalogoDeTeste';
import { fimDasFotos, janelaDaFoto, joinhasAbertos } from './janelaDasFotos';
import { problemaDoArquivo, tamanhoReduzido } from './fotos';

// Palmeiras x Corinthians: início 11/10 20:30Z.
const marcada = partidaDeTeste({ status: 'agendada', periodo: null, minuto: null });
const encerrada = partidaDeTeste({ status: 'encerrada', periodo: null, minuto: null, encerrada_em: '2026-10-11T22:25:00Z' });

describe('janelas das fotos', () => {
  it('pré-jogo: de 1 h antes até o início; antes disso, fechado', () => {
    expect(janelaDaFoto(marcada, new Date('2026-10-11T19:29:00Z'))).toBeNull();
    expect(janelaDaFoto(marcada, new Date('2026-10-11T19:30:00Z'))).toBe('pre');
    // Passou da hora e a sincronização ainda não marcou ao vivo: já é "durante".
    expect(janelaDaFoto(marcada, new Date('2026-10-11T20:31:00Z'))).toBe('durante');
  });

  it('durante: com a bola rolando', () => {
    expect(janelaDaFoto(partidaDeTeste(), new Date('2030-01-01T00:00:00Z'))).toBe('durante');
  });

  it('pós-jogo: até 1 h depois do apito; sem a hora do apito, o fim estimado', () => {
    expect(janelaDaFoto(encerrada, new Date('2026-10-11T23:24:00Z'))).toBe('pos');
    expect(janelaDaFoto(encerrada, new Date('2026-10-11T23:26:00Z'))).toBeNull();
    expect(fimDasFotos({ ...encerrada, encerrada_em: null }).toISOString()).toBe('2026-10-11T23:25:00.000Z');
  });

  it('joinhas: abertos até a última janela fechar', () => {
    expect(joinhasAbertos(marcada, new Date('2026-10-01T00:00:00Z'))).toBe(true);
    expect(joinhasAbertos(encerrada, new Date('2026-10-11T23:24:00Z'))).toBe(true);
    expect(joinhasAbertos(encerrada, new Date('2026-10-12T00:00:00Z'))).toBe(false);
  });
});

describe('arquivo da foto', () => {
  it('aceita JPG e PNG até 10 MB', () => {
    expect(problemaDoArquivo({ type: 'image/jpeg', size: 3_000_000 })).toBeNull();
    expect(problemaDoArquivo({ type: 'image/gif', size: 1000 })).toBe('Use uma imagem JPG ou PNG.');
    expect(problemaDoArquivo({ type: 'image/png', size: 11 * 1024 * 1024 })).toBe('A imagem passa de 10 MB. Escolha uma menor.');
  });

  it('reduz o lado maior para até 1600 px, mantendo a proporção', () => {
    expect(tamanhoReduzido(4032, 3024)).toEqual({ largura: 1600, altura: 1200 });
    expect(tamanhoReduzido(1080, 1920)).toEqual({ largura: 900, altura: 1600 });
    expect(tamanhoReduzido(800, 600)).toEqual({ largura: 800, altura: 600 });
  });
});
