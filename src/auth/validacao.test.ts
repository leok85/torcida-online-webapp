import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { perfilDeTeste, supabaseFalso } from '../test/supabaseFalso';
import { emailValido, forcaDaSenha, useApelido } from './validacao';

describe('forcaDaSenha', () => {
  it.each([
    ['', 0, ''],
    ['abc', 1, 'curta'],
    ['abcdefgh', 1, 'fraca'],
    ['abcdefg1', 2, 'média'],
    ['Abcdefg1', 3, 'boa'],
    ['Abcdefg1!', 4, 'forte'],
    ['abcdefghijk1', 3, 'boa'],
  ])('"%s" tem nível %i (%s)', (senha, nivel, rotulo) => {
    expect(forcaDaSenha(senha)).toMatchObject({ nivel, rotulo });
  });
});

describe('emailValido', () => {
  it.each(['torcedor@example.com', 'a.b+tag@sub.dominio.com.br'])('aceita %s', (email) => {
    expect(emailValido(email)).toBe(true);
  });

  it.each(['', 'torcedor', 'torcedor@', 'torcedor@dominio', 'com espaço@example.com'])('recusa "%s"', (email) => {
    expect(emailValido(email)).toBe(false);
  });
});

describe('useApelido', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function apelido(valor: string) {
    const hook = renderHook(() => useApelido(valor));
    await act(() => vi.advanceTimersByTimeAsync(400));
    return hook.result.current;
  }

  it('fica vazio sem consultar o servidor', async () => {
    expect(await apelido('  ')).toMatchObject({ status: 'vazio', erro: null, ok: false });
    expect(supabaseFalso.cliente.rpc).not.toHaveBeenCalled();
  });

  it.each(['ab', 'com espaço', 'acentuação', 'a'.repeat(21)])('recusa o formato de "%s" sem consultar', async (valor) => {
    expect(await apelido(valor)).toMatchObject({ status: 'invalido', ok: false });
    expect(supabaseFalso.cliente.rpc).not.toHaveBeenCalled();
  });

  it('libera apelido disponível e manda o valor sem espaços nas pontas', async () => {
    expect(await apelido(' Novo.Torcedor_1 ')).toMatchObject({ status: 'livre', ok: true, limpo: 'Novo.Torcedor_1' });
    expect(supabaseFalso.cliente.rpc).toHaveBeenCalledWith('apelido_disponivel', { apelido: 'Novo.Torcedor_1' });
  });

  it('acusa apelido já usado por outra pessoa, sem diferenciar maiúsculas', async () => {
    supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'outro', apelido: 'Rafa_9' }));
    expect(await apelido('RAFA_9')).toMatchObject({ status: 'em-uso', erro: 'Esse apelido já está em uso.', ok: false });
  });

  it('avisa quando não dá para consultar', async () => {
    supabaseFalso.cliente.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    expect(await apelido('Torcedor')).toMatchObject({ status: 'sem-conexao', ok: false });
  });

  it('só consulta depois que o torcedor para de digitar', async () => {
    const { rerender, result } = renderHook(({ valor }) => useApelido(valor), { initialProps: { valor: 'Tor' } });
    rerender({ valor: 'Torc' });
    rerender({ valor: 'Torcedor' });
    expect(result.current.status).toBe('verificando');
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(supabaseFalso.cliente.rpc).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('livre');
  });
});
