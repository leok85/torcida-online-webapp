import { describe, expect, it } from 'vitest';
import { supabaseFalso } from '../test/supabaseFalso';
import { buscarRegras, quandoFoi, tempoRestante, xpEmTexto } from './xp';

describe('textos do XP', () => {
  it('número com ponto de milhar', () => {
    expect(xpEmTexto(5910)).toBe('5.910');
    expect(xpEmTexto(20)).toBe('20');
  });

  it('quando foi, em dias de Brasília', () => {
    const agora = new Date('2026-10-14T15:00:00Z'); // qua 12:00 em Brasília
    expect(quandoFoi('2026-10-14T14:11:00Z', agora)).toBe('hoje 11:11');
    // 01:30 UTC de quarta ainda é terça em Brasília.
    expect(quandoFoi('2026-10-14T01:30:00Z', agora)).toBe('ontem 22:30');
    expect(quandoFoi('2026-10-11T20:00:00Z', agora)).toBe('3 d atrás');
  });

  it('tempo restante até a virada da semana', () => {
    const agora = new Date('2026-10-14T15:00:00Z');
    expect(tempoRestante(new Date('2026-10-19T03:00:00Z'), agora)).toBe('4 d 12 h restantes');
    expect(tempoRestante(new Date('2026-10-14T20:30:00Z'), agora)).toBe('5 h restantes');
  });
});

describe('regras de XP', () => {
  it('lê o XP e o limite que a equipe configurou', async () => {
    const foto = supabaseFalso.xp().regras.find((r) => r.acao === 'foto_enviada')!;
    foto.xp = 45;
    foto.limite = 2;
    const regras = await buscarRegras();
    expect(regras.foto_enviada).toBe(45);
    expect(regras.limites.foto_enviada).toBe(2);
    expect(regras.palpite_exato).toBe(240);
  });

  it('regra sem limite tira o limite padrão', async () => {
    const chat = supabaseFalso.xp().regras.find((r) => r.acao === 'mensagem_chat')!;
    chat.limite = null;
    chat.limite_por = null;
    expect((await buscarRegras()).limites.mensagem_chat).toBeUndefined();
  });
});
