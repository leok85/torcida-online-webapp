// Elencos dos dois times de um jogo para a escalação e o palpite (W03). Busca na BSD (/api/v2/teams/{id}/squad/)
// só quando o cache (tabela elencos) passou de 12 h; reservar_elenco() garante um pedido por prazo.
// Fica separado do index.ts, que só existe no Deno, para os testes do Vitest chamarem direto.
import { CORS, json, jwtDe, lerCorpo } from '../_compartilhado/http.ts';

/** Jogador em /api/v2/teams/{id}/squad/. */
export type JogadorDoElencoBsd = {
  id: number;
  name: string;
  short_name?: string | null;
  position?: string | null;
  jersey_number?: number | null;
  availability?: string | null;
  injury_type?: string | null;
  injury_expected_return?: string | null;
};
export type ElencoBsd = { players?: JogadorDoElencoBsd[] | null };

export type Bsd = { elenco(clube: number): Promise<ElencoBsd> };

/** Formato salvo e devolvido (o mesmo que o web app lê em src/data/palpite.ts). */
export type JogadorDoElenco = {
  id: number;
  nome: string;
  numero: number | null;
  posicao: 'G' | 'D' | 'M' | 'F' | null;
  /** available, injured, doubtful ou suspended. */
  disponibilidade: string;
  motivo: string;
  volta: string | null;
};
export type Elencos = { mandante: JogadorDoElenco[]; visitante: JogadorDoElenco[] };

export type PartidaResumo = { id: number; mandante_id: number; visitante_id: number };
export type ElencoSalvo = { jogadores: JogadorDoElenco[]; atualizado_em: string };

export type Dependencias = {
  usuarioDoToken(jwt: string): Promise<{ id: string } | null>;
  partida(id: number): Promise<PartidaResumo | null>;
  elenco(clube: number): Promise<ElencoSalvo | null>;
  /** true se este pedido ganhou a vez de buscar na BSD (reservar_elenco). */
  reservar(clube: number, segundos: number): Promise<boolean>;
  salvar(clube: number, jogadores: JogadorDoElenco[]): Promise<void>;
  bsd: Bsd | null;
};

/** O elenco vale por 12 h. */
export const PRAZO_DO_ELENCO_S = 12 * 60 * 60;

const POSICOES = ['G', 'D', 'M', 'F'];
const ORDEM: Record<string, number> = { G: 0, D: 1, M: 2, F: 3 };

/** Elenco da BSD no formato salvo: por posição e número da camisa. */
export function elencoDe(bsd: ElencoBsd): JogadorDoElenco[] {
  return (bsd.players ?? [])
    .filter((j) => Number.isInteger(j.id) && j.name)
    .map((j) => ({
      id: j.id,
      nome: j.short_name || j.name,
      numero: j.jersey_number ?? null,
      posicao: j.position && POSICOES.includes(j.position) ? (j.position as JogadorDoElenco['posicao']) : null,
      disponibilidade: j.availability || 'available',
      motivo: j.injury_type ?? '',
      volta: j.injury_expected_return ?? null,
    }))
    .sort((a, b) => (ORDEM[a.posicao ?? ''] ?? 9) - (ORDEM[b.posicao ?? ''] ?? 9) || (a.numero ?? 999) - (b.numero ?? 999));
}

async function elencoDoClube(clube: number, deps: Dependencias): Promise<JogadorDoElenco[]> {
  const salvo = await deps.elenco(clube);
  if (!deps.bsd || !(await deps.reservar(clube, PRAZO_DO_ELENCO_S))) return salvo?.jogadores ?? [];
  try {
    const jogadores = elencoDe(await deps.bsd.elenco(clube));
    // Uma resposta vazia não apaga o elenco que já tínhamos.
    if (!jogadores.length) return salvo?.jogadores ?? [];
    await deps.salvar(clube, jogadores);
    return jogadores;
  } catch {
    return salvo?.jogadores ?? [];
  }
}

export async function elencoDaPartida(req: Request, deps: Dependencias): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { erro: 'metodo_nao_permitido' });

  const jwt = jwtDe(req);
  if (!jwt || !(await deps.usuarioDoToken(jwt))) return json(401, { erro: 'sem_sessao' });

  const { partida: id } = await lerCorpo(req);
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return json(400, { erro: 'partida_invalida' });
  const partida = await deps.partida(id);
  if (!partida) return json(404, { erro: 'partida_nao_encontrada' });

  const [mandante, visitante] = await Promise.all([elencoDoClube(partida.mandante_id, deps), elencoDoClube(partida.visitante_id, deps)]);
  return json(200, { mandante, visitante } satisfies Elencos);
}
