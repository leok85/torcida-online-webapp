import { describe, expect, it } from 'vitest';
import { criarFalsos, pedido, RAFA, subStripe } from '../_compartilhado/falsos';
import { gerenciarAssinatura } from './handler';

const URL_FUNCAO = 'http://supabase.test/functions/v1/gerenciar-assinatura';

async function comAssinatura() {
  const f = criarFalsos();
  f.clientes.set(RAFA.id, 'cus_1');
  const sub = subStripe();
  f.subs.set('sub_1', sub);
  await f.banco.gravarAssinatura({
    usuario_id: RAFA.id,
    origem: 'web',
    id_externo: 'sub_1',
    plano: 'mensal',
    status: 'ativa',
    expira_em: new Date(sub.items.data[0].current_period_end * 1000).toISOString(),
  });
  return f;
}

describe('gerenciar-assinatura', () => {
  it('cancelar marca o fim do período no Stripe e já grava a assinatura como cancelada', async () => {
    const f = await comAssinatura();
    const resposta = await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'cancelar' } }), f.banco, f.pagamentos, f.correio);
    expect(resposta.status).toBe(200);
    expect(f.pagamentos.cancelarNoFimDoPeriodo).toHaveBeenCalledWith('sub_1', true);
    expect(f.assinaturas[0].status).toBe('cancelada');
    expect((await resposta.json()).status).toBe('cancelada');
  });

  it('reativar desfaz o cancelamento', async () => {
    const f = await comAssinatura();
    await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'cancelar' } }), f.banco, f.pagamentos, f.correio);
    await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'reativar' } }), f.banco, f.pagamentos, f.correio);
    expect(f.pagamentos.cancelarNoFimDoPeriodo).toHaveBeenLastCalledWith('sub_1', false);
    expect(f.assinaturas[0].status).toBe('ativa');
  });

  it('ignora qualquer id de assinatura mandado no pedido: só mexe na do torcedor logado', async () => {
    const f = await comAssinatura();
    await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'cancelar', id: 'sub_de_outra_pessoa' } }), f.banco, f.pagamentos, f.correio);
    expect(f.pagamentos.cancelarNoFimDoPeriodo).toHaveBeenCalledWith('sub_1', true);
  });

  it('sem assinatura do web app, não há o que cancelar, trocar nem cartão para cadastrar', async () => {
    const f = criarFalsos();
    const status = await Promise.all(
      [{ acao: 'cancelar' }, { acao: 'trocar-plano', plano: 'anual' }, { acao: 'sessao-cartao' }, { acao: 'codigo-email', email: 'a@b.com' }].map(
        async (corpo) => (await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo }), f.banco, f.pagamentos, f.correio)).status,
      ),
    );
    expect(status).toEqual([404, 404, 404, 404]);
  });

  it('recusa ação desconhecida e pedido sem sessão', async () => {
    const f = await comAssinatura();
    expect((await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'apagar' } }), f.banco, f.pagamentos, f.correio)).status).toBe(400);
    expect(
      (await gerenciarAssinatura(pedido(URL_FUNCAO, { headers: { Authorization: '' }, corpo: { acao: 'cancelar' } }), f.banco, f.pagamentos, f.correio)).status,
    ).toBe(401);
  });
});

