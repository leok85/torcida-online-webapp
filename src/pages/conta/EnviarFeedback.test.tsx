import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FeedbackRow } from '../../lib/database.types';
import { renderApp } from '../../test/renderApp';
import { EMAIL_PADRAO, perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';

const { from } = supabaseFalso.cliente;

function feedbackAntigo(campos: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    id: `antigo-${supabaseFalso.feedbacks().length + 1}`,
    usuario_id: 'usuario-1',
    tipo: 'sugestao',
    area: 'jogo',
    texto: 'Mostrar o histórico de palpites com a taxa de acerto.',
    anexo: null,
    dados_navegador: null,
    pode_responder: false,
    email: null,
    estado: 'analise',
    resposta: null,
    xp: 0,
    criado_em: '2026-09-28T12:00:00Z',
    atualizado_em: '2026-09-28T12:00:00Z',
    ...campos,
  };
}

function abrir(rota = '/conta/feedback', state?: unknown) {
  supabaseFalso.logar(perfilDeTeste());
  return renderApp(rota, state);
}

async function escrever(user: ReturnType<typeof renderApp>['user'], tipo: string, texto: string) {
  await user.click(await screen.findByRole('button', { name: new RegExp(tipo) }));
  await user.type(screen.getByRole('textbox'), texto);
}

