// Edge Function (Deno): POST /functions/v1/buscar-noticias. Chamada pelo pg_cron (cabeçalho x-segredo) e pelo
// back-office (token de quem é super admin ou editor). Publicada com verify_jwt desligado: a autorização é feita aqui.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buscarNoticias, type Baixado } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const falhar = (onde: string, erro: { message: string } | null) => {
  if (erro) throw new Error(`${onde}: ${erro.message}`);
};

async function baixar(url: string): Promise<Baixado> {
  const resposta = await fetch(url, {
    headers: { 'User-Agent': 'TorcidaOnlineBot/1.0 (+https://torcidaonline.com.br)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  const texto = (await resposta.text()).slice(0, 3_000_000);
  return { status: resposta.status, tipo: resposta.headers.get('content-type') ?? '', texto, url: resposta.url || url };
}

Deno.serve((req) =>
  buscarNoticias(req, {
    segredo: Deno.env.get('BUSCAR_NOTICIAS_SEGREDO'),
    baixar,
    async papelDoToken(jwt) {
      const { data } = await admin.auth.getUser(jwt);
      if (!data.user) return null;
      const { data: membro } = await admin.from('equipe').select('papel').eq('usuario_id', data.user.id).maybeSingle();
      return membro?.papel ?? null;
    },
    async fontesAtivas() {
      const { data, error } = await admin.from('noticias_fontes').select('id, url, nome').eq('ativa', true);
      falhar('fontesAtivas', error);
      return data!;
    },
    async fonte(id) {
      const { data, error } = await admin.from('noticias_fontes').select('id, url, nome').eq('id', id).maybeSingle();
      falhar('fonte', error);
      return data;
    },
    async registrar(fonte, itens) {
      const { data, error } = await admin.rpc('registrar_noticias_da_fonte', { p_fonte: fonte, p_itens: itens });
      falhar('registrar', error);
      return data as number;
    },
    async registrarErro(fonte, erro) {
      const { error } = await admin.rpc('registrar_erro_da_fonte', { p_fonte: fonte, p_erro: erro });
      falhar('registrarErro', error);
    },
  }),
);
