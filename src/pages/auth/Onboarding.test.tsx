import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/renderApp';
import { assinaturaDeTeste, perfilDeTeste, perfilNovo, supabaseFalso } from '../../test/supabaseFalso';

type User = ReturnType<typeof renderApp>['user'];

async function ateClube(user: User, pais = 'Brasil') {
  await user.click(await screen.findByRole('button', { name: pais }));
  await user.click(screen.getByRole('button', { name: /Continuar/ }));
}

async function escolherClubeECidade(user: User, clube = 'Palmeiras', cidade = 'Curitiba, PR') {
  await user.click(await screen.findByRole('button', { name: clube }));
  await user.type(screen.getByLabelText('Sua cidade'), cidade);
}

/** Uma pessoa leva mais que o debounce da checagem do apelido; sem esperar, o teste passa por sorte de tempo. */
async function esperarChecagemDoApelido() {
  const { rpc } = supabaseFalso.cliente;
  const checagem = () => rpc.mock.calls.findIndex(([fn]) => fn === 'apelido_disponivel');
  await waitFor(() => expect(checagem()).toBeGreaterThanOrEqual(0));
  await act(() => rpc.mock.results[checagem()].value);
}

afterEach(() => vi.unstubAllGlobals());

describe('Onboarding', () => {
  it('tem só duas etapas, país e depois clube e cidade, sem pedir de novo os dados do cadastro', async () => {
    supabaseFalso.logar(perfilNovo());
    const { user } = renderApp('/onboarding');
    expect(await screen.findByText('Etapa 1 de 2 · país')).toBeInTheDocument();
    await ateClube(user);

    expect(screen.getByText('Etapa 2 de 2 · clube e cidade')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Escolha seu time de coração' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome completo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Apelido na torcida')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nascimento')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entrar na torcida/ })).toBeInTheDocument();
  });

  it('salva país, clube e cidade e leva para a oferta de planos', async () => {
    supabaseFalso.logar(perfilNovo());
    const { user, local } = renderApp('/onboarding');
    await ateClube(user, 'Argentina');
    await escolherClubeECidade(user, 'Boca Juniors', 'Buenos Aires');
    expect(screen.getByText('Boca Juniors · Buenos Aires')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Entrar na torcida/ }));

    await waitFor(() => expect(local()).toBe('/assinar'));
    expect(supabaseFalso.perfil('usuario-1')).toMatchObject({
      pais: 'AR',
      time_id: 9001,
      cidade: 'Buenos Aires',
      apelido: 'Rafa_9',
      onboarding_concluido_em: expect.any(String),
    });
    expect(await screen.findByRole('heading', { name: 'Seja membro' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('Boca Juniors');
  });

  it('"Agora não" na oferta de planos leva ao início', async () => {
    supabaseFalso.logar(perfilNovo());
    const { user, local } = renderApp('/onboarding');
    await ateClube(user);
    await escolherClubeECidade(user);
    await user.click(screen.getByRole('button', { name: /Entrar na torcida/ }));
    await user.click(await screen.findByRole('button', { name: 'Agora não' }));
    expect(local()).toBe('/');
  });

  it('quem já é membro vai direto ao início', async () => {
    supabaseFalso.assinar(assinaturaDeTeste());
    supabaseFalso.logar(perfilNovo());
    const { user, local } = renderApp('/onboarding');
    await ateClube(user);
    await escolherClubeECidade(user);
    await user.click(screen.getByRole('button', { name: /Entrar na torcida/ }));
    await waitFor(() => expect(local()).toBe('/'));
  });

  it('a cidade é obrigatória', async () => {
    supabaseFalso.logar(perfilNovo());
    const { user } = renderApp('/onboarding');
    await ateClube(user);
    await user.click(await screen.findByRole('button', { name: 'Palmeiras' }));
    expect(screen.getByRole('button', { name: /Entrar na torcida/ })).toBeDisabled();
    await user.type(screen.getByLabelText('Sua cidade'), 'Recife');
    expect(screen.getByRole('button', { name: /Entrar na torcida/ })).toBeEnabled();
  });

  it('"Usar minha localização" preenche a cidade', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: -27.59, longitude: -48.54 } } as GeolocationPosition) },
    });
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify({ city: 'Florianópolis', principalSubdivisionCode: 'BR-SC' })));
    vi.stubGlobal('fetch', fetch);
    supabaseFalso.logar(perfilNovo());
    const { user } = renderApp('/onboarding');
    await ateClube(user);
    await user.click(screen.getByRole('button', { name: /Usar minha localização/ }));

    await waitFor(() => expect(screen.getByLabelText('Sua cidade')).toHaveValue('Florianópolis, SC'));
    expect(String(fetch.mock.calls[0][0])).toContain('latitude=-27.59&longitude=-48.54');
  });

  it('se a localização for negada, pede para digitar a cidade', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: { getCurrentPosition: (_ok: PositionCallback, falha: PositionErrorCallback) => falha({ code: 1 } as GeolocationPositionError) },
    });
    supabaseFalso.logar(perfilNovo());
    const { user } = renderApp('/onboarding');
    await ateClube(user);
    await user.click(screen.getByRole('button', { name: /Usar minha localização/ }));
    expect(await screen.findByText('Não deu para descobrir sua cidade. Digite o nome dela.')).toBeInTheDocument();
  });

  it('lista os clubes do país separados por liga, com busca', async () => {
    supabaseFalso.logar(perfilNovo());
    const { user } = renderApp('/onboarding');
    await ateClube(user);

    const serieA = await screen.findByRole('region', { name: 'Brasileirão Série A' });
    expect(within(serieA).getByRole('button', { name: 'Flamengo' })).toBeInTheDocument();
    const serieB = screen.getByRole('region', { name: 'Brasileirão Série B' });
    expect(within(serieB).getByRole('button', { name: 'Goiás' })).toBeInTheDocument();
    expect(serieA.compareDocumentPosition(serieB) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(screen.getByRole('textbox', { name: 'Buscar clube' }), 'goi');
    expect(screen.queryByRole('region', { name: 'Brasileirão Série A' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Goiás' })).toBeInTheDocument();
  });

  it('trocar de país desfaz a escolha de um clube de outro país', async () => {
    supabaseFalso.logar(perfilNovo());
    const { user } = renderApp('/onboarding');
    await ateClube(user);
    await user.click(await screen.findByRole('button', { name: 'Palmeiras' }));
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    await ateClube(user, 'Espanha');

    expect(await screen.findByRole('button', { name: 'Real Madrid' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Palmeiras' })).not.toBeInTheDocument();
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
    await ateClube(user);

    expect(await screen.findByText(/Não deu para carregar a lista agora/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('button', { name: 'Palmeiras' })).toBeInTheDocument();
  });

  it('quem entrou pelo Google escolhe o apelido e aceita os termos na etapa do clube', async () => {
    supabaseFalso.logar(perfilNovo({ apelido: null, termos_aceitos_em: null, nome: 'Usuário Google' }));
    const { user, local } = renderApp('/onboarding');
    await ateClube(user);
    await escolherClubeECidade(user);
    await user.type(screen.getByLabelText('Apelido na torcida'), 'Do_Google');
    await esperarChecagemDoApelido();
    await screen.findByText('Apelido disponível.');
    const entrar = screen.getByRole('button', { name: /Entrar na torcida/ });
    expect(entrar).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Tenho 18 anos ou mais.' }));
    await user.click(screen.getByRole('checkbox', { name: /Li e aceito os/ }));
    await user.click(entrar);

    await waitFor(() => expect(local()).toBe('/assinar'));
    expect(supabaseFalso.perfil('usuario-1')).toMatchObject({ apelido: 'Do_Google', termos_aceitos_em: expect.any(String) });
  });

  it('apelido pego por outra pessoa no último segundo: avisa e não conclui', async () => {
    supabaseFalso.logar(perfilNovo({ apelido: null, termos_aceitos_em: null }));
    const { user, local } = renderApp('/onboarding');
    await ateClube(user);
    await escolherClubeECidade(user);
    await user.type(screen.getByLabelText('Apelido na torcida'), 'Novo_Torcedor');
    await esperarChecagemDoApelido();
    await user.click(screen.getByRole('checkbox', { name: 'Tenho 18 anos ou mais.' }));
    await user.click(screen.getByRole('checkbox', { name: /Li e aceito os/ }));
    const entrar = screen.getByRole('button', { name: /Entrar na torcida/ });
    await waitFor(() => expect(entrar).toBeEnabled());
    // Outra pessoa salva o mesmo apelido depois da checagem em tempo real.
    supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'rapido', apelido: 'novo_torcedor' }));
    await user.click(entrar);

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
