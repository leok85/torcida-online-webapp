import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUSCAR_NOVAS_MS } from '../../data/chat';
import { partidaDeTeste } from '../../test/catalogoDeTeste';
import { detalhesDeTeste } from '../../test/jogoDeTeste';
import { renderApp } from '../../test/renderApp';
import { assinaturaDeTeste, perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';

// O perfil de teste torce para o Palmeiras (162); partidaDeTeste é Palmeiras 1 x 0 Corinthians aos 67' do 2º tempo.
const encerrada = () => partidaDeTeste({ status: 'encerrada', periodo: null, minuto: null, gols_mandante: 4, gols_visitante: 1 });

function abrir({ partida = partidaDeTeste(), detalhes = detalhesDeTeste(), membro = true, perfil = perfilDeTeste() } = {}) {
  supabaseFalso.adicionarPartida(partida);
  supabaseFalso.definirDetalhes(partida.id, detalhes);
  if (membro) supabaseFalso.assinar(assinaturaDeTeste());
  supabaseFalso.logar(perfil);
  return renderApp(`/jogo/${partida.id}`);
}

/** Abre o jogo e espera a coluna do chat aparecer. */
async function abrirChat(opcoes?: Parameters<typeof abrir>[0]) {
  const r = abrir(opcoes);
  await screen.findByRole('region', { name: 'Chat da torcida' });
  return r;
}
const chat = () => screen.getByRole('region', { name: 'Chat da torcida' });
const mensagens = () => within(chat()).getByRole('log', { name: 'Mensagens da torcida' });

afterEach(() => vi.useRealTimers());

describe('página do jogo (W02 · ao vivo e chat)', () => {
  it('ao vivo: faixa do jogo, placar, minuto e as abas com o pós-jogo fechado até o apito final', async () => {
    abrir();
    expect(await screen.findByLabelText('Placar: 1 a 0')).toBeInTheDocument();
    expect(screen.getByText('AO VIVO', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Palmeiras 1 x 0 Corinthians')).toBeInTheDocument();
    expect(screen.getByText("67' · 2º tempo")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para Jogos' })).toHaveAttribute('href', '/jogos');
    expect(screen.getByText('Ao vivo e chat').closest('[aria-current]')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Escalação e palpite/ })).toHaveAttribute('href', '/escalacao');
    expect(screen.queryByRole('link', { name: /Pós-jogo e notas/ })).not.toBeInTheDocument();
    expect(screen.getByText('Pós-jogo e notas').closest('[aria-disabled]')).toHaveAttribute('title', 'Abre no apito final');
  });

  it('números da partida com os dois lados e a barra de cada um', async () => {
    abrir();
    const numeros = await screen.findByRole('region', { name: 'Números da partida' });
    await within(numeros).findByText('Posse de bola');
    const posse = within(numeros).getByText('Posse de bola').parentElement!;
    expect(posse).toHaveTextContent('58%Posse de bola42%');
    expect(within(numeros).getByText('Finalizações').parentElement).toHaveTextContent('11Finalizações6');
    expect(within(numeros).getByText('Passes certos').parentElement).toHaveTextContent('86%Passes certos74%');
    // A BSD não mandou impedimentos: a linha some.
    expect(within(numeros).queryByText('Impedimentos')).not.toBeInTheDocument();
  });

  it('lances do mais recente ao mais antigo, com o time de cada um', async () => {
    abrir();
    const lances = await screen.findByRole('region', { name: 'Lances do jogo' });
    await within(lances).findAllByRole('listitem');
    expect(within(lances).getAllByRole('listitem').map((l) => l.textContent?.replace(/sports_soccer|square|swap_horiz/, ''))).toEqual([
      "58'Entra R. Sosa, sai V. RoquePalmeiras",
      "41'Amarelo para RanieleCorinthians",
      "16'Gol de A. Barboza, assistência de L. EvangelistaPalmeiras",
    ]);
  });

  it('escalação oficial do meu time no campo, com gol, substituição e cartão; dá para ver a do adversário', async () => {
    const { user } = abrir();
    expect(await screen.findByText('Formação 3-4-2-1')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Palmeiras' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('A. Barboza').nextSibling).toHaveTextContent("gol 16'");
    expect(screen.getByText('R. Sosa').nextSibling).toHaveTextContent("entrou 58'");
    expect(screen.queryByText('V. Roque')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Corinthians' }));
    expect(screen.getByText('Formação 4-1-3-2')).toBeInTheDocument();
    expect(screen.getByText('Raniele').nextSibling).toHaveTextContent('amarelo');
  });

  it('encerrado: selo, fim de jogo e o pós-jogo liberado', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-11T23:00:00Z'), shouldAdvanceTime: true });
    abrir({ partida: encerrada() });
    expect(await screen.findByLabelText('Placar: 4 a 1')).toBeInTheDocument();
    expect(screen.getByText('Fim de jogo')).toBeInTheDocument();
    expect(screen.getByText('ENCERRADO', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pós-jogo e notas/ })).toHaveAttribute('href', '/pos-jogo');
  });

  it('sem os detalhes da BSD ainda, avisa em cada bloco', async () => {
    abrir({ detalhes: { estatisticas: null, lances: [], escalacoes: null } });
    expect(await screen.findByText('Os números deste jogo ainda não chegaram.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum lance ainda.')).toBeInTheDocument();
    expect(screen.getByText('A escalação oficial aparece cerca de 1 h antes do jogo.')).toBeInTheDocument();
  });

  it('jogo que não existe', async () => {
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/jogo/999');
    expect(await screen.findByText('Não achamos esse jogo.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver os jogos' })).toHaveAttribute('href', '/jogos');
  });

  it('ao vivo, o placar é relido sozinho', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const partida = supabaseFalso.adicionarPartida(partidaDeTeste());
    supabaseFalso.logar(perfilDeTeste());
    renderApp('/jogo/7290');
    expect(await screen.findByLabelText('Placar: 1 a 0')).toBeInTheDocument();
    partida.gols_visitante = 1;
    partida.minuto = 70;
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(await screen.findByLabelText('Placar: 1 a 1')).toBeInTheDocument();
    expect(screen.getByText("70' · 2º tempo")).toBeInTheDocument();
  });

  it('/ao-vivo (links antigos) abre o jogo do clube em campo', async () => {
    supabaseFalso.adicionarPartida(partidaDeTeste());
    supabaseFalso.logar(perfilDeTeste());
    const { local } = renderApp('/ao-vivo');
    await waitFor(() => expect(local()).toBe('/jogo/7290'));
  });
});

