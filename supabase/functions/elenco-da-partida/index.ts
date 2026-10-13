// Edge Function (Deno): POST /functions/v1/elenco-da-partida { partida }. As regras estão em handler.ts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { elencoDaPartida, type Bsd, type ElencoBsd, type ElencoSalvo } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const chave = Deno.env.get('BSD_API_KEY');

const bsd: Bsd | null = chave
  ? {
      async elenco(clube) {
        const resposta = await fetch(`https://sports.bzzoiro.com/api/v2/teams/${clube}/squad/`, { headers: { Authorization: `Token ${chave}` } });
        if (!resposta.ok) throw new Error(`BSD ${resposta.status} no elenco ${clube}`);
        return (await resposta.json()) as ElencoBsd;
      },
    }
  : null;

const falhar = (onde: string, erro: { message: string } | null) => {
  if (erro) throw new Error(`${onde}: ${erro.message}`);
};

Deno.serve((req) =>
  elencoDaPartida(req, {
    async usuarioDoToken(jwt) {
      const { data } = await admin.auth.getUser(jwt);
      return data.user ? { id: data.user.id } : null;
    },
    async partida(id) {
      const { data, error } = await admin.from('partidas').select('id, mandante_id, visitante_id').eq('id', id).maybeSingle();
      falhar('partida', error);
      return data;
    },
    async elenco(clube) {
      const { data, error } = await admin.from('elencos').select('jogadores, atualizado_em').eq('clube_id', clube).maybeSingle();
      falhar('elenco', error);
      return data as ElencoSalvo | null;
    },
    async reservar(clube, segundos) {
      const { data, error } = await admin.rpc('reservar_elenco', { p_clube: clube, p_segundos: segundos });
      falhar('reservar', error);
      return data === true;
    },
    async salvar(clube, jogadores) {
      const { error } = await admin.from('elencos').update({ jogadores, atualizado_em: new Date().toISOString() }).eq('clube_id', clube);
      falhar('salvar', error);
    },
    bsd,
  }),
);
