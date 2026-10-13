// Edge Function (Deno): POST /functions/v1/detalhes-da-partida { partida }. As regras estão em handler.ts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { detalhesDaPartida, type Bsd, type DetalhesSalvos, type EscalacoesBsd, type EstatisticasBsd, type IncidenteBsd } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const chave = Deno.env.get('BSD_API_KEY');

async function pedir<T>(caminho: string): Promise<T> {
  const resposta = await fetch(`https://sports.bzzoiro.com${caminho}`, { headers: { Authorization: `Token ${chave}` } });
  if (!resposta.ok) throw new Error(`BSD ${resposta.status} em ${caminho}`);
  return resposta.json();
}

const bsd: Bsd | null = chave
  ? {
      estatisticas: (id) => pedir<EstatisticasBsd>(`/api/v2/events/${id}/stats/`),
      incidentes: async (id) => (await pedir<{ incidents?: IncidenteBsd[] }>(`/api/v2/events/${id}/incidents/`)).incidents ?? [],
      escalacoes: (id) => pedir<EscalacoesBsd>(`/api/v2/events/${id}/lineups/`),
    }
  : null;

const falhar = (onde: string, erro: { message: string } | null) => {
  if (erro) throw new Error(`${onde}: ${erro.message}`);
};

Deno.serve((req) =>
  detalhesDaPartida(req, {
    async usuarioDoToken(jwt) {
      const { data } = await admin.auth.getUser(jwt);
      return data.user ? { id: data.user.id } : null;
    },
    async partida(id) {
      const { data, error } = await admin.from('partidas').select('id, status, inicio').eq('id', id).maybeSingle();
      falhar('partida', error);
      return data;
    },
    async detalhes(id) {
      const { data, error } = await admin.from('detalhes_partidas').select('estatisticas, lances, escalacoes, final').eq('partida_id', id).maybeSingle();
      falhar('detalhes', error);
      return data as DetalhesSalvos | null;
    },
    async reservar(id, segundos) {
      const { data, error } = await admin.rpc('reservar_detalhes', { p_partida: id, p_segundos: segundos });
      falhar('reservar', error);
      return data === true;
    },
    async salvar(id, detalhes, final) {
      const { error } = await admin
        .from('detalhes_partidas')
        .update({ ...detalhes, final, atualizado_em: new Date().toISOString() })
        .eq('partida_id', id);
      falhar('salvar', error);
    },
    bsd,
  }),
);
