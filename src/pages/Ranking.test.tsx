import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { assinaturaDeTeste, perfilDeTeste, supabaseFalso } from '../test/supabaseFalso';

const AGORA = '2026-10-14T15:00:00Z';

/** Torcedores com cadastro concluído; `novo` = escolheu o clube nesta semana. */
function torcida(clube: number, quantos: number, { novos = 0, semCadastro = 0 } = {}) {
  for (let i = 0; i < quantos + semCadastro; i++) {
    supabaseFalso.adicionarPerfil(
      perfilDeTeste({
        id: `t-${clube}-${i}`,
        apelido: `t${clube}_${i}`,
        time_id: clube,
        time_trocado_em: i < novos ? '2026-10-13T12:00:00Z' : null,
        onboarding_concluido_em: i < quantos ? '2026-08-01T12:00:00Z' : null,
      }),
    );
  }
}

function abrir() {
  supabaseFalso.assinar(assinaturaDeTeste());
  supabaseFalso.logar(perfilDeTeste({ onboarding_concluido_em: '2026-08-01T12:00:00Z' })); // Palmeiras
  return renderApp('/ranking');
}

const linhas = (regiao: HTMLElement) =>
  within(regiao)
    .getAllByText(/^\d+º$/)
    .map((pos) => pos.parentElement!);

beforeEach(() => vi.useFakeTimers({ now: new Date(AGORA), shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('Maiores torcidas', () => {
  it('conta os torcedores do app por clube, no país do meu clube e no mundo, com o meu clube mesmo fora do top', async () => {
    torcida(160, 4, { novos: 1 }); // Flamengo
    torcida(9001, 3); // Boca Juniors
    torcida(9101, 3); // Real Madrid
    torcida(167, 2, { semCadastro: 5 }); // Corinthians: quem não concluiu o cadastro não conta
    torcida(809, 2); // Goiás
    torcida(9002, 2); // River Plate
    torcida(158, 2); // São Paulo
    const { user } = abrir();

    const regiao = (await screen.findByRole('heading', { name: 'Maiores torcidas' })).closest('section')!;
    await waitFor(() => expect(linhas(regiao)).toHaveLength(5));
    // Brasil, a aba de abertura: o meu Palmeiras (só eu) em 5º.
    expect(linhas(regiao).map((l) => l.textContent)).toEqual([
      '1ºFlamengoBrasil4+1 na semana',
      '2ºCorinthiansBrasil2',
      '3ºGoiásBrasil2',
      '4ºSão PauloBrasil2',
      '5ºPalmeirasBrasil1',
    ]);
    expect(linhas(regiao)[4]).toHaveAttribute('aria-current', 'true');

    // Mundo: top 6 e o Palmeiras no fim, em 8º.
    await user.click(within(regiao).getByRole('tab', { name: 'Mundo' }));
    expect(linhas(regiao).map((l) => l.textContent?.match(/^\d+º\D+?(?=Brasil|Argentina|Espanha)/)?.[0])).toEqual([
      '1ºFlamengo',
      '2ºBoca Juniors',
      '3ºReal Madrid',
      '4ºCorinthians',
      '5ºGoiás',
      '6ºRiver Plate',
      '8ºPalmeiras',
    ]);
    expect(within(regiao).getByRole('tab', { name: 'Brasil' })).toBeInTheDocument();
  });

  it('sem ninguém no app além de mim, o meu clube lidera nos dois escopos', async () => {
    const { user } = abrir();
    const regiao = (await screen.findByRole('heading', { name: 'Maiores torcidas' })).closest('section')!;
    await waitFor(() => expect(linhas(regiao).map((l) => l.textContent)).toEqual(['1ºPalmeirasBrasil1']));
    await user.click(within(regiao).getByRole('tab', { name: 'Mundo' }));
    expect(linhas(regiao).map((l) => l.textContent)).toEqual(['1ºPalmeirasBrasil1']);
  });

  it('erro ao carregar avisa em vez de mostrar a lista', async () => {
    const original = supabaseFalso.cliente.rpc.getMockImplementation()!;
    supabaseFalso.cliente.rpc.mockImplementation(async (fn: string, args?: unknown) =>
      fn === 'maiores_torcidas' ? ({ data: null, error: { message: 'falhou' } } as never) : original(fn, args as never),
    );
    abrir();
    expect(await screen.findByText('Não deu para carregar as torcidas agora.')).toBeInTheDocument();
  });
});