describe('Enviar feedback (W23)', () => {
  it('abre pelo menu de conta já com a área da tela de origem', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/jogos');
    await user.click(await screen.findByRole('button', { name: /Rafa_9/ }));
    await user.click(screen.getByRole('menuitem', { name: /Enviar feedback/ }));

    expect(local()).toBe('/conta/feedback');
    expect(screen.getByRole('heading', { name: 'Enviar feedback' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jogo e chat' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('só libera o envio com o tipo e pelo menos 10 caracteres, com a pergunta e o exemplo do tipo', async () => {
    const { user } = abrir();
    const enviar = await screen.findByRole('button', { name: 'Enviar' });
    expect(enviar).toBeDisabled();
    expect(screen.getByText('Escolha o tipo e escreva pelo menos 10 caracteres.')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Escolha o tipo acima para começar.');

    await user.click(screen.getByRole('button', { name: /Problema/ }));
    expect(screen.getByLabelText('O que aconteceu? Se puder, conte o passo a passo.')).toHaveAttribute('placeholder', expect.stringMatching(/^Ex\.: abri o chat/));
    await user.type(screen.getByRole('textbox'), 'Travou');
    expect(screen.getByText('6 / 1000')).toBeInTheDocument();
    expect(screen.getByText('Escreva pelo menos 10 caracteres.')).toBeInTheDocument();
    expect(enviar).toBeDisabled();

    await user.type(screen.getByRole('textbox'), ' no chat');
    expect(screen.getByText('Este envio rende +50 XP.')).toBeInTheDocument();
    expect(enviar).toBeEnabled();
  });

  it('envia com a área, os dados do navegador e o e-mail, ganha +50 XP e aparece no histórico', async () => {
    const { user } = abrir('/conta/feedback', { de: '/ao-vivo' });
    await escrever(user, 'Sugestão', 'Poder filtrar o chat só pelos lances.');
    await user.click(screen.getByRole('button', { name: 'Loja e moedas' }));
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('heading', { name: 'Valeu pelo toque' })).toBeInTheDocument();
    expect(screen.getByText(`Recebemos seu envio. Se precisarmos de mais detalhes, respondemos em ${EMAIL_PADRAO}.`)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Valeu pelo toque' })).getByText(/\+50 XP/)).toBeInTheDocument();

    const [salvo] = supabaseFalso.feedbacks();
    expect(salvo).toMatchObject({
      tipo: 'sugestao',
      area: 'loja',
      texto: 'Poder filtrar o chat só pelos lances.',
      pode_responder: true,
      email: EMAIL_PADRAO,
      dados_navegador: expect.objectContaining({ ultima_tela: '/ao-vivo', user_agent: expect.any(String) }),
    });
    const historico = screen.getByRole('list', { name: 'Seus envios' });
    expect(within(historico).getByRole('listitem')).toHaveTextContent('SugestãoRecebido');
    expect(screen.getByText('1 de 2 envios com XP usados nesta semana')).toBeInTheDocument();
  });

  it('sem dados do navegador e sem resposta por e-mail', async () => {
    const { user } = abrir();
    await escrever(user, 'Elogio', 'As notas do pós-jogo ficaram ótimas.');
    await user.click(screen.getByRole('switch', { name: /Enviar dados do navegador/ }));
    await user.click(screen.getByRole('switch', { name: /Podem me responder por e-mail/ }));
    expect(screen.getByRole('switch', { name: /Podem me responder/ })).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Recebemos seu envio. Você acompanha o andamento aqui ao lado.')).toBeInTheDocument();
    expect(supabaseFalso.feedbacks()[0]).toMatchObject({ dados_navegador: null, pode_responder: false, email: null });
  });

  it('o terceiro envio da semana não rende XP', async () => {
    const agora = new Date().toISOString();
    supabaseFalso.feedbacks().push(feedbackAntigo({ xp: 50, criado_em: agora }), feedbackAntigo({ xp: 50, criado_em: agora }));
    const { user } = abrir();
    expect(await screen.findByText('2 de 2 envios com XP usados nesta semana')).toBeInTheDocument();
    await escrever(user, 'Problema', 'A foto do intervalo não aparece.');
    expect(screen.getByText('Envio sem XP: limite semanal atingido.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Você já ganhou o XP dos 2 envios desta semana. O limite renova na segunda.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Valeu pelo toque' })).queryByText(/\+50 XP/)).not.toBeInTheDocument();
  });

  it('"Enviar outro" volta ao formulário limpo e "Voltar ao início" leva para o início', async () => {
    const { user } = abrir();
    await escrever(user, 'Elogio', 'As notas do pós-jogo ficaram ótimas.');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
    await user.click(screen.getByRole('button', { name: 'Enviar outro' }));
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });

  it('mostra o histórico com o andamento e a resposta da equipe', async () => {
    supabaseFalso.feedbacks().push(
      feedbackAntigo({ tipo: 'problema', estado: 'resolvido', texto: 'A foto não aparecia no feed.', resposta: 'Corrigido na versão de 17/09. Obrigado!', criado_em: '2026-09-14T15:00:00Z' }),
      feedbackAntigo({ usuario_id: 'outro-usuario', texto: 'Envio de outro torcedor' }),
    );
    abrir();
    const historico = await screen.findByRole('list', { name: 'Seus envios' });
    const [item] = within(historico).getAllByRole('listitem');
    expect(item).toHaveTextContent('ProblemaResolvido14/09A foto não aparecia no feed.Equipe: Corrigido na versão de 17/09. Obrigado!');
    expect(screen.getByText('1 envio')).toBeInTheDocument();
    expect(screen.queryByText('Envio de outro torcedor')).not.toBeInTheDocument();
  });

  it('anexa um print e deixa remover; recusa formato ou tamanho errado', async () => {
    const { user } = abrir();
    await screen.findByRole('button', { name: /Anexar print da tela/ });
    const arquivo = screen.getByTestId('arquivo-do-feedback');
    fireEvent.change(arquivo, { target: { files: [new File(['x'], 'tela.gif', { type: 'image/gif' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Use uma imagem PNG, JPG ou WebP.');

    fireEvent.change(arquivo, { target: { files: [new File(['x'], 'tela.png', { type: 'image/png' })] } });
    expect(screen.getByText('tela.png')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover print' }));
    expect(screen.queryByText('tela.png')).not.toBeInTheDocument();

    fireEvent.change(arquivo, { target: { files: [new File(['x'], 'tela.png', { type: 'image/png' })] } });
    await escrever(user, 'Problema', 'O placar travou no intervalo.');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByRole('heading', { name: 'Valeu pelo toque' });
    expect(supabaseFalso.feedbacks()[0].anexo).toMatch(/^usuario-1\/[0-9a-f-]+\.png$/);
    expect(supabaseFalso.fotos()).toContain(supabaseFalso.feedbacks()[0].anexo);
  });

  it('falha no envio: avisa, mantém o texto e deixa tentar de novo', async () => {
    const original = from.getMockImplementation()!;
    let falhar = true;
    from.mockImplementation((tabela: string) => {
      const consulta = original(tabela);
      if (tabela !== 'feedbacks' || !falhar) return consulta;
      return { ...consulta, insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '500', message: 'erro' } }) }) }) };
    });
    const { user } = abrir();
    await escrever(user, 'Problema', 'O placar travou no intervalo.');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    const falha = await screen.findByRole('alert');
    expect(falha).toHaveTextContent('Não foi possível enviar');
    expect(falha).toHaveTextContent('Tivemos um problema no servidor. Seu texto e o anexo continuam aqui.');
    expect(screen.getByRole('textbox')).toHaveValue('O placar travou no intervalo.');

    falhar = false;
    await user.click(within(falha).getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Valeu pelo toque' })).toBeInTheDocument();
  });

  it('sem internet, a mensagem diz isso', async () => {
    const original = from.getMockImplementation()!;
    from.mockImplementation((tabela: string) => {
      const consulta = original(tabela);
      if (tabela !== 'feedbacks') return consulta;
      return { ...consulta, insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'Failed to fetch' } }) }) }) };
    });
    const online = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')!;
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      const { user } = abrir();
      await escrever(user, 'Problema', 'O placar travou no intervalo.');
      await user.click(screen.getByRole('button', { name: 'Enviar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Parece que você está sem internet.');
    } finally {
      Object.defineProperty(navigator, 'onLine', online);
      delete (navigator as { onLine?: boolean }).onLine;
    }
  });

  it('mostra "Enviando…" enquanto o servidor responde', async () => {
    const original = from.getMockImplementation()!;
    let liberar: () => void = () => undefined;
    from.mockImplementation((tabela: string) => {
      const consulta = original(tabela);
      if (tabela !== 'feedbacks') return consulta;
      return {
        ...consulta,
        insert: (linha: unknown) => {
          const real = consulta.insert(linha);
          return { select: () => ({ single: () => new Promise((ok) => (liberar = () => ok(real.select().single()))) }) };
        },
      };
    });
    const { user } = abrir();
    await escrever(user, 'Elogio', 'As notas do pós-jogo ficaram ótimas.');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    const botao = await screen.findByRole('button', { name: 'Enviando…' });
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
    liberar();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Valeu pelo toque' })).toBeInTheDocument());
  });
});
