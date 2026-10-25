// Edge Function (Deno): POST /functions/v1/buscar-noticias. Chamada pelo pg_cron (cabeçalho x-segredo) e pelo
// back-office (token de quem é super admin ou editor). Publicada com verify_jwt desligado: a autorização é feita aqui.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buscarNoticias, type Baixado, type ClubeDaDescoberta } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const falhar = (onde: string, erro: { message: string } | null) => {
  if (erro) throw new Error(`${onde}: ${erro.message}`);
};

const MAX_BYTES = 3_000_000;

/** Lê o corpo até MAX_BYTES e corta a conexão depois disso (site de terceiro pode mandar um corpo sem fim). */
async function lerAte(resposta: Response) {
  if (!resposta.body) return '';
  const leitor = resposta.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    total += value.byteLength;
  }
  await leitor.cancel().catch(() => {});
  const tudo = new Uint8Array(Math.min(total, MAX_BYTES));
  let pos = 0;
  for (const p of partes) {
    const pedaco = p.subarray(0, tudo.length - pos);
    tudo.set(pedaco, pos);
    pos += pedaco.length;
  }
  return new TextDecoder().decode(tudo);
}

async function baixar(url: string, limite = 15_000): Promise<Baixado> {
  const resposta = await fetch(url, {
    headers: { 'User-Agent': 'TorcidaOnlineBot/1.0 (+https://torcidaonline.com.br)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(limite),
  });
  const texto = await lerAte(resposta);
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
    async contextoDaDescoberta(limite) {
      const { data, error } = await admin.rpc('contexto_da_descoberta', { p_limite: limite });
      falhar('contextoDaDescoberta', error);
      return data as { clubes: ClubeDaDescoberta[]; conhecidos: string[] };
    },
    async iniciarDescoberta(doCron) {
      const { data, error } = await admin.rpc('iniciar_descoberta', { p_do_cron: doCron });
      falhar('iniciarDescoberta', error);
      return data as boolean;
    },
    async registrarSugestoes(itens) {
      const { data, error } = await admin.rpc('registrar_fontes_sugeridas', { p_itens: itens });
      falhar('registrarSugestoes', error);
      return data as number;
    },
  }),
);
