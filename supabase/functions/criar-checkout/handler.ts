// Abre a Checkout Session (modo assinatura, formulário embutido) para o torcedor logado.
import type { Banco, Moeda, Pagamentos, Plano } from '../_compartilhado/assinatura.ts';
import { CORS, json, jwtDe, lerCorpo, origemDoApp } from '../_compartilhado/http.ts';

const PLANOS: Plano[] = ['mensal', 'anual'];
const MOEDAS: Moeda[] = ['BRL', 'USD', 'EUR'];

export async function criarCheckout(req: Request, banco: Banco, pagamentos: Pagamentos): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { erro: 'metodo_nao_permitido' });

  const jwt = jwtDe(req);
  const usuario = jwt ? await banco.usuarioDoToken(jwt) : null;
  if (!usuario) return json(401, { erro: 'sem_sessao' });

  const { plano, moeda } = await lerCorpo(req);
  if (!PLANOS.includes(plano as Plano) || !MOEDAS.includes(moeda as Moeda)) return json(400, { erro: 'plano_invalido' });

  // Evita duas assinaturas pagas para a mesma pessoa (por exemplo, duas abas abertas em /assinar).
  if (await banco.assinaturaWebEmAndamento(usuario.id)) return json(409, { erro: 'ja_assinante' });

  const customer = (await banco.clienteDo(usuario.id)) ?? (await banco.salvarCliente(usuario.id, await pagamentos.criarCliente(usuario)));
  const preco = await pagamentos.precoPorChave(`membro_${plano}`);
  const clientSecret = await pagamentos.criarSessao({
    customer,
    preco,
    moeda: moeda as Moeda,
    retorno: `${origemDoApp(req)}/assinar/retorno?sessao={CHECKOUT_SESSION_ID}`,
    usuarioId: usuario.id,
  });
  return json(200, { clientSecret });
}
