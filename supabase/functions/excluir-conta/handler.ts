// Exclusão da própria conta (exigência da Apple para apps que permitem criar conta).
// Fica separado do index.ts, que só existe no Deno, para os testes do Vitest chamarem direto.

/** O pedaço do cliente admin do Supabase que a função usa. */
export type ClienteAdmin = {
  auth: {
    getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
    admin: { deleteUser(id: string): Promise<{ error: unknown }> };
  };
};

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, corpo: object) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function excluirConta(req: Request, admin: ClienteAdmin): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { erro: 'metodo_nao_permitido' });

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { erro: 'sem_sessao' });

  // Quem é excluído vem só do token validado pelo Supabase, nunca do corpo do pedido.
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return json(401, { erro: 'sem_sessao' });

  // Perfil e assinaturas caem em cascata. Assinatura do web app ainda ativa no Stripe precisa ser cancelada
  // aqui quando o pagamento existir; as das lojas a pessoa cancela na App Store ou no Google Play.
  const { error: erroExclusao } = await admin.auth.admin.deleteUser(data.user.id);
  if (erroExclusao) return json(500, { erro: 'falha_ao_excluir' });

  return json(200, { ok: true });
}