describe('gerenciar-assinatura: resumo de cobrança (Minha assinatura)', () => {
  it('devolve preço, cartão, e-mail e as faturas pagas com plano e forma de pagamento', async () => {
    const f = await comAssinatura();
    const resposta = await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'resumo' } }), f.banco, f.pagamentos, f.correio);
    expect(resposta.status).toBe(200);
    expect(f.pagamentos.buscarCobranca).toHaveBeenCalledWith('cus_1', 'sub_1');
    expect(await resposta.json()).toEqual({
      email: 'rafa@example.com',
      plano: { valor: 149, moeda: 'BRL', intervalo: 'ano' },
      pagamento: { tipo: 'cartao', bandeira: 'Visa', final: '4242', expira: '08/2029' },
      cobrancas: [
        { data: '2026-10-11T12:00:00.000Z', descricao: 'Plano anual · cartão •••• 4242', valor: 149, moeda: 'BRL', recibo: 'https://invoice.stripe.com/i/1' },
        { data: '2026-09-11T12:00:00.000Z', descricao: 'Plano mensal · Pix', valor: 14.9, moeda: 'BRL', recibo: null },
      ],
    });
  });

  it('sem cliente no Stripe, responde vazio sem chamar o Stripe', async () => {
    const f = criarFalsos();
    const resposta = await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'resumo' } }), f.banco, f.pagamentos, f.correio);
    expect(await resposta.json()).toEqual({ email: null, plano: null, pagamento: null, cobrancas: [] });
    expect(f.pagamentos.buscarCobranca).not.toHaveBeenCalled();
  });

  it('cliente sem assinatura em andamento ainda vê as cobranças antigas', async () => {
    const f = criarFalsos();
    f.clientes.set(RAFA.id, 'cus_1');
    await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'resumo' } }), f.banco, f.pagamentos, f.correio);
    expect(f.pagamentos.buscarCobranca).toHaveBeenCalledWith('cus_1', null);
  });

  it('pede sessão', async () => {
    const f = criarFalsos();
    const resposta = await gerenciarAssinatura(pedido(URL_FUNCAO, { corpo: { acao: 'resumo' }, headers: { Authorization: '' } }), f.banco, f.pagamentos, f.correio);
    expect(resposta.status).toBe(401);
  });
});

const chamar = (f: ReturnType<typeof criarFalsos>, corpo: object) => gerenciarAssinatura(pedido(URL_FUNCAO, { corpo }), f.banco, f.pagamentos, f.correio);

describe('gerenciar-assinatura: trocar de plano', () => {
  it('a prévia mostra o plano novo, o crédito do atual e o total de hoje', async () => {
    const f = await comAssinatura();
    const resposta = await chamar(f, { acao: 'previa-troca', plano: 'anual' });
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ plano: 'anual', valor: 149, credito: 7.45, total: 141.55, moeda: 'BRL', renova_em: '2027-10-11T12:00:00.000Z' });
    expect(f.pagamentos.previaDaTroca).toHaveBeenCalledWith('sub_1', 'price_membro_anual');
  });

  it('troca o preço da assinatura e já grava o plano novo', async () => {
    const f = await comAssinatura();
    const resposta = await chamar(f, { acao: 'trocar-plano', plano: 'anual' });
    expect(resposta.status).toBe(200);
    expect(f.pagamentos.trocarPlano).toHaveBeenCalledWith('sub_1', 'price_membro_anual');
    expect(f.assinaturas[0].plano).toBe('anual');
    expect((await resposta.json()).plano).toBe('anual');
  });

  it('cartão recusado na troca devolve 402 e não muda o plano', async () => {
    const f = await comAssinatura();
    f.recusarCartao();
    const resposta = await chamar(f, { acao: 'trocar-plano', plano: 'anual' });
    expect(resposta.status).toBe(402);
    expect(f.assinaturas[0].plano).toBe('mensal');
  });

  it('recusa trocar para o mesmo plano, plano inválido e assinatura cancelada', async () => {
    const f = await comAssinatura();
    expect((await chamar(f, { acao: 'trocar-plano', plano: 'mensal' })).status).toBe(409);
    expect((await chamar(f, { acao: 'previa-troca', plano: 'vitalicio' })).status).toBe(400);
    await chamar(f, { acao: 'cancelar' });
    expect((await chamar(f, { acao: 'trocar-plano', plano: 'anual' })).status).toBe(409);
    expect(f.pagamentos.trocarPlano).not.toHaveBeenCalled();
  });
});

