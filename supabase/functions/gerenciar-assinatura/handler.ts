// Ações do torcedor sobre a própria assinatura do web app (W18): resumo de cobrança, cancelar e reativar,
// trocar de plano, cadastrar um cartão novo e trocar o e-mail que recebe os avisos de cobrança.
import {
  CorreioIndisponivel,
  resumoDaCobranca,
  sincronizarAssinatura,
  type Banco,
  type Correio,
  type Pagamentos,
  type Plano,
} from '../_compartilhado/assinatura.ts';
import { CORS, json, jwtDe, lerCorpo, origemDoApp } from '../_compartilhado/http.ts';

const PLANOS: Plano[] = ['mensal', 'anual'];
/** Sem espaços, aspas nem sinais de tag: o endereço vai no corpo do e-mail. */
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const VALIDADE_DO_CODIGO_MS = 15 * 60_000;
const TENTATIVAS_DO_CODIGO = 5;

/** Hash do código com o id do torcedor: o banco nunca guarda o código em si. */
export async function hashDoCodigo(usuarioId: string, codigo: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${usuarioId}:${codigo}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

const novoCodigo = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');

export async function gerenciarAssinatura(req: Request, banco: Banco, pagamentos: Pagamentos, correio: Correio): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { erro: 'metodo_nao_permitido' });

  const jwt = jwtDe(req);
  const usuario = jwt ? await banco.usuarioDoToken(jwt) : null;
  if (!usuario) return json(401, { erro: 'sem_sessao' });

  const corpo = await lerCorpo(req);
  const { acao } = corpo;
  // Tudo é achado pelo torcedor logado, nunca por ids vindos do pedido.
  const customer = await banco.clienteDo(usuario.id);

  if (acao === 'resumo') {
    // Sem cliente no Stripe (nunca assinou pelo web app), não há cobrança para mostrar.
    if (!customer) return json(200, { email: null, plano: null, pagamento: null, cobrancas: [] });
    const assinatura = await banco.assinaturaWebEmAndamento(usuario.id);
    return json(200, resumoDaCobranca(await pagamentos.buscarCobranca(customer, assinatura?.id_externo ?? null)));
  }

  // ---------- e-mail de cobrança ----------
  if (acao === 'email-da-conta' || acao === 'codigo-email' || acao === 'confirmar-email') {
    if (!customer) return json(404, { erro: 'sem_assinatura_web' });

    if (acao === 'email-da-conta') {
      if (!usuario.email) return json(400, { erro: 'sem_email_na_conta' });
      await pagamentos.trocarEmailDeCobranca(customer, usuario.email);
      await banco.apagarCodigoDeEmail(usuario.id);
      return json(200, { email: usuario.email });
    }

    if (acao === 'codigo-email') {
      const email = typeof corpo.email === 'string' ? corpo.email.trim().toLowerCase() : '';
      if (email.length > 254 || !EMAIL.test(email)) return json(400, { erro: 'email_invalido' });
      const codigo = novoCodigo();
      await banco.guardarCodigoDeEmail(usuario.id, {
        email,
        hash: await hashDoCodigo(usuario.id, codigo),
        expiraEm: new Date(Date.now() + VALIDADE_DO_CODIGO_MS).toISOString(),
      });
      try {
        await correio.enviarCodigoDeCobranca(email, codigo);
      } catch (e) {
        await banco.apagarCodigoDeEmail(usuario.id);
        if (e instanceof CorreioIndisponivel) return json(503, { erro: 'email_indisponivel' });
        return json(502, { erro: 'falha_no_envio' });
      }
      return json(200, { ok: true });
    }

    const pendente = await banco.codigoDeEmail(usuario.id);
    if (!pendente || new Date(pendente.expiraEm).getTime() < Date.now()) return json(410, { erro: 'codigo_expirado' });
    if (pendente.tentativas >= TENTATIVAS_DO_CODIGO) return json(429, { erro: 'muitas_tentativas' });
    const codigo = typeof corpo.codigo === 'string' ? corpo.codigo.replace(/\D/g, '') : '';
    if ((await hashDoCodigo(usuario.id, codigo)) !== pendente.hash) {
      await banco.errouCodigoDeEmail(usuario.id);
      return json(400, { erro: 'codigo_invalido' });
    }
    await pagamentos.trocarEmailDeCobranca(customer, pendente.email);
    await banco.apagarCodigoDeEmail(usuario.id);
    return json(200, { email: pendente.email });
  }

  // ---------- ações sobre a assinatura ----------
  const assinatura = await banco.assinaturaWebEmAndamento(usuario.id);
  if (!customer || !assinatura || assinatura.status === 'pendente') return json(404, { erro: 'sem_assinatura_web' });
  const id = assinatura.id_externo;

  if (acao === 'cancelar' || acao === 'reativar') {
    await pagamentos.cancelarNoFimDoPeriodo(id, acao === 'cancelar');
    // Grava já, sem esperar o webhook, para a tela mostrar o estado novo na hora.
    const linha = await sincronizarAssinatura(id, banco, pagamentos);
    return json(200, { status: linha?.status ?? null, expira_em: linha?.expira_em ?? null });
  }

  if (acao === 'previa-troca' || acao === 'trocar-plano') {
    const plano = corpo.plano as Plano;
    if (!PLANOS.includes(plano)) return json(400, { erro: 'plano_invalido' });
    // Troca só com a assinatura em dia e renovando: cancelada ou atrasada resolve antes.
    if (assinatura.status !== 'ativa') return json(409, { erro: 'assinatura_nao_ativa' });
    const sub = await pagamentos.buscarAssinatura(id);
    const atual: Plano = sub.items.data[0]?.price.recurring?.interval === 'year' ? 'anual' : 'mensal';
    if (atual === plano) return json(409, { erro: 'mesmo_plano' });
    const preco = await pagamentos.precoPorChave(`membro_${plano}`);

    if (acao === 'previa-troca') {
      const p = await pagamentos.previaDaTroca(id, preco);
      return json(200, {
        plano,
        valor: p.valor / 100,
        credito: p.credito / 100,
        total: p.total / 100,
        moeda: p.moeda.toUpperCase(),
        renova_em: p.renovaEm === null ? null : new Date(p.renovaEm * 1000).toISOString(),
      });
    }

    if ((await pagamentos.trocarPlano(id, preco)) === 'recusado') return json(402, { erro: 'recusado' });
    const linha = await sincronizarAssinatura(id, banco, pagamentos);
    return json(200, { plano: linha?.plano ?? plano, status: linha?.status ?? null, expira_em: linha?.expira_em ?? null });
  }

  if (acao === 'sessao-cartao') {
    const clientSecret = await pagamentos.criarSessaoDeCartao({
      customer,
      assinaturaId: id,
      retorno: `${origemDoApp(req)}/conta/assinatura?cartao={CHECKOUT_SESSION_ID}`,
    });
    return json(200, { clientSecret });
  }

  if (acao === 'definir-cartao') {
    const sessao = typeof corpo.sessao === 'string' ? corpo.sessao : '';
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessao)) return json(400, { erro: 'sessao_invalida' });
    if (!(await pagamentos.definirCartao(customer, sessao, id))) return json(400, { erro: 'sessao_invalida' });
    const linha = await sincronizarAssinatura(id, banco, pagamentos);
    return json(200, { status: linha?.status ?? null });
  }

  return json(400, { erro: 'acao_invalida' });
}
