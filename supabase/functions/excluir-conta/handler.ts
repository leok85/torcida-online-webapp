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

/** Encerra no Stripe a assinatura do web app, se houver, para não cobrar mais ninguém depois da exclusão. */
export type EncerrarAssinaturas = (usuarioId: string) => Promise<void>;

export async function excluirConta(req: Request, admin: ClienteAdmin, encerrarAssinaturas?: EncerrarAssinaturas): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { erro: 'metodo_nao_permitido' });

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { erro: 'sem_sessao' });

  // Quem é excluído vem só do token validado pelo Supabase, nunca do corpo do pedido.
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return json(401, { erro: 'sem_sessao' });

  // Perfil e assinaturas caem em cascata no banco. A do web app é encerrada antes no Stripe; se isso falhar,
  // a conta não é apagada (senão o cartão seguiria sendo cobrado). As das lojas a pessoa cancela na App Store
  // ou no Google Play.
  try {
    await encerrarAssinaturas?.(data.user.id);
  } catch {
    return json(500, { erro: 'falha_ao_encerrar_assinatura' });
  }

  const { error: erroExclusao } = await admin.auth.admin.deleteUser(data.user.id);
  if (erroExclusao) return json(500, { erro: 'falha_ao_excluir' });

  return json(200, { ok: true });
}
