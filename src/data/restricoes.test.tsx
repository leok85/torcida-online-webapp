import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { partidaDeTeste } from '../test/catalogoDeTeste';
import { detalhesDeTeste } from '../test/jogoDeTeste';
import { renderApp } from '../test/renderApp';
import { assinaturaDeTeste, perfilDeTeste, supabaseFalso } from '../test/supabaseFalso';
import { MENSAGEM_SUSPENSO, textoDoSilencio } from './restricoes';

// Domingo 11/10, Palmeiras 1 x 0 Corinthians ao vivo (7290): chat e envio de fotos abertos.
const AO_VIVO = '2026-10-11T21:40:00Z';
const ATE = '2026-10-17T18:00:00Z'; // sáb 17/10 15:00 em Brasília

function restringir(tipo: 'silencio' | 'suspensao', ate = ATE) {
  supabaseFalso.restricoes().push({ usuario_id: 'usuario-1', tipo, ate });
}

function abrir(rota: string) {
  const partida = partidaDeTeste();
  supabaseFalso.adicionarPartida(partida);
  supabaseFalso.definirDetalhes(partida.id, detalhesDeTeste());
  supabaseFalso.assinar(assinaturaDeTeste());
  supabaseFalso.logar(perfilDeTeste());
  return renderApp(rota);
}

const chat = () => screen.findByRole('region', { name: 'Chat da torcida' });

afterEach(() => vi.useRealTimers());

