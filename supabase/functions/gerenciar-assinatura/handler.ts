// Ações do torcedor sobre a própria assinatura do web app: cancelar no fim do período, desfazer o
// cancelamento e abrir o Portal do Cliente do Stripe (cartão e faturas).
import { sincronizarAssinatura, type Banco, type Pagamentos } from '../_compartilhado/assinatura.ts';
import { CORS, json, jwtDe, lerCorpo, origemDoApp } from '../_compartilhado/http.ts';

export async function gerenciarAssinatura(req: Request, banco: Banco, pagamentos: Pagamentos): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { erro: 'metodo_nao_permitido' });

  const jwt = jwtDe(req);
  const usuario = jwt ? await banco.usuarioDoToken(jwt) : null;
  if (!usuario) return json(401, { erro: 'sem_sessao' });

  const { acao } = await lerCorpo(req);

  if (acao === 'portal') {
    const customer = await banco.clienteDo(usuario.id);
    if (!customer) return json(404, { erro: 'sem_assinatura_web' });
    return json(200, { url: await pagamentos.criarPortal(customer, `${origemDoApp(req)}/conta/assinatura`) });
  }

  if (acao !== 'cancelar' && acao !== 'reativar') return json(400, { erro: 'acao_invalida' });

  // Só mexe na assinatura do próprio torcedor, achada pelo banco e nunca por um id vindo do pedido.
  const assinatura = await banco.assinaturaWebEmAndamento(usuario.id);
  if (!assinatura || assinatura.status === 'pendente') return json(404, { erro: 'sem_assinatura_web' });

  await pagamentos.cancelarNoFimDoPeriodo(assinatura.id_externo, acao === 'cancelar');
  // Grava já, sem esperar o webhook, para a tela mostrar o estado novo na hora.
  const linha = await sincronizarAssinatura(assinatura.id_externo, banco, pagamentos);
  return json(200, { status: linha?.status ?? null, expira_em: linha?.expira_em ?? null });
}
