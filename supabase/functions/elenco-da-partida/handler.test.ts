import { describe, expect, it, vi } from 'vitest';
import { elencoDaPartida, elencoDe, type Dependencias, type ElencoBsd, type JogadorDoElenco } from './handler';

// Trechos reais do elenco do Palmeiras (BSD, time 162).
const PALMEIRAS: ElencoBsd = {
  players: [
    { id: 33, name: 'Vitor Roque', short_name: 'V. Roque', position: 'F', jersey_number: 9, availability: 'available', injury_type: '', injury_expected_return: null },
    { id: 3622, name: 'Agustín Giay', short_name: 'A. Giay', position: 'D', jersey_number: 4, availability: 'suspended', injury_type: 'yellow_card_accumulation_suspension', injury_expected_return: '2026-10-18' },
    { id: 24, name: 'Carlos Miguel', short_name: 'C. Miguel', position: 'G', jersey_number: 1, availability: 'available', injury_type: '', injury_expected_return: null },
    { id: 3624, name: 'Felipe Anderson', short_name: 'F. Anderson', position: 'M', jersey_number: 7, availability: 'available' },
  ],
};

const corinthians: JogadorDoElenco[] = [{ id: 256, nome: 'G. Henrique', numero: 13, posicao: 'D', disponibilidade: 'available', motivo: '', volta: null }];

function deps(extra: Partial<Dependencias> = {}): Dependencias {
  return {
    usuarioDoToken: async (jwt) => (jwt === 'jwt-ok' ? { id: 'usuario-1' } : null),
    partida: async (id) => (id === 7290 ? { id, mandante_id: 162, visitante_id: 167 } : null),
    elenco: async (clube) => (clube === 167 ? { jogadores: corinthians, atualizado_em: '2026-10-13T10:00:00Z' } : null),
    reservar: vi.fn(async (clube: number) => clube === 162),
    salvar: vi.fn(async () => {}),
    bsd: { elenco: vi.fn(async () => PALMEIRAS) },
    ...extra,
  };
}

const pedido = (corpo: object, jwt = 'jwt-ok') =>
  new Request('https://x/functions/v1/elenco-da-partida', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify(corpo) });

describe('elenco da BSD', () => {
  it('ordena por posição e número, com o nome curto e a disponibilidade', () => {
    expect(elencoDe(PALMEIRAS)).toEqual([
      { id: 24, nome: 'C. Miguel', numero: 1, posicao: 'G', disponibilidade: 'available', motivo: '', volta: null },
      { id: 3622, nome: 'A. Giay', numero: 4, posicao: 'D', disponibilidade: 'suspended', motivo: 'yellow_card_accumulation_suspension', volta: '2026-10-18' },
      { id: 3624, nome: 'F. Anderson', numero: 7, posicao: 'M', disponibilidade: 'available', motivo: '', volta: null },
      { id: 33, nome: 'V. Roque', numero: 9, posicao: 'F', disponibilidade: 'available', motivo: '', volta: null },
    ]);
    expect(elencoDe({})).toEqual([]);
  });
});

describe('elenco-da-partida', () => {
  it('pede sessão e um jogo que existe', async () => {
    expect((await elencoDaPartida(pedido({ partida: 7290 }, 'outro'), deps())).status).toBe(401);
    expect((await elencoDaPartida(pedido({ partida: 'x' }), deps())).status).toBe(400);
    expect((await elencoDaPartida(pedido({ partida: 1 }), deps())).status).toBe(404);
  });

  it('busca na BSD quando o cache venceu e devolve o salvo quando ainda vale', async () => {
    const d = deps();
    const r = await elencoDaPartida(pedido({ partida: 7290 }), d);
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.mandante.map((j: JogadorDoElenco) => j.nome)).toEqual(['C. Miguel', 'A. Giay', 'F. Anderson', 'V. Roque']);
    expect(corpo.visitante).toEqual(corinthians);
    expect(d.bsd!.elenco).toHaveBeenCalledTimes(1);
    expect(d.bsd!.elenco).toHaveBeenCalledWith(162);
    expect(d.salvar).toHaveBeenCalledWith(162, corpo.mandante);
  });

  it('se a BSD falha ou vem vazia, fica com o elenco salvo', async () => {
    const falha = deps({ bsd: { elenco: async () => Promise.reject(new Error('BSD 500')) }, reservar: async () => true });
    expect((await (await elencoDaPartida(pedido({ partida: 7290 }), falha)).json()).visitante).toEqual(corinthians);
    const vazia = deps({ bsd: { elenco: async () => ({ players: [] }) }, reservar: async () => true });
    const corpo = await (await elencoDaPartida(pedido({ partida: 7290 }), vazia)).json();
    expect(corpo).toEqual({ mandante: [], visitante: corinthians });
    expect(vazia.salvar).not.toHaveBeenCalled();
  });
});
