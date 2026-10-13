import { describe, expect, it, vi } from 'vitest';
import { CorreioIndisponivel } from '../_compartilhado/assinatura';
import { convidarAmigos, RecusaDoBanco, type Dependencias } from './handler';

const URL_FUNCAO = 'http://supabase.test/functions/v1/convidar-amigos';

/** Banco em memória com as mesmas regras de registrar_convites e registrar_reenvio. */
function dependencias({ jaHoje = 0 } = {}) {
  const convites = new Map<string, { mensagem: string | null; reenviado: boolean }>();
  let hoje = jaHoje;
  const enviados: { para: string; link: string; mensagem: string | null }[] = [];
  const deps = {
    usuarioDoToken: vi.fn(async (jwt: string) => (jwt === 'token-valido' ? { id: 'usuario-1', email: 'rafa@example.com' } : null)),
    registrar: vi.fn(async (_id: string, emails: string[], mensagem: string | null) => {
      const repetido = emails.find((e) => convites.has(e));
      if (repetido) throw new RecusaDoBanco('ja_convidado', repetido);
      if (hoje + emails.length > 10) throw new RecusaDoBanco('limite_diario');
      emails.forEach((e) => convites.set(e, { mensagem, reenviado: false }));
      hoje += emails.length;
      return { apelido: 'Rafa_9', clube: 'Palmeiras' };
    }),
    registrarReenvio: vi.fn(async (_id: string, email: string) => {
      const convite = convites.get(email);
      if (!convite) throw new RecusaDoBanco('nao_convidado');
      if (convite.reenviado) throw new RecusaDoBanco('ja_reenviado');
      convite.reenviado = true;
      hoje += 1;
      return { apelido: 'Rafa_9', clube: 'Palmeiras', mensagem: convite.mensagem };
    }),
    desfazer: vi.fn(async (_id: string, emails: string[], reenvio: boolean) => {
      emails.forEach((e) => (reenvio ? (convites.get(e)!.reenviado = false) : convites.delete(e)));
    }),
    enviarConvite: vi.fn(async (para: string, convite: { link: string; mensagem: string | null }) => {
      enviados.push({ para, link: convite.link, mensagem: convite.mensagem });
    }),
  } satisfies Dependencias;
  return { deps, convites, enviados };
}

const pedido = (corpo: object, { token = 'token-valido', origem = 'http://localhost:5173' } = {}) =>
  new Request(URL_FUNCAO, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Origin: origem, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });

