// Página do jogo nos dois falsos (Vitest e Playwright): detalhes da BSD de Palmeiras x Corinthians e as regras do
// trigger mensagens_chat_antes_de_inserir (migration 20261017100000_pagina_do_jogo.sql).
import type { Detalhes, Jogador } from '../data/tiposDoJogo';
import type { Partida } from '../lib/database.types';

const j = (id: number, nome: string, numero: number, posicao: Jogador['posicao'], capitao = false): Jogador => ({ id, nome, numero, posicao, capitao });

/** Palmeiras 1 x 0 Corinthians no 2º tempo (partidaDeTeste): gol do Barboza, um amarelo e uma substituição. */
export function detalhesDeTeste(campos: Partial<Detalhes> = {}): Detalhes {
  return {
    estatisticas: {
      mandante: { posse: 58, finalizacoes: 11, no_gol: 5, escanteios: 7, faltas: 9, impedimentos: null, passes_certos: 86 },
      visitante: { posse: 42, finalizacoes: 6, no_gol: 2, escanteios: 3, faltas: 12, impedimentos: null, passes_certos: 74 },
    },
    lances: [
      { tipo: 'substituicao', minuto: '58', mandante: true, entrou: 'R. Sosa', saiu: 'V. Roque', entrou_id: 37, saiu_id: 33 },
      { tipo: 'cartao', minuto: '41', mandante: false, jogador: 'Raniele', jogador_id: 267, cor: 'amarelo' },
      { tipo: 'gol', minuto: '16', mandante: true, jogador: 'A. Barboza', jogador_id: 3876, assistencia: 'L. Evangelista', contra: false, penalti: false },
    ],
    escalacoes: {
      mandante: {
        formacao: '3-4-2-1',
        titulares: [
          j(24, 'C. Miguel', 1, 'G'),
          j(27, 'Murilo', 26, 'D'),
          j(26, 'G. Gómez', 15, 'D', true),
          j(3876, 'A. Barboza', 2, 'D'),
          j(3622, 'A. Giay', 4, 'M'),
          j(30, 'A. Pereira', 8, 'M'),
          j(4613, 'L. Evangelista', 30, 'M'),
          j(28, 'J. Piquerez', 22, 'M'),
          j(34, 'J. López', 42, 'F'),
          j(530, 'J. Arias', 11, 'F'),
          j(33, 'V. Roque', 9, 'F'),
        ],
        reservas: [j(37, 'R. Sosa', 19, 'F')],
      },
      visitante: {
        formacao: '4-1-3-2',
        titulares: [
          j(253, 'H. Souza', 1, 'G'),
          j(1144, 'Matheuzinho', 2, 'D'),
          j(5830, 'G. Paulista', 3, 'D'),
          j(256, 'G. Henrique', 13, 'D', true),
          j(257, 'M. Bidu', 21, 'D'),
          j(267, 'Raniele', 14, 'M'),
          j(260, 'B. Bidon', 7, 'M'),
          j(274, 'A. Carrillo', 19, 'M'),
          j(258, 'A. Luiz', 49, 'M'),
          j(1146, 'Y. Alberto', 9, 'F'),
          j(3940, 'M. Depay', 10, 'F'),
        ],
        reservas: [],
      },
    },
    // Nota TO de alguns jogadores do Palmeiras (o resto ficou sem nota).
    notas: { '3876': 8.1, '24': 6.9, '33': 7.2, '37': 6.5 },
    ...campos,
  };
}

export const SEM_DETALHES: Detalhes = { estatisticas: null, lances: [], escalacoes: null, notas: {} };

export type MensagemDeTeste = {
  id: number;
  partida_id: number;
  clube_id: number;
  autor_id: string;
  autor_apelido: string;
  autor_foto: string | null;
  texto: string;
  criado_em: string;
};

type Autor = { id: string; apelido: string | null; time_id: number | null; foto: string | null };

/** chat_aberto(): só com a bola rolando; o apito final fecha o chat. */
export const chatAbertoDeTeste = (p: Partida) => p.status === 'ao_vivo';

