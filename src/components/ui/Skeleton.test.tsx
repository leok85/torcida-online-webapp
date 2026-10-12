import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp';
import { perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';
import { Skeleton, SkeletonEscudo } from './Skeleton';

/** Faz uma tabela do Supabase falso ficar "carregando" para sempre (a promessa nunca resolve). */
function segurar(tabelaOuRpc: string) {
  const nunca = new Promise(() => {});
  const fromOriginal = supabaseFalso.cliente.from.getMockImplementation()!;
  const rpcOriginal = supabaseFalso.cliente.rpc.getMockImplementation()!;
  const pendente: Record<string, unknown> = {};
  for (const m of ['select', 'or', 'order', 'in', 'eq']) pendente[m] = () => pendente;
  pendente.then = (...args: Parameters<Promise<unknown>['then']>) => nunca.then(...args);
  supabaseFalso.cliente.from.mockImplementation((t: string) => (t === tabelaOuRpc ? pendente : fromOriginal(t)));
  supabaseFalso.cliente.rpc.mockImplementation((fn: string, args?: unknown) => (fn === tabelaOuRpc ? nunca : rpcOriginal(fn, args)));
}

describe('Skeleton', () => {
  it('é decorativo (aria-hidden) e aceita tamanho, raio e o tom escuro', () => {
    const { container } = render(
      <>
        <Skeleton w={120} h={24} r="pilula" />
        <Skeleton tom="escuro" w="50%" />
        <SkeletonEscudo width={60} height={68} />
      </>,
    );
    const [pilula, escuro, escudo] = container.querySelectorAll('span');
    expect(pilula).toHaveAttribute('aria-hidden', 'true');
    expect(pilula).toHaveStyle({ width: '120px', height: '24px', borderRadius: '999px' });
    expect(escuro.className).toMatch(/escuro/);
    expect(escudo).toHaveStyle({ width: '60px', height: '68px', borderRadius: '9px 9px 26px 26px' });
  });
});

describe('estados de carregamento', () => {
  it('abertura do app enquanto a sessão carrega', () => {
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/');
    expect(screen.getByRole('progressbar', { name: 'Carregando a Torcida Online' })).toBeInTheDocument();
  });

  it('card do jogo no Início: skeleton no mesmo cartão, avisando o leitor de tela', async () => {
    segurar('partidas');
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/');
    const card = await screen.findByRole('region', { name: 'Jogo do Palmeiras' });
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(within(card).getByText('Carregando o jogo…')).toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });

  it('topo: barrinhas no lugar de torcedores e posição enquanto o resumo carrega', async () => {
    segurar('resumo_do_clube');
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/');
    const topo = await screen.findByRole('banner');
    expect(within(topo).getByText('Carregando torcedores e posição')).toBeInTheDocument();
    expect(topo).not.toHaveTextContent('torcedores ·');
  });

  it('Jogos mostra o skeleton da faixa e das listas enquanto os jogos carregam', async () => {
    segurar('partidas');
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/jogos');
    expect(await screen.findByText('Carregando os jogos…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Próximos' })).toBeInTheDocument();
  });

  it('Campeonatos mostra o skeleton enquanto as competições carregam', async () => {
    segurar('competicoes');
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/campeonatos');
    expect(await screen.findByText('Carregando os campeonatos…')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
