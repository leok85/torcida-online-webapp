import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp';
import { perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';
import { dataPorExtenso } from './TrocarDeTime';

const confirmar = () => screen.getByRole('button', { name: 'Confirmar troca definitiva' });

describe('trocar de time (/conta/time)', () => {
  it('abre pelo menu da conta, com o time atual e o aviso da troca única', async () => {
    supabaseFalso.logar(perfilDeTeste({ onboarding_concluido_em: '2024-03-12T15:00:00Z' }));
    const { user, local } = renderApp('/jogos');
    await user.click(await screen.findByRole('button', { name: /Rafa_9/ }));
    await user.click(screen.getByRole('menuitem', { name: /Trocar de time/ }));
    expect(local()).toBe('/conta/time');
    expect(await screen.findByRole('heading', { name: 'Trocar de time' })).toBeInTheDocument();
    expect(screen.getByText(/uma única troca/)).toBeInTheDocument();
    expect(screen.getByText('TIME ATUAL').parentElement).toHaveTextContent('Palmeiras');
    expect(screen.getByText(/desde 12 mar 2024/)).toBeInTheDocument();
    expect(screen.getByText('Escolha um clube')).toBeInTheDocument();
  });

  it('lista os clubes do país sem o time atual, com busca', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/conta/time');
    const clubes = await screen.findByRole('radiogroup', { name: 'Clube' });
    expect(within(clubes).getByRole('radio', { name: /Flamengo/ })).toBeInTheDocument();
    expect(within(clubes).queryByRole('radio', { name: /Palmeiras/ })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Buscar clube' }), 'xyz');
    expect(screen.getByText('Nenhum clube encontrado.')).toBeInTheDocument();
  });

  it('só confirma com um clube escolhido e o aviso marcado; depois mostra a troca concluída', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/conta/time');
    await user.click(await screen.findByRole('radio', { name: /Flamengo/ }));
    expect(screen.getByText('NOVO TIME').parentElement).toHaveTextContent('Flamengo');
    expect(confirmar()).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Entendi que a troca é definitiva/ }));
    expect(confirmar()).toBeEnabled();
    await user.click(confirmar());

    expect(await screen.findByRole('heading', { name: 'Agora você é Flamengo' })).toBeInTheDocument();
    expect(screen.getByText('@Rafa_9')).toBeInTheDocument();
    expect(screen.getByText('Começa do zero')).toBeInTheDocument();
    const salvo = supabaseFalso.perfil('usuario-1')!;
    expect(salvo).toMatchObject({ time_id: 160, time_anterior_id: 162, pais: 'BR' });
    expect(salvo.time_trocado_em).not.toBeNull();
  });

  it('depois da troca o app remonta com o clube novo e, ao voltar, mostra a troca já usada', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/conta/time');
    await user.click(await screen.findByRole('radio', { name: /Flamengo/ }));
    await user.click(screen.getByRole('checkbox', { name: /Entendi/ }));
    await user.click(confirmar());
    expect(await screen.findByRole('heading', { name: 'Agora você é Flamengo' })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText('Flamengo')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).queryByText('Palmeiras')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ir para o início' }));
    await user.click(await screen.findByRole('button', { name: /Rafa_9/ }));
    await user.click(screen.getByRole('menuitem', { name: /Trocar de time/ }));
    expect(await screen.findByRole('heading', { name: 'Troca já utilizada' })).toBeInTheDocument();
  });

  it('clube de outro país avisa que jogos e notícias mudam de país e grava o país novo', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/conta/time');
    await user.click(await screen.findByRole('radio', { name: /Argentina/ }));
    await user.click(await screen.findByRole('radio', { name: /Boca Juniors/ }));
    expect(screen.getByText('Jogos, campeonatos e notícias passam a ser de Argentina')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Entendi/ }));
    await user.click(confirmar());
    expect(await screen.findByRole('heading', { name: 'Agora você é Boca Juniors' })).toBeInTheDocument();
    expect(supabaseFalso.perfil('usuario-1')).toMatchObject({ time_id: 9001, pais: 'AR' });
  });

  it('com a troca já usada, mostra de qual clube veio e não deixa trocar de novo', async () => {
    supabaseFalso.logar(perfilDeTeste({ time_anterior_id: 167, time_trocado_em: '2026-02-03T15:00:00Z' }));
    renderApp('/conta/time');
    expect(await screen.findByRole('heading', { name: 'Troca já utilizada' })).toBeInTheDocument();
    expect(screen.getByText(/Você trocou do Corinthians para o Palmeiras em 03\/02\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar troca definitiva' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });

  it('"Continuar no" volta para Dados da conta sem trocar', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/conta/time');
    await user.click(await screen.findByRole('button', { name: 'Continuar no Palmeiras' }));
    await waitFor(() => expect(local()).toBe('/conta/dados'));
    expect(supabaseFalso.perfil('usuario-1')).toMatchObject({ time_id: 162, time_trocado_em: null });
  });

  it('se o servidor recusar (troca usada em outro aparelho), avisa na tela', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/conta/time');
    await user.click(await screen.findByRole('radio', { name: /Flamengo/ }));
    await user.click(screen.getByRole('checkbox', { name: /Entendi/ }));
    // Outro aparelho trocou de time enquanto esta tela estava aberta.
    supabaseFalso.perfil('usuario-1')!.time_trocado_em = '2026-10-10T12:00:00Z';
    await user.click(confirmar());
    expect(await screen.findByRole('alert')).toHaveTextContent('A troca de time desta conta já foi usada.');
  });

  it('a data do time atual sai como no design', () => {
    expect(dataPorExtenso('2024-03-12T15:00:00Z')).toBe('12 mar 2024');
  });
});