/** Mesmas regras do trigger: devolve a mensagem gravada ou o hint do erro. */
export function inserirMensagemDeTeste(
  mensagens: MensagemDeTeste[],
  autor: Autor | undefined,
  assinante: boolean,
  partida: Partida | undefined,
  texto: unknown,
): MensagemDeTeste | { hint: string; code: string } {
  const recusa = (hint: string) => ({ hint, code: 'P0001' });
  if (!autor?.apelido || !autor.time_id) return recusa('sem_perfil');
  if (!assinante) return recusa('so_membros');
  if (!partida || ![partida.mandante_id, partida.visitante_id].includes(autor.time_id)) return recusa('outro_clube');
  if (!chatAbertoDeTeste(partida)) return recusa('chat_fechado');
  const limpo = typeof texto === 'string' ? texto.trim() : '';
  if (!limpo || limpo.length > 280) return { hint: '', code: '23514' };
  const ultima = [...mensagens].reverse().find((m) => m.autor_id === autor.id);
  if (ultima && Date.now() - new Date(ultima.criado_em).getTime() < 2_000) return recusa('devagar');
  const mensagem: MensagemDeTeste = {
    id: (mensagens.at(-1)?.id ?? 0) + 1,
    partida_id: partida.id,
    clube_id: autor.time_id,
    autor_id: autor.id,
    autor_apelido: autor.apelido,
    autor_foto: autor.foto,
    texto: limpo,
    criado_em: new Date().toISOString(),
  };
  mensagens.push(mensagem);
  return mensagem;
}

// ---------- notas dos jogadores (migration 20261019100000_notas_dos_jogadores.sql) ----------

export type NotaDeTeste = { partida_id: number; jogador_id: number; usuario_id: string; clube_id: number; nota: number };

/** notas_abertas(): do apito final (encerrada_em, ou início + 115 min) até 1 h depois. */
export function notasAbertasDeTeste(p: Partida | undefined, agora = Date.now()) {
  if (!p || p.status !== 'encerrada') return false;
  const apito = p.encerrada_em ? new Date(p.encerrada_em).getTime() : new Date(p.inicio).getTime() + 115 * 60_000;
  return agora < apito + 60 * 60_000;
}

/** jogadores_que_jogaram(): titulares do lado e quem entrou. */
function jogaram(detalhes: Detalhes | undefined, mandante: boolean) {
  const lado = detalhes?.escalacoes?.[mandante ? 'mandante' : 'visitante'];
  const entraram = (detalhes?.lances ?? []).flatMap((l) => (l.tipo === 'substituicao' && l.mandante === mandante && l.entrou_id !== null ? [l.entrou_id] : []));
  return new Set([...(lado?.titulares ?? []).map((j) => j.id), ...entraram]);
}

/** enviar_notas(): mesmas regras e hints do banco. */
export function enviarNotasDeTeste(
  notas: NotaDeTeste[],
  autor: Autor | undefined,
  assinante: boolean,
  partida: Partida | undefined,
  detalhes: Detalhes | undefined,
  pedido: unknown,
): number | { hint: string; code: string } {
  const recusa = (hint: string) => ({ hint, code: 'P0001' });
  if (!autor?.time_id) return recusa('sem_perfil');
  if (!assinante) return recusa('so_membros');
  if (!partida || ![partida.mandante_id, partida.visitante_id].includes(autor.time_id)) return recusa('outro_clube');
  if (!notasAbertasDeTeste(partida)) return recusa('notas_fechadas');
  const validos = jogaram(detalhes, autor.time_id === partida.mandante_id);
  const itens = Array.isArray(pedido) ? (pedido as { jogador?: number; nota?: number }[]) : [];
  for (const i of itens) {
    if (!i.nota || i.nota < 1 || i.nota > 10) return recusa('nota_invalida');
    if (!i.jogador || !validos.has(i.jogador)) return recusa('jogador_invalido');
  }
  for (const i of itens) {
    const existente = notas.find((n) => n.partida_id === partida.id && n.jogador_id === i.jogador && n.usuario_id === autor.id);
    if (existente) existente.nota = i.nota!;
    else notas.push({ partida_id: partida.id, jogador_id: i.jogador!, usuario_id: autor.id, clube_id: autor.time_id, nota: i.nota! });
  }
  return itens.length;
}

/** notas_da_torcida(): média por jogador da torcida do meu clube, com a minha nota e quantos votaram. */
export function notasDaTorcidaDeTeste(notas: NotaDeTeste[], eu: Autor | undefined, assinante: boolean, partidaId: number) {
  if (!eu?.time_id || !assinante) return [];
  const daTorcida = notas.filter((n) => n.partida_id === partidaId && n.clube_id === eu.time_id);
  const votantes = new Set(daTorcida.map((n) => n.usuario_id)).size;
  const porJogador = new Map<number, NotaDeTeste[]>();
  for (const n of daTorcida) porJogador.set(n.jogador_id, [...(porJogador.get(n.jogador_id) ?? []), n]);
  return [...porJogador].map(([jogador_id, lista]) => ({
    jogador_id,
    media: Math.round((lista.reduce((s, n) => s + n.nota, 0) / lista.length) * 10) / 10,
    votos: lista.length,
    minha: lista.find((n) => n.usuario_id === eu.id)?.nota ?? null,
    votantes,
  }));
}
