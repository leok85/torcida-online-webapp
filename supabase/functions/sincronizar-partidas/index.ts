// Edge Function (Deno): POST /functions/v1/sincronizar-partidas, chamada pelo pg_cron com o cabeçalho x-segredo.
// Publicada com verify_jwt desligado: quem autoriza é o segredo, não um usuário.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sincronizar, type Banco, type Bsd, type ClassificacaoBsd, type EventoBsd, type IncidenteBsd, type PartidaSalva } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BSD = 'https://sports.bzzoiro.com';
const chave = Deno.env.get('BSD_API_KEY');

async function pedir<T>(caminho: string): Promise<T> {
  const resposta = await fetch(caminho.startsWith('http') ? caminho : `${BSD}${caminho}`, { headers: { Authorization: `Token ${chave}` } });
  if (!resposta.ok) throw new Error(`BSD ${resposta.status} em ${caminho}`);
  return resposta.json();
}

/** Junta as páginas de uma lista da BSD ({ results, next }), com um teto para não gastar a cota. */
async function todasAsPaginas(caminho: string, maxPaginas = 20): Promise<EventoBsd[]> {
  const eventos: EventoBsd[] = [];
  let proxima: string | null = caminho;
  for (let i = 0; proxima && i < maxPaginas; i++) {
    const pagina: { results?: EventoBsd[]; events?: EventoBsd[]; next?: string | null } = await pedir(proxima);
    eventos.push(...(pagina.results ?? pagina.events ?? []));
    proxima = pagina.next ?? null;
  }
  return eventos;
}

const bsd: Bsd | null = chave
  ? {
      aoVivo: () => todasAsPaginas('/api/v2/events/live/?limit=200'),
      eventos: (de, ate) => todasAsPaginas(`/api/v2/events/?date_from=${de}&date_to=${ate}&limit=200`),
      evento: (id) => pedir<EventoBsd>(`/api/v2/events/${id}/`).catch(() => null),
      incidentes: async (id) => (await pedir<{ incidents?: IncidenteBsd[] }>(`/api/v2/events/${id}/incidents/`)).incidents ?? [],
      nomeDaLiga: async (id) => (await pedir<{ name?: string }>(`/api/v2/leagues/${id}/`)).name ?? null,
      classificacao: (id) => pedir<ClassificacaoBsd>(`/api/v2/leagues/${id}/standings/`),
    }
  : null;

const falhar = (onde: string, erro: { message: string } | null) => {
  if (erro) throw new Error(`${onde}: ${erro.message}`);
};

const banco: Banco = {
  async catalogo() {
    const [clubes, ligas] = await Promise.all([admin.from('clubes').select('id, nome'), admin.from('ligas').select('id, nome')]);
    falhar('catalogo', clubes.error ?? ligas.error);
    return {
      clubes: new Map(clubes.data!.map((c) => [c.id, c.nome])),
      ligas: new Map(ligas.data!.map((l) => [l.id, l.nome])),
    };
  },
  async partidas(ids) {
    if (!ids.length) return new Map();
    const { data, error } = await admin.from('partidas').select('id, liga_nome, gols_mandante, gols_visitante, gols').in('id', ids);
    falhar('partidas', error);
    return new Map(data!.map(({ id, ...resto }) => [id, resto as PartidaSalva]));
  },
  async idsAoVivo() {
    const { data, error } = await admin.from('partidas').select('id').eq('status', 'ao_vivo');
    falhar('idsAoVivo', error);
    return data!.map((p) => p.id);
  },
  async haJogoNaJanela(de, ate) {
    const { count, error } = await admin
      .from('partidas')
      .select('id', { count: 'exact', head: true })
      .or(`status.eq.ao_vivo,and(status.eq.agendada,inicio.gte.${de.toISOString()},inicio.lte.${ate.toISOString()})`);
    falhar('haJogoNaJanela', error);
    return (count ?? 0) > 0;
  },
  async ligasComJogoDesde(desde) {
    const { data, error } = await admin
      .from('partidas')
      .select('liga_id')
      .in('status', ['ao_vivo', 'encerrada'])
      .gte('inicio', desde.toISOString())
      .not('liga_id', 'is', null);
    falhar('ligasComJogoDesde', error);
    return [...new Set(data!.map((p) => p.liga_id as number))];
  },
  async salvarClassificacao(ligaId, linhas) {
    const apagar = await admin.from('classificacao').delete().eq('liga_id', ligaId);
    falhar('salvarClassificacao (apagar)', apagar.error);
    const { error } = await admin.from('classificacao').insert(linhas);
    falhar('salvarClassificacao', error);
  },
  async salvar(partidas) {
    const { error } = await admin.from('partidas').upsert(partidas);
    falhar('salvar', error);
  },
};

Deno.serve((req) => sincronizar(req, { bsd, banco, segredo: Deno.env.get('SINCRONIZAR_PARTIDAS_SEGREDO') }));
