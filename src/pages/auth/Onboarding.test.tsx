import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp';
import { perfilDeTeste, perfilNovo, supabaseFalso } from '../../test/supabaseFalso';

async function ateDados(user: ReturnType<typeof renderApp>['user'], pais = 'Brasil', clube = 'Palmeiras') {
  await user.click(await screen.findByRole('button', { name: pais }));
  await user.click(screen.getByRole('button', { name: /Continuar/ }));
  await user.click(await screen.findByRole('button', { name: clube }));
  await esperarChecagemDoApelido();
  await user.click(screen.getByRole('button', { name: /Continuar/ }));
}

/** Uma pessoa leva mais que o debounce para chegar à etapa 3; sem esperar, o teste passa por sorte de tempo. */
async function esperarChecagemDoApelido() {
  const { rpc } = supabaseFalso.cliente;
  if (!supabaseFalso.perfil('usuario-1')?.apelido) return;
  // A primeira chamada é o sou_assinante do login; a checagem do apelido vem depois.
  const checagem = () => rpc.mock.calls.findIndex(([fn]) => fn === 'apelido_disponivel');
  await waitFor(() => expect(checagem()).toBeGreaterThanOrEqual(0));
  await act(() => rpc.mock.results[checagem()].value);
}

describe('Onboarding', () => {
  it('"Continuar" na etapa do clube abre "Seus dados" sem concluir', async () => {
    // A regressão do botão que virava submit no meio do clique só aparece em navegador real: ver e2e/cadastro.spec.ts.
    supabaseFalso.logar(perfilNovo());
    const { user, local } = renderApp('/onboarding');
    await ateDados(user);

    expect(await screen.findByRole('heading', { name: 'Seus dados' })).toBeInTheDocument();
    expect(supabaseFalso.perfil('usuario-1')?.onboarding_concluido_em).toBeNull();
    expect(local()).toBe('/onboarding');
  });

  it('salva país, clube e dados e libera o app', async () => {
    supabaseFalso.logar(perfilNovo({ apelido: 'Novo_Torcedor', nome: 'Novo' }));
    const { user, local } = renderApp('/onboarding');
    await ateDados(user, 'Argentina', 'Boca Juniors');

    expect(screen.getByLabelText('Nome completo')).toHaveValue('Novo');
    expect(screen.getByLabelText('Apelido na torcida')).toHaveValue('Novo_Torcedor');
    fireEvent.change(screen.getByLabelText('Nascimento'), { target: { value: '1994-03-14' } });
    await user.type(screen.getByLabelText('Cidade'), 'Curitiba');
    await user.click(screen.getByRole('switch'));
    await user.click(await screen.findByRole('button', { name: /Concluir/ }));

    await waitFor(() => expect(local()).toBe('/'));
    expect(supabaseFalso.perfil('usuario-1')).toMatchObject({
      pais: 'AR',
      time_id: 9001,
      nascimento: '1994-03-14',
      cidade: 'Curitiba',
      quer_avisos: false,
      onboarding_concluido_em: expect.any(String),
    });
    expect(await screen.findByRole('banner')).toHaveTextContent('Boca Juniors');
  });

  it('trocar de país desfaz a escolha de um clube de outro país', async () => {
    supabaseFalso.logar(perfilNovo());
    const { user } = renderApp('/onboarding');
    await user.click(await screen.findByRole('button', { name: 'Brasil' }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    await user.click(await screen.findByRole('button', { name: 'Palmeiras' }));
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    await user.click(screen.getByRole('button', { name: 'Espanha' }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(await screen.findByRole('button', { name: 'Real Madrid' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Palmeiras' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuar/ })).toBeDisabled();
  });

  it('lista os países do catálogo e os clubes do país separados por liga', async () => {
    supabaseFalso.logar(perfilNovo());
    const { user } = renderApp('/onboarding');
    expect(await screen.findByRole('button', { name: 'Argentina' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Brasil' }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    const serieA = await screen.findByRole('region', { name: 'Brasileirão Série A' });
    expect(within(serieA).getByRole('button', { name: 'Flamengo' })).toBeInTheDocument();
    const serieB = screen.getByRole('region', { name: 'Brasileirão Série B' });
    expect(within(serieB).getByRole('button', { name: 'Goiás' })).toBeInTheDocument();
    // A primeira divisão vem antes.
    expect(serieA.compareDocumentPosition(serieB) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(screen.getByRole('textbox', { name: 'Buscar clube' }), 'goi');
    expect(screen.queryByRole('region', { name: 'Brasileirão Série A' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Goiás' })).toBeInTheDocument();
  });

  it('se a lista de clubes não carregar, avisa e deixa tentar de novo', async () => {
    supabaseFalso.logar(perfilNovo());
    const { from } = supabaseFalso.cliente;
    const padrao = from.getMockImplementation()!;
    let falhas = 1;
    from.mockImplementation((tabela: string) => {
      if (tabela !== 'clubes' || falhas-- <= 0) return padrao(tabela);
      const falha = { select: () => falha, eq: () => falha, order: () => Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }) };
      return falha;
    });
    const { user } = renderApp('/onboarding');
    await user.click(await screen.findByRole('button', { name: 'Brasil' }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(await screen.findByText(/Não deu para carregar a lista agora/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('button', { name: 'Palmeiras' })).toBeInTheDocument();
  });

  it('não aceita menor de 18 anos pela data de nascimento', async () => {
    supabaseFalso.logar(perfilNovo());
    const { user } = renderApp('/onboarding');
    await ateDados(user);
    fireEvent.change(await screen.findByLabelText('Nascimento'), { target: { value: '2015-05-10' } });

    expect(screen.getByText('Você precisa ter 18 anos ou mais.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Concluir/ })).toBeDisabled();
  });

  it('quem entrou pelo Google aceita os termos aqui antes de concluir', async () => {
    supabaseFalso.logar(perfilNovo({ apelido: null, termos_aceitos_em: null, nome: 'Usuário Google' }));
    const { user, local } = renderApp('/onboarding');
    await ateDados(user);
    await user.type(await screen.findByLabelText('Apelido na torcida'), 'Do_Google');
    await screen.findByText('Apelido disponível.');
    const concluir = screen.getByRole('button', { name: /Concluir/ });
    expect(concluir).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Tenho 18 anos ou mais.' }));
    await user.click(screen.getByRole('checkbox', { name: /Li e aceito os/ }));
    await user.click(concluir);

    await waitFor(() => expect(local()).toBe('/'));
    expect(supabaseFalso.perfil('usuario-1')).toMatchObject({ apelido: 'Do_Google', termos_aceitos_em: expect.any(String) });
  });

  it('apelido pego por outra pessoa no último segundo: avisa e não conclui', async () => {
    supabaseFalso.logar(perfilNovo({ apelido: 'Novo_Torcedor' }));
    const { user, local } = renderApp('/onboarding');
    await ateDados(user);
    const concluir = await screen.findByRole('button', { name: /Concluir/ });
    await waitFor(() => expect(concluir).toBeEnabled());
    // Outra pessoa salva o mesmo apelido depois da checagem em tempo real.
    supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'rapido', apelido: 'novo_torcedor' }));
    await user.click(concluir);

    expect(await screen.findByRole('alert')).toHaveTextContent('Esse apelido acabou de ser escolhido por outra pessoa.');
    expect(local()).toBe('/onboarding');
  });

  it('quem já concluiu o onboarding vai direto para o app', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { local } = renderApp('/onboarding');
    await screen.findByRole('banner');
    expect(local()).toBe('/');
  });
});