describe('silenciado e suspenso', () => {
  it('texto do silêncio no horário de Brasília', () => {
    expect(textoDoSilencio(new Date(ATE))).toBe('Você está silenciado até 17/10 15:00');
  });

  it('silenciado lê o chat, mas o campo dá lugar ao aviso com o prazo', async () => {
    vi.useFakeTimers({ now: new Date(AO_VIVO), shouldAdvanceTime: true });
    restringir('silencio');
    supabaseFalso.mensagemDaTorcida({ texto: 'Vamo, Verdão!' });
    abrir('/jogo/7290');
    const painel = await chat();
    expect(await within(painel).findByText('Vamo, Verdão!')).toBeInTheDocument();
    expect(await within(painel).findByRole('status')).toHaveTextContent('Você está silenciado até 17/10 15:00');
    expect(within(painel).queryByRole('textbox', { name: 'Mensagem para a torcida' })).not.toBeInTheDocument();
  });

  it('silêncio aplicado com o chat aberto: o banco barra o envio e o chat explica', async () => {
    vi.useFakeTimers({ now: new Date(AO_VIVO), shouldAdvanceTime: true });
    const { user } = abrir('/jogo/7290');
    const campo = await within(await chat()).findByRole('textbox', { name: 'Mensagem para a torcida' });
    restringir('silencio');
    await user.type(campo, 'Juiz ladrão');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    // O banco recusou: o chat relê as restrições e o campo dá lugar ao aviso com o prazo.
    expect(await within(await chat()).findByRole('status')).toHaveTextContent('Você está silenciado até 17/10 15:00');
    expect(supabaseFalso.mensagensDoChat()).toHaveLength(0);
  });

  it('silêncio que já acabou não trava nada', async () => {
    vi.useFakeTimers({ now: new Date(AO_VIVO), shouldAdvanceTime: true });
    restringir('silencio', '2026-10-11T20:00:00Z');
    abrir('/jogo/7290');
    expect(await within(await chat()).findByRole('textbox', { name: 'Mensagem para a torcida' })).toBeInTheDocument();
  });

  it('silenciado não envia foto, mas ainda dá joinha', async () => {
    vi.useFakeTimers({ now: new Date(AO_VIVO), shouldAdvanceTime: true });
    restringir('silencio');
    supabaseFalso.fotosDaTorcida().fotos.push({
      id: 'f1', partida_id: 7290, clube_id: 162, autor_id: 't1', autor_apelido: 'Bia.T', momento: 'durante', etiqueta: '1º tempo',
      caminho: '7290/162/t1/foto.webp', legenda: 'Setor norte', curtidas: 3, denuncias: 0, oculta: false, criado_em: '2026-10-11T21:00:00Z',
    });
    supabaseFalso.fotosDaTorcida().fotos.push({
      id: 'f2', partida_id: 7290, clube_id: 162, autor_id: 't2', autor_apelido: 'gustavo.b', momento: 'durante', etiqueta: '1º tempo',
      caminho: '7290/162/t2/foto.webp', legenda: 'Bandeirão', curtidas: 1, denuncias: 0, oculta: false, criado_em: '2026-10-11T21:05:00Z',
    });
    const { user } = abrir('/jogo/7290/fotos');
    await waitFor(() => expect(screen.getByRole('button', { name: /Enviar foto/ })).toBeDisabled());
    expect(screen.getByText('Você está silenciado até 17/10 15:00', { selector: 'p' })).toBeInTheDocument();
    const cartao = (await screen.findByText('gustavo.b')).closest('li')!;
    await user.click(within(cartao).getByRole('button', { name: /Dar joinha/ }));
    expect(await within(cartao).findByRole('button', { name: /Tirar joinha/ })).toBeInTheDocument();
  });

  // Suspensão aplicada com a tela aberta, antes da próxima troca de tela: o banco recusa e a tela explica.
  it('suspenso com o token ainda válido: o palpite é recusado com a mensagem da suspensão', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-14T12:00:00Z'), shouldAdvanceTime: true });
    supabaseFalso.adicionarPartida(partidaDeTeste({ id: 7301, inicio: '2026-10-15T00:30:00Z', status: 'agendada', periodo: null, minuto: null, gols_mandante: null, gols_visitante: null, gols: [] }));
    supabaseFalso.assinar(assinaturaDeTeste());
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/jogo/7301/escalacao');
    await screen.findByRole('button', { name: 'GOL: C. Miguel' });
    restringir('suspensao');
    await user.click(screen.getByRole('button', { name: /Confirmar escalação e palpite/ }));
    expect(await screen.findByText(MENSAGEM_SUSPENSO)).toBeInTheDocument();
    expect(supabaseFalso.palpites()).toHaveLength(0);
  });

  it('suspenso: o envio no chat é recusado e o campo dá lugar à suspensão', async () => {
    vi.useFakeTimers({ now: new Date(AO_VIVO), shouldAdvanceTime: true });
    const { user } = abrir('/jogo/7290');
    const campo = await within(await chat()).findByRole('textbox', { name: 'Mensagem para a torcida' });
    restringir('suspensao');
    await user.type(campo, 'Vamo');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await within(await chat()).findByRole('status')).toHaveTextContent(MENSAGEM_SUSPENSO);
  });

  it('suspenso não envia feedback', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/conta/feedback');
    await user.click(await screen.findByRole('button', { name: /Sugestão/ }));
    await user.type(screen.getByRole('textbox'), 'Poder filtrar o chat só pelos lances.');
    restringir('suspensao', '2099-01-01T00:00:00Z');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM_SUSPENSO);
    expect(supabaseFalso.feedbacks()).toHaveLength(0);
  });
});

describe('restrições com o app aberto', () => {
  it('suspensão aplicada com o app aberto: na troca de tela a sessão cai e a tela de entrar explica', async () => {
    supabaseFalso.assinar(assinaturaDeTeste());
    supabaseFalso.logar(perfilDeTeste());
    const { user, local } = renderApp('/');
    await screen.findByRole('link', { name: /Jogos/ });
    restringir('suspensao', '2099-01-01T00:00:00Z');
    await user.click(screen.getByRole('link', { name: /Jogos/ }));
    await waitFor(() => expect(local()).toBe('/entrar'));
    expect(await screen.findByText(MENSAGEM_SUSPENSO)).toBeInTheDocument();
  });

  it('o chat destrava sozinho quando o silêncio vence', async () => {
    vi.useFakeTimers({ now: new Date(AO_VIVO), shouldAdvanceTime: true });
    restringir('silencio', '2026-10-11T21:45:00Z'); // 5 min
    abrir('/jogo/7290');
    const painel = await chat();
    expect(await within(painel).findByRole('status')).toHaveTextContent('Você está silenciado até 11/10 18:45');
    await act(() => vi.advanceTimersByTimeAsync(6 * 60_000));
    expect(await within(painel).findByRole('textbox', { name: 'Mensagem para a torcida' })).toBeInTheDocument();
  });
});
