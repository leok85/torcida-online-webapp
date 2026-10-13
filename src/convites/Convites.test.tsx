import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';
import { perfilDeTeste, perfilNovo, supabaseFalso } from '../test/supabaseFalso';
import { guardarConvitePendente, lerConvitePendente } from './convites';

type User = ReturnType<typeof renderApp>['user'];

/** Léo.Mansur, torcedor do Flamengo, dono do convite que o Rafa vai usar. */
const LEO = () => perfilDeTeste({ id: 'usuario-2', apelido: 'Leo.Mansur', time_id: 160 });

const convidadoPorMim = { convidado_por: 'usuario-1' };

async function abrirConvite(user: User) {
  await user.click(await screen.findByRole('button', { name: /Convidar amigos/ }));
  return screen.getByRole('dialog', { name: 'Chame a torcida e ganhe junto' });
}

const convidados = () => screen.getByRole('region', { name: 'Seus convidados' });
const campoDeEmails = () => screen.getByRole('textbox', { name: 'E-mails dos amigos' });

describe('modal de convite', () => {
  it('mostra o apelido como código e copia o código e o link /r/', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/');
    const modal = await abrirConvite(user);
    expect(within(modal).getByText('RAFA_9')).toBeInTheDocument();

    await user.click(within(modal).getByRole('button', { name: /Copiar código/ }));
    expect(await navigator.clipboard.readText()).toBe('Rafa_9');
    expect(within(modal).getByRole('button', { name: /Código copiado/ })).toBeInTheDocument();

    await user.click(within(modal).getByRole('button', { name: /Copiar link/ }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/r/Rafa_9`);
    expect(within(modal).getByRole('button', { name: /Link copiado/ })).toBeInTheDocument();
  });

  it('lista os convidados de verdade: ativos, sem time e e-mails aguardando cadastro', async () => {
    supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'usuario-2', apelido: 'Leo.Mansur', ...convidadoPorMim }), 'leo@email.com');
    supabaseFalso.adicionarPerfil(perfilNovo({ id: 'usuario-3', apelido: 'Duda.S', ...convidadoPorMim }), 'duda@email.com');
    // Convidado por outra pessoa: não aparece.
    supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'usuario-4', apelido: 'Outro', convidado_por: 'usuario-9' }));
    supabaseFalso.convitesEmail().push({ convidador: 'usuario-1', email: 'pedro@email.com', mensagem: null, enviado_em: new Date().toISOString(), reenviado_em: null });
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/');
    await abrirConvite(user);

    const lista = within(convidados()).getAllByRole('listitem');
    expect(lista.map((l) => l.textContent)).toEqual([
      expect.stringMatching(/Leo\.MansurEscolheu o clube · ativo\+100$/),
      expect.stringMatching(/Duda\.SCadastrou, ainda não escolheu time—$/),
      expect.stringMatching(/pedro@email\.comConvite por e-mail · aguardando cadastroReenviar—$/),
    ]);
    expect(within(convidados()).getByText('1 ativo · 2 pendentes')).toBeInTheDocument();
    expect(within(convidados()).queryByText('Outro')).not.toBeInTheDocument();
  });

  it('sem convidados, sugere mandar o link', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/');
    await abrirConvite(user);
    expect(await within(convidados()).findByText(/Ninguém ainda/)).toBeInTheDocument();
    expect(within(convidados()).getByText('0 ativos · 0 pendentes')).toBeInTheDocument();
  });

  it('convida por e-mail: vírgula e Enter viram etiquetas, e o envio mostra os amigos como pendentes', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/');
    const modal = await abrirConvite(user);
    const enviar = () => within(modal).getByRole('button', { name: /Enviar/ });
    await user.click(within(modal).getByRole('button', { name: 'Convidar por e-mail' }));
    expect(await within(modal).findByText('10 de 10 hoje')).toBeInTheDocument();
    expect(enviar()).toBeDisabled();

    await user.type(campoDeEmails(), 'Pedro@Email.com,');
    await user.type(campoDeEmails(), 'bia@email.com{Enter}');
    expect(within(modal).getByText('pedro@email.com')).toBeInTheDocument();
    expect(enviar()).toHaveTextContent('Enviar 2 convites');
    await user.type(within(modal).getByRole('textbox', { name: /Mensagem/ }), 'Bora pro jogo!');
    await user.click(enviar());

    expect(await within(modal).findByRole('status')).toHaveTextContent('Convite enviado para 2 amigos');
    expect(supabaseFalso.cliente.functions.invoke).toHaveBeenCalledWith('convidar-amigos', {
      body: { acao: 'enviar', emails: ['pedro@email.com', 'bia@email.com'], mensagem: 'Bora pro jogo!' },
    });
    await waitFor(() => expect(within(convidados()).getAllByRole('listitem')).toHaveLength(2));
    expect(within(convidados()).getByText('0 ativos · 2 pendentes')).toBeInTheDocument();

    await user.click(within(modal).getByRole('button', { name: 'Convidar mais' }));
    expect(within(modal).getByText('8 de 10 hoje')).toBeInTheDocument();
  });

  it('e-mail inválido fica em vermelho e bloqueia o envio até sair da lista', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/');
    const modal = await abrirConvite(user);
    await user.click(within(modal).getByRole('button', { name: 'Convidar por e-mail' }));
    await user.type(campoDeEmails(), 'pedro@email.com, pedro@{Enter}');
    expect(within(modal).getByRole('alert')).toHaveTextContent('Corrija o e-mail marcado em vermelho');
    expect(within(modal).getByRole('button', { name: /Enviar/ })).toBeDisabled();

    await user.click(within(modal).getByRole('button', { name: 'Tirar pedro@' }));
    expect(within(modal).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: 'Enviar convite' })).toBeEnabled();
  });

  it('quem já recebeu convite não entra de novo na lista', async () => {
    supabaseFalso.convitesEmail().push({ convidador: 'usuario-1', email: 'pedro@email.com', mensagem: null, enviado_em: new Date().toISOString(), reenviado_em: null });
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/');
    const modal = await abrirConvite(user);
    await within(convidados()).findByText('pedro@email.com');
    await user.click(within(modal).getByRole('button', { name: 'Convidar por e-mail' }));
    await user.type(campoDeEmails(), 'pedro@email.com{Enter}');
    expect(within(modal).getByRole('alert')).toHaveTextContent('pedro@email.com já recebeu convite');
    expect(within(modal).getByRole('button', { name: /Enviar/ })).toBeDisabled();
  });

  it('respeita o limite de 10 por dia', async () => {
    const hoje = new Date().toISOString();
    for (let i = 0; i < 9; i++) supabaseFalso.convitesEmail().push({ convidador: 'usuario-1', email: `amigo${i}@email.com`, mensagem: null, enviado_em: hoje, reenviado_em: null });
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/');
    const modal = await abrirConvite(user);
    await user.click(within(modal).getByRole('button', { name: 'Convidar por e-mail' }));
    expect(await within(modal).findByText('1 de 10 hoje')).toBeInTheDocument();
    await user.type(campoDeEmails(), 'a@email.com, b@email.com{Enter}');
    expect(within(modal).getByText('a@email.com')).toBeInTheDocument();
    expect(within(modal).queryByText('b@email.com')).not.toBeInTheDocument();
  });

  it('se o servidor recusar (limite batido em outro aparelho), avisa no formulário', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/');
    const modal = await abrirConvite(user);
    await user.click(within(modal).getByRole('button', { name: 'Convidar por e-mail' }));
    await user.type(campoDeEmails(), 'pedro@email.com{Enter}');
    const hoje = new Date().toISOString();
    for (let i = 0; i < 10; i++) supabaseFalso.convitesEmail().push({ convidador: 'usuario-1', email: `amigo${i}@email.com`, mensagem: null, enviado_em: hoje, reenviado_em: null });
    await user.click(within(modal).getByRole('button', { name: 'Enviar convite' }));
    expect(await within(modal).findByRole('alert')).toHaveTextContent('Você já mandou 10 convites hoje');
  });

  it('reenvia o convite pendente uma vez', async () => {
    supabaseFalso.convitesEmail().push({ convidador: 'usuario-1', email: 'pedro@email.com', mensagem: null, enviado_em: '2026-10-01T12:00:00Z', reenviado_em: null });
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/');
    await abrirConvite(user);
    await user.click(await within(convidados()).findByRole('button', { name: 'Reenviar para pedro@email.com' }));
    expect(await within(convidados()).findByText('Reenviado')).toBeInTheDocument();
    expect(supabaseFalso.convitesEmail()[0].reenviado_em).not.toBeNull();
  });

  it('Esc fecha o modal', async () => {
    supabaseFalso.logar(perfilDeTeste());
    const { user } = renderApp('/');
    await abrirConvite(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('cadastro pelo link /r/APELIDO', () => {
  it('abre o cadastro com quem chamou e manda o convite junto no cadastro', async () => {
    supabaseFalso.adicionarPerfil(LEO());
    const { user, local } = renderApp('/r/leo.mansur');
    await waitFor(() => expect(local()).toBe('/criar-conta'));
    expect(await screen.findByRole('heading', { name: 'Aceite o convite' })).toBeInTheDocument();
    expect(screen.getByText('Leo.Mansur te chamou para a torcida do Flamengo')).toBeInTheDocument();
    expect(screen.getByText(/vocês dois ganham \+100 XP/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nome'), 'Pedro Lima');
    await user.type(screen.getByLabelText('Apelido na torcida'), 'Pedrao');
    await user.type(screen.getByLabelText('E-mail'), 'pedro@email.com');
    await user.type(screen.getByLabelText('Senha'), 'Senha#2026x');
    await user.click(screen.getByRole('checkbox', { name: /18 anos/ }));
    await user.click(screen.getByRole('checkbox', { name: /Termos de uso/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Criar conta' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(supabaseFalso.cliente.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: { data: expect.objectContaining({ convite: 'Leo.Mansur' }) } }),
    );
  });

  it('link de apelido que não existe abre o cadastro comum e esquece o convite', async () => {
    const { local } = renderApp('/r/ninguem');
    await waitFor(() => expect(local()).toBe('/criar-conta'));
    expect(await screen.findByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument();
    await waitFor(() => expect(lerConvitePendente()).toBeNull());
    expect(screen.queryByText(/te chamou/)).not.toBeInTheDocument();
  });
});

describe('boas-vindas: veio de um convite?', () => {
  it('com o link /r/ guardado, aplica o convite e mostra de quem é', async () => {
    supabaseFalso.adicionarPerfil(LEO());
    guardarConvitePendente('Leo.Mansur');
    supabaseFalso.logar(perfilNovo());
    renderApp('/boas-vindas');
    expect(await screen.findByText('Convite do Leo.Mansur aplicado')).toBeInTheDocument();
    expect(supabaseFalso.perfil('usuario-1')?.convidado_por).toBe('usuario-2');
    expect(lerConvitePendente()).toBeNull();
  });

  it('sem convite, deixa informar o apelido de quem chamou', async () => {
    supabaseFalso.adicionarPerfil(LEO());
    supabaseFalso.logar(perfilNovo());
    const { user } = renderApp('/boas-vindas');
    await user.click(await screen.findByRole('button', { name: 'Informar' }));
    const campo = screen.getByRole('textbox', { name: 'Apelido de quem convidou' });

    await user.type(campo, 'ninguem');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não achamos ninguém com esse apelido.');

    await user.clear(campo);
    await user.type(campo, '@leo.mansur');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByText('Convite do Leo.Mansur aplicado')).toBeInTheDocument();
    expect(supabaseFalso.perfil('usuario-1')?.convidado_por).toBe('usuario-2');
  });

  it('o convite conta quando o convidado escolhe o clube', async () => {
    supabaseFalso.adicionarPerfil(LEO());
    supabaseFalso.logar(perfilNovo({ convidado_por: 'usuario-2' }));
    const { user } = renderApp('/onboarding');
    await user.click(await screen.findByRole('button', { name: 'Brasil' }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    await user.click(await screen.findByRole('button', { name: 'Palmeiras' }));
    await user.type(screen.getByLabelText('Sua cidade'), 'curit');
    await user.click(await screen.findByRole('option', { name: /^Curitiba/ }));
    expect(supabaseFalso.perfil('usuario-1')?.convite_contou_em).toBeNull();
    await user.click(screen.getByRole('button', { name: /Entrar na torcida/ }));
    await waitFor(() => expect(supabaseFalso.perfil('usuario-1')?.convite_contou_em).toEqual(expect.any(String)));
  });

  it('quem entrou pelo Google vai direto ao onboarding, que aplica o link /r/ guardado', async () => {
    supabaseFalso.adicionarPerfil(LEO());
    guardarConvitePendente('Leo.Mansur');
    supabaseFalso.logar(perfilNovo());
    renderApp('/');
    await waitFor(() => expect(supabaseFalso.perfil('usuario-1')?.convidado_por).toBe('usuario-2'));
  });
});
