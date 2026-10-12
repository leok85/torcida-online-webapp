// Exclusão da própria conta (exigência da Apple para apps que permitem criar conta).
// O pedido agenda a exclusão para daqui a 30 dias e tira a conta de todos os aparelhos; entrar de novo nesse
// prazo permite desistir. O pg_cron chama a mesma função uma vez por dia para apagar as contas vencidas.
// Fica separado do index.ts, que só existe no Deno, para os testes do Vitest chamarem direto.

/** O pedaço do cliente admin do Supabase que a função usa. */
export type ClienteAdmin = {
  auth: {
    getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
    admin: {
      deleteUser(id: string): Promise<{ error: unknown }>;
      signOut(jwt: string, scope: 'global'): Promise<{ error: unknown }>;
    };
  };
};

/** Prazo para desistir da exclusão. */
export const DIAS_PARA_DESISTIR = 30;

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, corpo: object) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export type Dependencias = {
  admin: ClienteAdmin;
  /** Encerra no Stripe a assinatura do web app, se houver, para não cobrar mais ninguém depois do pedido. */
  encerrarAssinaturas?: (usuarioId: string) => Promise<void>;
  /** Grava a data em que a conta será apagada (perfis.exclusao_agendada_para). */
  agendarExclusao: (usuarioId: string, data: Date) => Promise<void>;
  /** Contas com o prazo vencido. */
  contasVencidas: (agora: Date) => Promise<string[]>;
  /** Apaga os arquivos do torcedor no Storage (a foto), que não caem em cascata com a conta. */
  apagarArquivos?: (usuarioId: string) => Promise<void>;
  /** Segredo que o pg_cron manda no cabeçalho x-segredo para apagar as vencidas. */
  segredo: string | undefined;
  agora?: () => Date;
};

export async function excluirConta(req: Request, deps: Dependencias): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { erro: 'metodo_nao_permitido' });
  const agora = deps.agora?.() ?? new Date();

  if (req.headers.has('x-segredo')) {
    if (!deps.segredo || req.headers.get('x-segredo') !== deps.segredo) return json(401, { erro: 'nao_autorizado' });
    return apagarVencidas(deps, agora);
  }

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { erro: 'sem_sessao' });

  // Quem é excluído vem só do token validado pelo Supabase, nunca do corpo do pedido.
  const { data, error } = await deps.admin.auth.getUser(jwt);
  if (error || !data.user) return json(401, { erro: 'sem_sessao' });

  // A assinatura do web app é encerrada já no pedido; se isso falhar, nada é agendado (senão o cartão seguiria
  // sendo cobrado). As das lojas a pessoa cancela na App Store ou no Google Play.
  try {
    await deps.encerrarAssinaturas?.(data.user.id);
  } catch {
    return json(500, { erro: 'falha_ao_encerrar_assinatura' });
  }

  const excluiEm = new Date(agora.getTime() + DIAS_PARA_DESISTIR * 86_400_000);
  try {
    await deps.agendarExclusao(data.user.id, excluiEm);
  } catch {
    return json(500, { erro: 'falha_ao_excluir' });
  }

  // Tira a conta de todos os aparelhos. Se falhar, o agendamento já vale: não desfaz o pedido por isso.
  await deps.admin.auth.admin.signOut(jwt, 'global').catch(() => undefined);

  return json(200, { ok: true, exclui_em: excluiEm.toISOString() });
}

async function apagarVencidas(deps: Dependencias, agora: Date) {
  const ids = await deps.contasVencidas(agora);
  const falhas: string[] = [];
  // Perfil e assinaturas caem em cascata no banco; a foto fica no Storage e sai antes.
  for (const id of ids) {
    try {
      await deps.apagarArquivos?.(id);
      const { error } = await deps.admin.auth.admin.deleteUser(id);
      if (error) throw error;
    } catch {
      falhas.push(id);
    }
  }
  return json(falhas.length ? 500 : 200, { excluidas: ids.length - falhas.length, falhas: falhas.length });
}