describe('gerenciar-assinatura: cartão novo', () => {
  it('abre a sessão de cartão do cliente do torcedor, voltando para Minha assinatura', async () => {
    const f = await comAssinatura();
    const resposta = await gerenciarAssinatura(
      pedido(URL_FUNCAO, { corpo: { acao: 'sessao-cartao' }, headers: { Origin: 'http://localhost:5173' } }),
      f.banco,
      f.pagamentos,
      f.correio,
    );
    expect(await resposta.json()).toEqual({ clientSecret: 'cs_setup_secret_teste' });
    expect(f.pagamentos.criarSessaoDeCartao).toHaveBeenCalledWith({
      customer: 'cus_1',
      assinaturaId: 'sub_1',
      retorno: 'http://localhost:5173/conta/assinatura?cartao={CHECKOUT_SESSION_ID}',
    });
  });

  it('usa o cartão da sessão concluída e recusa sessão inválida', async () => {
    const f = await comAssinatura();
    expect((await chamar(f, { acao: 'definir-cartao', sessao: 'cs_test_cartao' })).status).toBe(200);
    expect(f.pagamentos.definirCartao).toHaveBeenCalledWith('cus_1', 'cs_test_cartao', 'sub_1');
    expect((await chamar(f, { acao: 'definir-cartao', sessao: 'cs_de_outra_pessoa' })).status).toBe(400);
    expect((await chamar(f, { acao: 'definir-cartao', sessao: 'javascript:alert(1)' })).status).toBe(400);
  });
});

describe('gerenciar-assinatura: e-mail de cobrança', () => {
  it('manda o código para o e-mail novo e só troca no Stripe com o código certo', async () => {
    const f = await comAssinatura();
    expect((await chamar(f, { acao: 'codigo-email', email: ' Financeiro@Email.com ' })).status).toBe(200);
    const { para, codigo } = f.enviados[0];
    expect(para).toBe('financeiro@email.com');
    expect(codigo).toMatch(/^\d{6}$/);
    // O banco guarda só o hash do código.
    expect(f.codigos.get(RAFA.id)!.hash).not.toContain(codigo);
    const errado = codigo === '000000' ? '111111' : '000000';
    expect((await chamar(f, { acao: 'confirmar-email', codigo: errado })).status).toBe(400);
    expect(f.pagamentos.trocarEmailDeCobranca).not.toHaveBeenCalled();
    const certo = await chamar(f, { acao: 'confirmar-email', codigo });
    expect(await certo.json()).toEqual({ email: 'financeiro@email.com' });
    expect(f.pagamentos.trocarEmailDeCobranca).toHaveBeenCalledWith('cus_1', 'financeiro@email.com');
    expect(f.codigos.has(RAFA.id)).toBe(false);
  });

  it('código vencido ou com tentativas demais não serve', async () => {
    const f = await comAssinatura();
    await chamar(f, { acao: 'codigo-email', email: 'financeiro@email.com' });
    const { codigo } = f.enviados[0];
    f.codigos.get(RAFA.id)!.tentativas = 5;
    expect((await chamar(f, { acao: 'confirmar-email', codigo })).status).toBe(429);
    f.codigos.get(RAFA.id)!.tentativas = 0;
    f.codigos.get(RAFA.id)!.expiraEm = new Date(Date.now() - 1000).toISOString();
    expect((await chamar(f, { acao: 'confirmar-email', codigo })).status).toBe(410);
  });

  it('recusa e-mail inválido e avisa quando o envio de e-mail não está configurado', async () => {
    const f = await comAssinatura();
    expect((await chamar(f, { acao: 'codigo-email', email: 'sem-arroba' })).status).toBe(400);
    expect((await chamar(f, { acao: 'codigo-email', email: '<script>@x.com' })).status).toBe(400);
    f.desligarCorreio();
    expect((await chamar(f, { acao: 'codigo-email', email: 'financeiro@email.com' })).status).toBe(503);
    expect(f.codigos.has(RAFA.id)).toBe(false);
  });

  it('voltar para o e-mail da conta não pede código', async () => {
    const f = await comAssinatura();
    const resposta = await chamar(f, { acao: 'email-da-conta' });
    expect(await resposta.json()).toEqual({ email: 'rafa@example.com' });
    expect(f.pagamentos.trocarEmailDeCobranca).toHaveBeenCalledWith('cus_1', 'rafa@example.com');
  });
});
