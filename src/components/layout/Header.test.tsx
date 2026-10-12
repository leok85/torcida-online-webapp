import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp';
import { perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';

const outro = (id: string, campos: Parameters<typeof perfilDeTeste>[0] = {}) =>
  supabaseFalso.adicionarPerfil(perfilDeTeste({ id, apelido: `Torcedor_${id}`, ...campos }));

const topo = () => screen.findByRole('banner');

describe('topo · dados reais do clube', () => {
  it('conta os torcedores do clube na plataforma e mostra a posição na liga principal', async () => {
    outro('u2'); // Palmeiras
    outro('u3'); // Palmeiras
    outro('u4', { onboarding_concluido_em: null }); // ainda no onboarding: não conta
    outro('u5', { time_id: 160 }); // Flamengo
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/');
    expect(await within(await topo()).findByText('3 torcedores · 2º no Brasileirão Série A')).toBeInTheDocument();
    expect(supabaseFalso.cliente.rpc).toHaveBeenCalledWith('resumo_do_clube', { clube: 162 });
  });

  it('usa o singular e o artigo da liga', async () => {
    supabaseFalso.logar(perfilDeTeste({ pais: 'ES', time_id: 9101 }));
    renderApp('/');
    expect(await within(await topo()).findByText('1 torcedor · 1º na LaLiga')).toBeInTheDocument();
  });

  it('sem classificação da liga, mostra só os torcedores', async () => {
    supabaseFalso.logar(perfilDeTeste({ time_id: 809 })); // Goiás, Série B sem tabela no teste
    renderApp('/');
    expect(await within(await topo()).findByText('1 torcedor')).toBeInTheDocument();
  });

  it('se o resumo falhar, o topo segue sem os números', async () => {
    const rpcOriginal = supabaseFalso.cliente.rpc.getMockImplementation()!;
    supabaseFalso.cliente.rpc.mockImplementation(async (fn: string, args?: unknown) =>
      fn === 'resumo_do_clube' ? { data: null, error: { message: 'offline' } } : rpcOriginal(fn, args),
    );
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/');
    expect(await within(await topo()).findByText('Palmeiras')).toBeInTheDocument();
    expect(await topo()).not.toHaveTextContent('torcedor');
  });
});