describe('convidar-amigos: enviar', () => {
  it('grava e manda um e-mail por amigo, com o link /r/APELIDO do web app e o recado', async () => {
    const { deps, convites, enviados } = dependencias();
    const resposta = await convidarAmigos(
      pedido({ acao: 'enviar', emails: [' Pedro@Email.com ', 'bia@email.com', 'pedro@email.com'], mensagem: ' Bora torcer junto! ' }),
      deps,
    );
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ enviados: ['pedro@email.com', 'bia@email.com'], falharam: [] });
    expect([...convites.keys()]).toEqual(['pedro@email.com', 'bia@email.com']);
    expect(enviados).toEqual([
      { para: 'pedro@email.com', link: 'http://localhost:5173/r/Rafa_9', mensagem: 'Bora torcer junto!' },
      { para: 'bia@email.com', link: 'http://localhost:5173/r/Rafa_9', mensagem: 'Bora torcer junto!' },
    ]);
  });

  it('link de origem desconhecida vai para o domínio de produção', async () => {
    const { deps, enviados } = dependencias();
    await convidarAmigos(pedido({ acao: 'enviar', emails: ['pedro@email.com'] }, { origem: 'https://golpe.example' }), deps);
    expect(enviados[0].link).toBe('https://app.torcidaonline.com.br/r/Rafa_9');
  });

  it('sem sessão não envia nada', async () => {
    const { deps } = dependencias();
    const resposta = await convidarAmigos(pedido({ acao: 'enviar', emails: ['pedro@email.com'] }, { token: 'outro' }), deps);
    expect(resposta.status).toBe(401);
    expect(deps.registrar).not.toHaveBeenCalled();
  });

  it.each([
    [{ emails: [] }, 'emails_invalidos'],
    [{ emails: ['pedro@'] }, 'email_invalido'],
    [{ emails: ['<b>@x.com'] }, 'email_invalido'],
    [{ emails: ['RAFA@example.com'] }, 'proprio_email'],
    [{ emails: ['pedro@email.com'], mensagem: 'x'.repeat(281) }, 'mensagem_longa'],
  ])('recusa pedido inválido (%j → %s)', async (corpo, erro) => {
    const { deps } = dependencias();
    const resposta = await convidarAmigos(pedido({ acao: 'enviar', ...corpo }), deps);
    expect(resposta.status).toBe(400);
    expect((await resposta.json()).erro).toBe(erro);
    expect(deps.registrar).not.toHaveBeenCalled();
  });

  it('e-mail que já recebeu convite volta 409 com o endereço', async () => {
    const { deps } = dependencias();
    await convidarAmigos(pedido({ acao: 'enviar', emails: ['pedro@email.com'] }), deps);
    const resposta = await convidarAmigos(pedido({ acao: 'enviar', emails: ['bia@email.com', 'pedro@email.com'] }), deps);
    expect(resposta.status).toBe(409);
    expect(await resposta.json()).toEqual({ erro: 'ja_convidado', email: 'pedro@email.com' });
  });

  it('passar de 10 no dia volta 429 e não envia', async () => {
    const { deps, enviados } = dependencias({ jaHoje: 9 });
    const resposta = await convidarAmigos(pedido({ acao: 'enviar', emails: ['a@email.com', 'b@email.com'] }), deps);
    expect(resposta.status).toBe(429);
    expect(enviados).toEqual([]);
  });

  it('sem chave do Resend desfaz tudo e responde 503', async () => {
    const { deps, convites } = dependencias();
    deps.enviarConvite.mockRejectedValue(new CorreioIndisponivel());
    const resposta = await convidarAmigos(pedido({ acao: 'enviar', emails: ['pedro@email.com', 'bia@email.com'] }), deps);
    expect(resposta.status).toBe(503);
    expect(convites.size).toBe(0);
  });

  it('o e-mail que falha é desfeito e os outros seguem', async () => {
    const { deps, convites } = dependencias();
    deps.enviarConvite.mockImplementation(async (para: string) => {
      if (para === 'bia@email.com') throw new Error('Resend 500');
    });
    const resposta = await convidarAmigos(pedido({ acao: 'enviar', emails: ['pedro@email.com', 'bia@email.com'] }), deps);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ enviados: ['pedro@email.com'], falharam: ['bia@email.com'] });
    expect([...convites.keys()]).toEqual(['pedro@email.com']);
  });

  it('se nenhum sai, responde 502', async () => {
    const { deps } = dependencias();
    deps.enviarConvite.mockRejectedValue(new Error('Resend 500'));
    const resposta = await convidarAmigos(pedido({ acao: 'enviar', emails: ['pedro@email.com'] }), deps);
    expect(resposta.status).toBe(502);
  });
});

describe('convidar-amigos: reenviar', () => {
  it('reenvia uma vez, com o recado original; a segunda volta 409', async () => {
    const { deps, enviados } = dependencias();
    await convidarAmigos(pedido({ acao: 'enviar', emails: ['pedro@email.com'], mensagem: 'Vem!' }), deps);
    const primeira = await convidarAmigos(pedido({ acao: 'reenviar', email: 'Pedro@email.com' }), deps);
    expect(primeira.status).toBe(200);
    expect(enviados[1]).toEqual({ para: 'pedro@email.com', link: 'http://localhost:5173/r/Rafa_9', mensagem: 'Vem!' });
    const segunda = await convidarAmigos(pedido({ acao: 'reenviar', email: 'pedro@email.com' }), deps);
    expect(segunda.status).toBe(409);
    expect((await segunda.json()).erro).toBe('ja_reenviado');
  });

  it('e-mail que não foi convidado volta 404', async () => {
    const { deps } = dependencias();
    const resposta = await convidarAmigos(pedido({ acao: 'reenviar', email: 'pedro@email.com' }), deps);
    expect(resposta.status).toBe(404);
  });

  it('se o reenvio falha, a marca de reenviado volta atrás', async () => {
    const { deps, convites } = dependencias();
    await convidarAmigos(pedido({ acao: 'enviar', emails: ['pedro@email.com'] }), deps);
    deps.enviarConvite.mockRejectedValue(new Error('Resend 500'));
    const resposta = await convidarAmigos(pedido({ acao: 'reenviar', email: 'pedro@email.com' }), deps);
    expect(resposta.status).toBe(502);
    expect(convites.get('pedro@email.com')!.reenviado).toBe(false);
  });
});

it('ação desconhecida volta 400', async () => {
  const { deps } = dependencias();
  expect((await convidarAmigos(pedido({ acao: 'apagar' }), deps)).status).toBe(400);
});
