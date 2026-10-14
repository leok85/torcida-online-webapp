import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Partida, Perfil } from '../../lib/database.types';
import { partidaDeTeste } from '../../test/catalogoDeTeste';
import type { FotoDeTeste } from '../../test/fotosDeTeste';
import { renderApp } from '../../test/renderApp';
import { assinaturaDeTeste, perfilDeTeste, supabaseFalso } from '../../test/supabaseFalso';

// Palmeiras 1 x 0 Corinthians ao vivo (7290): a janela "durante" está aberta.
function abrir({ partida = partidaDeTeste(), membro = true, perfil = perfilDeTeste(), rota = '' }: { partida?: Partida; membro?: boolean; perfil?: Perfil; rota?: string } = {}) {
  supabaseFalso.adicionarPartida(partida);
  if (membro) supabaseFalso.assinar(assinaturaDeTeste());
  supabaseFalso.logar(perfil);
  return renderApp(rota || `/jogo/${partida.id}/fotos`);
}

let n = 0;
/** Foto de outro torcedor já no mural. */
function fotoDe(autor_apelido: string, curtidas: number, campos: Partial<FotoDeTeste> = {}) {
  n += 1;
  const foto: FotoDeTeste = {
    id: `f${n}`,
    partida_id: 7290,
    clube_id: 162,
    autor_id: `t${n}`,
    autor_apelido,
    momento: 'durante',
    etiqueta: '1º tempo',
    caminho: `7290/162/t${n}/foto.webp`,
    legenda: `Legenda de ${autor_apelido}`,
    curtidas,
    denuncias: 0,
    oculta: false,
    criado_em: `2026-10-11T20:4${n % 10}:00Z`,
    ...campos,
  };
  supabaseFalso.fotosDaTorcida().fotos.push(foto);
  return foto;
}

const mural = () => screen.getByRole('list', { name: 'Mural de fotos' });
const botaoEnviar = () => screen.getByRole('button', { name: /Enviar foto · \+40 XP/ });

afterEach(() => vi.useRealTimers());