describe('chat da torcida', () => {
  it('quem não é membro vê o placar e o convite para assinar no lugar do chat', async () => {
    await abrirChat({ membro: false });
    await screen.findByLabelText('Placar: 1 a 0');
    expect(within(chat()).getByText('SÓ PARA MEMBROS')).toBeInTheDocument();
    expect(within(chat()).getByRole('link', { name: /Ver planos/ })).toHaveAttribute('href', '/assinar');
    expect(supabaseFalso.cliente.channel).not.toHaveBeenCalled();
  });

  it('mostra o histórico da minha torcida, as minhas à direita, e quantos estão online', async () => {
    supabaseFalso.definirOnline(3);
    supabaseFalso.mensagemDaTorcida({ texto: 'Vamo Verdão!' });
    supabaseFalso.mensagemDaTorcida({ texto: 'só falo com a minha torcida', clube_id: 167, autor_apelido: 'Fiel' });
    supabaseFalso.mensagemDaTorcida({ texto: 'palpite 2-1 tá vivo', autor_id: 'usuario-1', autor_apelido: 'Rafa_9' });
    await abrirChat();
    await within(chat()).findByText('Vamo Verdão!');
    expect(within(mensagens()).getByText('Bia.T')).toBeInTheDocument();
    expect(within(mensagens()).queryByText('só falo com a minha torcida')).not.toBeInTheDocument();
    // A minha mensagem não repete o apelido.
    expect(within(mensagens()).queryByText('Rafa_9')).not.toBeInTheDocument();
    expect(within(mensagens()).getByText('palpite 2-1 tá vivo')).toBeInTheDocument();
    expect(within(chat()).getByText('3 online')).toBeInTheDocument();
  });

  it('envia a mensagem e ela aparece uma vez só (vem também pelo tempo real)', async () => {
    const { user } = await abrirChat();
    const campo = await within(chat()).findByRole('textbox', { name: 'Mensagem para a torcida' });
    expect(await within(chat()).findByText('Ninguém falou ainda. Abre a conversa!')).toBeInTheDocument();
    expect(within(chat()).getByRole('button', { name: 'Enviar' })).toBeDisabled();
    await user.type(campo, '  Que golaço do Barboza  {Enter}');
    expect(await within(mensagens()).findByText('Que golaço do Barboza')).toBeInTheDocument();
    expect(within(mensagens()).getAllByText('Que golaço do Barboza')).toHaveLength(1);
    expect(campo).toHaveValue('');
    expect(supabaseFalso.mensagensDoChat()[0]).toMatchObject({ autor_id: 'usuario-1', autor_apelido: 'Rafa_9', clube_id: 162, texto: 'Que golaço do Barboza' });
  });

  it('mensagem nova de outro torcedor chega na hora', async () => {
    await abrirChat();
    await within(chat()).findByText('Ninguém falou ainda. Abre a conversa!');
    act(() => void supabaseFalso.mensagemDaTorcida({ texto: 'GOL! Agora é virada' }));
    expect(await within(mensagens()).findByText('GOL! Agora é virada')).toBeInTheDocument();
  });

  it('sem tempo real, busca as novas de tempos em tempos', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    supabaseFalso.derrubarTempoReal();
    await abrirChat();
    await within(chat()).findByText('Ninguém falou ainda. Abre a conversa!');
    supabaseFalso.mensagemDaTorcida({ texto: 'chegou pela busca' });
    await act(() => vi.advanceTimersByTimeAsync(BUSCAR_NOVAS_MS));
    expect(await within(mensagens()).findByText('chegou pela busca')).toBeInTheDocument();
  });

  it('duas mensagens seguidas rápido: avisa para ir com calma', async () => {
    const { user } = await abrirChat();
    const campo = await within(chat()).findByRole('textbox', { name: 'Mensagem para a torcida' });
    await user.type(campo, 'uma{Enter}');
    await within(mensagens()).findByText('uma');
    await user.type(campo, 'duas{Enter}');
    expect(await within(chat()).findByRole('alert')).toHaveTextContent('Calma, uma mensagem de cada vez.');
    expect(campo).toHaveValue('duas');
  });

  it('2 h depois do fim do jogo o chat fecha, mas o histórico continua', async () => {
    supabaseFalso.mensagemDaTorcida({ texto: 'que jogo' });
    vi.useFakeTimers({ now: new Date('2026-10-12T15:00:00Z'), shouldAdvanceTime: true });
    await abrirChat({ partida: encerrada() });
    expect(await within(mensagens()).findByText('que jogo')).toBeInTheDocument();
    expect(within(chat()).getByText('O chat fechou 2 h depois do apito final.')).toBeInTheDocument();
    expect(within(chat()).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('torcedor de outro clube não entra no chat deste jogo', async () => {
    await abrirChat({ perfil: perfilDeTeste({ time_id: 160 }) });
    await screen.findByLabelText('Placar: 1 a 0');
    expect(within(chat()).getByText('O chat é da torcida dos times em campo.')).toBeInTheDocument();
    expect(supabaseFalso.cliente.channel).not.toHaveBeenCalled();
  });

  it('sair da página fecha o canal de tempo real', async () => {
    const { user } = await abrirChat();
    await within(chat()).findByText('Ninguém falou ainda. Abre a conversa!');
    await user.click(screen.getByRole('link', { name: 'Voltar para Jogos' }));
    await waitFor(() => expect(supabaseFalso.cliente.removeChannel).toHaveBeenCalled());
  });
});