describe('fotos da torcida (W07)', () => {
  it('a mais curtida em destaque, o mural com as outras e só as fotos da minha torcida', async () => {
    fotoDe('Bia.T', 12, { legenda: 'Setor norte não sentou um minuto' });
    fotoDe('Léo.Mansur', 4, { etiqueta: 'Antes do jogo', momento: 'pre' });
    fotoDe('gustavo.b', 7);
    fotoDe('Do Corinthians', 99, { clube_id: 167 });
    fotoDe('Escondida', 50, { oculta: true });
    abrir();

    const campea = await screen.findByRole('region', { name: 'Mais curtida até agora' });
    expect(campea).toHaveTextContent('Bia.T');
    expect(campea).toHaveTextContent('Setor norte não sentou um minuto');
    expect(within(campea).getByRole('img', { name: 'Setor norte não sentou um minuto' })).toHaveAttribute('src', expect.stringContaining('/sign/fotos-torcida/7290/162/'));
    expect(screen.getByText('Palmeiras 1 x 0 Corinthians · ao vivo · 3 fotos')).toBeInTheDocument();

    const cartoes = within(mural()).getAllByRole('listitem');
    expect(cartoes.map((c) => c.textContent)).toEqual([
      expect.stringContaining('gustavo.b'),
      expect.stringContaining('Léo.Mansur'),
    ]);
    expect(cartoes[1]).toHaveTextContent('Antes do jogo');
    expect(screen.queryByText('Do Corinthians')).not.toBeInTheDocument();
    expect(screen.queryByText('Escondida')).not.toBeInTheDocument();
  });

  it('envia uma foto: escolhe, marca o momento, legenda, confirma as regras e ela entra no mural', async () => {
    fotoDe('Bia.T', 12);
    const { user } = abrir();
    await user.click(await screen.findByRole('button', { name: /Enviar foto · \+40 XP/ }));
    const janela = screen.getByRole('dialog', { name: 'Enviar foto' });
    expect(janela).toHaveTextContent('Palmeiras 1 x 0 Corinthians · 0 de 3 fotos neste jogo');
    expect(janela).toHaveTextContent('Vale foto sua do jogo: estádio, bar, sofá. Nada de imagem da transmissão.');

    await user.upload(screen.getByTestId('arquivo-da-foto-da-torcida'), new File(['foto'], 'IMG_2041.jpg', { type: 'image/jpeg' }));
    expect(janela).toHaveTextContent('IMG_2041.jpg');
    const enviar = within(janela).getByRole('button', { name: /Enviar foto/ });
    expect(enviar).toBeDisabled();
    expect(janela).toHaveTextContent('escolha o momento do jogo');

    await user.click(within(janela).getByRole('radio', { name: '2º tempo' }));
    expect(janela).toHaveTextContent('confirme as regras');
    await user.type(within(janela).getByLabelText(/Legenda/), 'Arquibancada lotada no 2º gol');
    expect(janela).toHaveTextContent('29/80');
    await user.click(within(janela).getByRole('checkbox', { name: 'A foto é minha e segue as regras da comunidade' }));
    expect(janela).toHaveTextContent('pronto para enviar');
    await user.click(enviar);

    const pronto = await screen.findByRole('dialog', { name: 'Foto publicada' });
    expect(pronto).toHaveTextContent('Ela já está no mural deste jogo. As mais curtidas entram nas melhores fotos.');
    expect(pronto).toHaveTextContent('1 de 3 fotos neste jogo');
    const [minha] = supabaseFalso.fotosDaTorcida().fotos.filter((f) => f.autor_id === 'usuario-1');
    expect(minha).toMatchObject({ partida_id: 7290, clube_id: 162, momento: 'durante', etiqueta: '2º tempo', legenda: 'Arquibancada lotada no 2º gol' });
    expect(minha.caminho).toMatch(/^7290\/162\/usuario-1\/.+\.jpg$/);
    expect(supabaseFalso.fotos()).toContain(minha.caminho);

    await user.click(within(pronto).getByRole('button', { name: 'Ver no mural' }));
    expect(await within(mural()).findByText('Rafa_9 (você)')).toBeInTheDocument();
    // Uma foto por janela: o botão trava e explica.
    expect(botaoEnviar()).toBeDisabled();
    expect(screen.getByText('Você já enviou a foto do jogo ao vivo.')).toBeInTheDocument();
    // Na própria foto não vale joinha nem denúncia.
    const cartao = within(mural()).getByText('Rafa_9 (você)').closest('li')!;
    expect(within(cartao).getByRole('button', { name: /Sua foto/ })).toBeDisabled();
    expect(within(cartao).queryByRole('button', { name: /Denunciar/ })).not.toBeInTheDocument();
  });

  it('recusa arquivo que não é JPG ou PNG', async () => {
    const { user } = abrir();
    await user.click(await screen.findByRole('button', { name: /Enviar foto · \+40 XP/ }));
    // O seletor do sistema filtra pelo accept, mas arrastar ou forçar um arquivo ainda chega aqui.
    fireEvent.change(screen.getByTestId('arquivo-da-foto-da-torcida'), { target: { files: [new File(['gif'], 'anim.gif', { type: 'image/gif' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Use uma imagem JPG ou PNG.');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('dá e tira joinha', async () => {
    fotoDe('Bia.T', 12);
    fotoDe('gustavo.b', 7);
    const { user } = abrir();
    const cartao = (await within(await screen.findByRole('list', { name: 'Mural de fotos' })).findByText('gustavo.b')).closest('li')!;
    await user.click(within(cartao).getByRole('button', { name: 'Dar joinha · 7 joinhas' }));
    expect(within(cartao).getByRole('button', { name: 'Tirar joinha · 8 joinhas' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(cartao).getByRole('button', { name: 'Tirar joinha · 8 joinhas' }));
    expect(within(cartao).getByRole('button', { name: 'Dar joinha · 7 joinhas' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('até 20 joinhas por jogo', async () => {
    fotoDe('Bia.T', 12);
    const outra = fotoDe('gustavo.b', 7);
    for (let i = 0; i < 20; i++) supabaseFalso.fotosDaTorcida().joinhas.push({ foto_id: `x${i}`, usuario_id: 'usuario-1', partida_id: 7290 });
    const { user } = abrir();
    const cartao = (await within(await screen.findByRole('list', { name: 'Mural de fotos' })).findByText('gustavo.b')).closest('li')!;
    await user.click(within(cartao).getByRole('button', { name: /Dar joinha/ }));
    expect(await screen.findByText('Você já deu os 20 joinhas deste jogo.')).toBeInTheDocument();
    expect(outra.curtidas).toBe(7);
  });

  it('denuncia: pede confirmação e a foto some para quem denunciou', async () => {
    fotoDe('Bia.T', 12);
    const ruim = fotoDe('gustavo.b', 7);
    const { user } = abrir();
    await user.click(await screen.findByRole('button', { name: 'Denunciar a foto de gustavo.b' }));
    const janela = screen.getByRole('dialog', { name: 'Denunciar foto' });
    expect(janela).toHaveTextContent('A foto de gustavo.b some para você agora. Com 3 denúncias ela sai do mural de todos.');
    await user.click(within(janela).getByRole('button', { name: 'Denunciar' }));
    await waitFor(() => expect(screen.queryByText('gustavo.b')).not.toBeInTheDocument());
    expect(screen.getByText('Denúncia enviada. A foto não aparece mais para você.')).toBeInTheDocument();
    expect(ruim.denuncias).toBe(1);
    expect(supabaseFalso.fotosDaTorcida().denuncias).toEqual([{ foto_id: ruim.id, usuario_id: 'usuario-1' }]);
  });

  it('antes de abrir: botão travado, mural vazio e o aviso do horário', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-13T12:00:00Z'), shouldAdvanceTime: true });
    abrir({ partida: partidaDeTeste({ id: 7301, inicio: '2026-10-15T00:30:00Z', status: 'agendada', periodo: null, minuto: null, gols_mandante: null, gols_visitante: null }) });
    expect(await screen.findByText('Nenhuma foto ainda')).toBeInTheDocument();
    expect(screen.getByText('O envio abre 1 h antes do apito.')).toBeInTheDocument();
    expect(botaoEnviar()).toBeDisabled();
    expect(screen.getByText('O envio abre 1 h antes do apito e fecha 1 h depois.', { selector: 'p' })).toBeInTheDocument();
  });

  it('depois da última janela: a foto campeã e os joinhas fechados', async () => {
    fotoDe('Bia.T', 12);
    fotoDe('gustavo.b', 7);
    abrir({ partida: partidaDeTeste({ status: 'encerrada', periodo: null, minuto: null, encerrada_em: '2026-10-11T22:25:00Z' }) });
    const campea = await screen.findByRole('region', { name: 'Foto campeã do jogo' });
    expect(within(campea).getByRole('button', { name: /joinhas/ })).toBeDisabled();
    expect(botaoEnviar()).toBeDisabled();
  });

  it('torcedor de outro clube não vê nem envia', async () => {
    abrir({ perfil: perfilDeTeste({ time_id: 160 }) });
    expect(await screen.findByText('As fotos são da torcida dos times em campo.', { selector: 'p' })).toBeInTheDocument();
    expect(botaoEnviar()).toBeDisabled();
  });

  it('quem não é membro vê o bloqueio de "Fotos"', async () => {
    abrir({ membro: false });
    expect(await screen.findByRole('heading', { name: 'Fotos' })).toBeInTheDocument();
    expect(screen.getByText('SÓ PARA MEMBROS')).toBeInTheDocument();
  });

  it('/fotos abre o jogo com o envio aberto', async () => {
    const { local } = abrir({ rota: '/fotos' });
    await waitFor(() => expect(local()).toBe('/jogo/7290/fotos'));
  });
});
