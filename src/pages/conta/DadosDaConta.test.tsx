import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp';
import {
  APP_IPHONE,
  CHROME_MAC,
  CODIGO_DE_TESTE,
  EDGE_WINDOWS,
  EMAIL_PADRAO,
  identidadeDeTeste,
  perfilDeTeste,
  SENHA_DE_TESTE,
  supabaseFalso,
} from '../../test/supabaseFalso';

const { auth, functions } = supabaseFalso.cliente;
const DIA_MS = 86_400_000;
const diasAtras = (dias: number) => new Date(Date.now() - dias * DIA_MS).toISOString();

function abrir(perfil = perfilDeTeste()) {
  supabaseFalso.logar(perfil);
  return renderApp('/conta/dados');
}

const linha = (rotulo: string) => screen.getByText(rotulo, { selector: 'div' }).parentElement as HTMLElement;
const aviso = () => screen.findByRole('status');

describe('Dados da conta (W21)', () => {
  it('abre pelo menu de conta e mostra os dados reais do torcedor', async () => {
    supabaseFalso.logar(
      perfilDeTeste({ cidade: 'Florianópolis, SC', cidade_id: 4205407, apelido_alterado_em: diasAtras(92), senha_alterada_em: diasAtras(125) }),
    );
    const { user, local } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Rafa_9/ }));
    await user.click(screen.getByRole('menuitem', { name: /Dados da conta/ }));

    expect(local()).toBe('/conta/dados');
    expect(screen.getByRole('heading', { name: 'Dados da conta' })).toBeInTheDocument();
    expect(linha('Nome')).toHaveTextContent('Rafael Andrade');
    expect(linha('Apelido')).toHaveTextContent('@Rafa_9Última troca há 92 dias · pode trocar agora');
    expect(linha('Cidade')).toHaveTextContent('Florianópolis, SC');
    expect(linha('E-mail')).toHaveTextContent(EMAIL_PADRAO);
    expect(linha('Senha')).toHaveTextContent('Alterada há 4 meses');
    expect(await screen.findByText('1 forma de entrar')).toBeInTheDocument();
    expect(linha('Apple')).toHaveTextContent('Não conectado');
    expect(linha('Google')).toHaveTextContent('Não conectado');
    expect(await screen.findByText('ESTE NAVEGADOR')).toBeInTheDocument();
    expect(screen.getByText('Chrome · macOS')).toBeInTheDocument();
  });

  describe('perfil', () => {
    it('troca o nome no lugar da linha e avisa que salvou', async () => {
      const { user } = abrir();
      await user.click(await screen.findByRole('button', { name: 'Alterar nome' }));
      const edicao = screen.getByRole('form', { name: 'Nome' });
      const campo = within(edicao).getByLabelText('Nome completo');
      await user.clear(campo);
      await user.type(campo, '  Rafael   Moura ');
      await user.click(within(edicao).getByRole('button', { name: 'Salvar' }));

      expect(await aviso()).toHaveTextContent('Nome atualizado');
      expect(supabaseFalso.perfil('usuario-1')?.nome).toBe('Rafael Moura');
      expect(linha('Nome')).toHaveTextContent('Rafael Moura');
    });

    it('cancelar fecha a edição sem salvar', async () => {
      const { user } = abrir();
      await user.click(await screen.findByRole('button', { name: 'Alterar nome' }));
      await user.type(screen.getByLabelText('Nome completo'), 'xyz');
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByLabelText('Nome completo')).not.toBeInTheDocument();
      expect(supabaseFalso.perfil('usuario-1')?.nome).toBe('Rafael Andrade');
    });

    it('apelido: mostra se já é seu ou de outro torcedor e salva um livre, começando a contar os 30 dias', async () => {
      supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'usuario-2', apelido: 'Tricolor' }));
      const { user } = abrir();
      await user.click(await screen.findByRole('button', { name: 'Alterar apelido' }));
      expect(screen.getByText(/O apelido anterior fica reservado por esse período/)).toBeInTheDocument();
      const campo = screen.getByRole('textbox', { name: 'Novo apelido' });
      expect(campo).toHaveValue('');

      await user.type(campo, 'rafa_9');
      expect(await screen.findByText('Esse já é o seu apelido.')).toBeInTheDocument();
      await user.clear(campo);
      await user.type(campo, 'tricolor');
      expect(await screen.findByText('Esse apelido já é de outro torcedor.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Salvar apelido' })).toBeDisabled();

      await user.clear(campo);
      await user.type(campo, 'Rafa.Verdao');
      expect(await screen.findByText('Apelido disponível.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Salvar apelido' }));

      expect(await aviso()).toHaveTextContent('Apelido atualizado para @Rafa.Verdao');
      expect(supabaseFalso.perfil('usuario-1')).toMatchObject({ apelido: 'Rafa.Verdao', apelido_anterior: 'Rafa_9', apelido_alterado_em: expect.any(String) });
      expect(linha('Apelido')).toHaveTextContent('Trocado hoje · próxima troca em');
      expect(screen.getByRole('button', { name: 'Alterar apelido' })).toBeDisabled();
    });

    it('o apelido que outro torcedor deixou fica reservado por 30 dias', async () => {
      supabaseFalso.adicionarPerfil(perfilDeTeste({ id: 'usuario-2', apelido: 'NovoNome', apelido_anterior: 'Verdao10', apelido_alterado_em: diasAtras(5) }));
      const { user } = abrir();
      await user.click(await screen.findByRole('button', { name: 'Alterar apelido' }));
      await user.type(screen.getByRole('textbox', { name: 'Novo apelido' }), 'verdao10');
      expect(await screen.findByText('Esse apelido já é de outro torcedor.')).toBeInTheDocument();
    });

    it('apelido trocado há menos de 30 dias não pode ser alterado', async () => {
      abrir(perfilDeTeste({ apelido_alterado_em: diasAtras(10) }));
      expect(await screen.findByRole('button', { name: 'Alterar apelido' })).toBeDisabled();
      expect(linha('Apelido')).toHaveTextContent('Última troca há 10 dias · próxima troca em');
    });

    it('cidade: busca no catálogo e salva o município escolhido', async () => {
      const { user } = abrir();
      await user.click(await screen.findByRole('button', { name: 'Alterar cidade' }));
      expect(screen.getByRole('button', { name: 'Usar minha localização' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
      await user.type(screen.getByRole('combobox', { name: 'Sua cidade' }), 'curit');
      await user.click(await screen.findByRole('option', { name: /^Curitiba/ }));
      await user.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(await aviso()).toHaveTextContent('Cidade atualizada');
      expect(supabaseFalso.perfil('usuario-1')).toMatchObject({ cidade: 'Curitiba, PR', cidade_id: 4106902 });
    });
  });

  describe('foto', () => {
    const arquivo = (nome: string, tipo: string, bytes = 1000) => new File([new Uint8Array(bytes)], nome, { type: tipo });
    const escolher = (f: File) => fireEvent.change(screen.getByTestId('arquivo-da-foto'), { target: { files: [f] } });

    it('recusa formato errado e arquivo acima de 5 MB, sem abrir o ajuste', async () => {
      abrir();
      await screen.findByRole('button', { name: 'Escolher foto' });
      escolher(arquivo('foto.gif', 'image/gif'));
      expect(await screen.findByRole('alert')).toHaveTextContent('Use uma imagem JPG, PNG ou WebP.');
      escolher(arquivo('foto.jpg', 'image/jpeg', 6 * 1024 * 1024));
      expect(await screen.findByRole('alert')).toHaveTextContent('A imagem passa de 5 MB. Escolha uma menor.');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('uma imagem válida abre o ajuste com zoom e as miniaturas; fechar cancela', async () => {
      const { user } = abrir();
      await screen.findByRole('button', { name: 'Escolher foto' });
      escolher(arquivo('foto.png', 'image/png'));
      const janela = await screen.findByRole('dialog', { name: 'Ajustar foto' });
      expect(within(janela).getByRole('slider', { name: 'Zoom' })).toHaveValue('1');
      expect(within(janela).getByText('Assim sua foto aparece no perfil, no ranking e no chat.')).toBeInTheDocument();
      expect(within(janela).getByRole('button', { name: 'Trocar imagem' })).toBeInTheDocument();
      await user.click(within(janela).getByRole('button', { name: 'Fechar' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('mostra a foto salva no topo e no menu, e deixa remover', async () => {
      const foto = 'usuario-1/foto-antiga.webp';
      const { user } = abrir(perfilDeTeste({ foto }));
      const url = `https://supabase.test/storage/v1/object/public/avatares/${foto}`;
      await screen.findByRole('button', { name: 'Trocar foto' });
      expect(document.querySelectorAll(`img[src="${url}"]`).length).toBeGreaterThanOrEqual(2);

      await user.click(screen.getByRole('button', { name: 'Remover' }));
      expect(await aviso()).toHaveTextContent('Foto removida');
      expect(supabaseFalso.perfil('usuario-1')?.foto).toBeNull();
      expect(document.querySelector(`img[src="${url}"]`)).toBeNull();
      expect(screen.getByRole('button', { name: 'Escolher foto' })).toBeInTheDocument();
    });
  });

  describe('e-mail', () => {
    async function pedirCodigo(user: ReturnType<typeof renderApp>['user'], email: string) {
      await user.click(await screen.findByRole('button', { name: 'Alterar e-mail' }));
      await user.type(screen.getByRole('textbox', { name: 'Novo e-mail' }), email);
      await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    }

    it('troca em duas etapas: o endereço novo e o código enviado para ele', async () => {
      const { user } = abrir();
      await pedirCodigo(user, 'Rafa.Novo@Example.com');

      expect(auth.updateUser).toHaveBeenCalledWith({ email: 'rafa.novo@example.com' });
      expect(await screen.findByRole('form', { name: 'Confirme o novo e-mail' })).toHaveTextContent('rafa.novo@example.com');
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
      await user.type(screen.getByLabelText('Código de 6 dígitos'), CODIGO_DE_TESTE);
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'rafa.novo@example.com', token: CODIGO_DE_TESTE, type: 'email_change' });
      expect(await aviso()).toHaveTextContent('E-mail confirmado');
      expect(linha('E-mail')).toHaveTextContent('rafa.novo@example.com');
    });

    it('"Corrigir e-mail" volta para o endereço', async () => {
      const { user } = abrir();
      await pedirCodigo(user, 'errado@example.com');
      await user.click(await screen.findByRole('button', { name: 'Corrigir e-mail' }));
      expect(screen.getByRole('textbox', { name: 'Novo e-mail' })).toHaveValue('errado@example.com');
    });

    it('com a troca segura, pede também o código enviado para o e-mail atual', async () => {
      supabaseFalso.ligarTrocaSegura();
      const { user } = abrir();
      await pedirCodigo(user, 'novo@example.com');
      await user.type(await screen.findByLabelText('Código de 6 dígitos'), CODIGO_DE_TESTE);
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      expect(await screen.findByRole('form', { name: 'Confirme pelo e-mail atual' })).toHaveTextContent(EMAIL_PADRAO);
      await user.type(screen.getByLabelText('Código de 6 dígitos'), CODIGO_DE_TESTE);
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));
      expect(auth.verifyOtp).toHaveBeenLastCalledWith({ email: EMAIL_PADRAO, token: CODIGO_DE_TESTE, type: 'email_change' });
      expect(await aviso()).toHaveTextContent('E-mail confirmado');
    });

    it('código errado mostra o erro e deixa tentar de novo', async () => {
      const { user } = abrir();
      await pedirCodigo(user, 'novo@example.com');
      await user.type(await screen.findByLabelText('Código de 6 dígitos'), '000000');
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido ou expirado');
      expect(screen.getByLabelText('Código de 6 dígitos')).toHaveValue('');
    });

    it('não aceita o mesmo e-mail', async () => {
      const { user } = abrir();
      await user.click(await screen.findByRole('button', { name: 'Alterar e-mail' }));
      await user.type(screen.getByRole('textbox', { name: 'Novo e-mail' }), EMAIL_PADRAO);
      expect(screen.getByText('Esse já é o seu e-mail.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Enviar código' })).toBeDisabled();
    });
  });

  describe('senha', () => {
    async function preencher(user: ReturnType<typeof renderApp>['user'], atual: string, nova = 'NovaSenha#2027') {
      await user.click(await screen.findByRole('button', { name: 'Alterar senha' }));
      await user.type(screen.getByLabelText('Senha atual'), atual);
      await user.type(screen.getByLabelText('Nova senha'), nova);
    }

    it('só libera com a senha atual e a nova de 8 caracteres', async () => {
      const { user } = abrir();
      await user.click(await screen.findByRole('button', { name: 'Alterar senha' }));
      expect(screen.getByRole('link', { name: 'Esqueci a senha atual' })).toHaveAttribute('href', '/recuperar-senha');
      await user.type(screen.getByLabelText('Nova senha'), 'NovaSenha#2027');
      expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeDisabled();
      await user.type(screen.getByLabelText('Senha atual'), SENHA_DE_TESTE);
      expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeEnabled();
    });

    it('com a senha atual errada, avisa e não troca', async () => {
      const { user } = abrir();
      await preencher(user, 'chute123');
      await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('A senha atual está incorreta.');
      expect(auth.signOut).not.toHaveBeenCalled();
    });

    it('troca a senha, tira os outros aparelhos e atualiza a data', async () => {
      supabaseFalso.definirAparelhos([
        { id: 'sessao-atual', user_agent: CHROME_MAC, criado_em: diasAtras(9), usado_em: new Date().toISOString(), atual: true },
        { id: 'sessao-edge', user_agent: EDGE_WINDOWS, criado_em: diasAtras(9), usado_em: diasAtras(3), atual: false },
      ]);
      const { user, local } = abrir();
      expect(await screen.findByText('Edge · Windows')).toBeInTheDocument();
      await preencher(user, SENHA_DE_TESTE);
      await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

      expect(auth.updateUser).toHaveBeenCalledWith({ password: 'NovaSenha#2027', current_password: SENHA_DE_TESTE });
      expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
      expect(await aviso()).toHaveTextContent('Senha alterada. Outros aparelhos foram desconectados.');
      expect(linha('Senha')).toHaveTextContent('Alterada hoje');
      await waitFor(() => expect(screen.queryByText('Edge · Windows')).not.toBeInTheDocument());
      // Este navegador continua logado.
      expect(local()).toBe('/conta/dados');
    });

    it('quando o Supabase pede reautenticação, manda o código e troca com ele', async () => {
      auth.updateUser.mockImplementationOnce(async () => ({ data: { user: null }, error: Object.assign(new Error('reauth'), { code: 'reauthentication_needed', status: 401, __isAuthError: true }) }));
      const { user } = abrir();
      await preencher(user, SENHA_DE_TESTE);
      await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
      expect(auth.reauthenticate).toHaveBeenCalled();
      await user.type(await screen.findByLabelText('Código de 6 dígitos'), '445566');
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));
      expect(auth.updateUser).toHaveBeenLastCalledWith({ password: 'NovaSenha#2027', current_password: SENHA_DE_TESTE, nonce: '445566' });
      expect(await aviso()).toHaveTextContent('Senha alterada.');
    });
  });

  describe('formas de entrar', () => {
    it('quem entra só pelo Google cria uma senha e só então pode desvincular o Google', async () => {
      supabaseFalso.definirFormasDeEntrar([identidadeDeTeste('google')]);
      supabaseFalso.provedoresAtivos.mockResolvedValue({ google: true });
      const { user } = abrir(perfilDeTeste({ senha_alterada_em: null }));

      expect(await screen.findByRole('button', { name: 'Desvincular Google' })).toBeDisabled();
      expect(linha('Senha')).toHaveTextContent('Sem senhaHoje você entra só pelo Google ou pela Apple.');
      expect(linha('Google')).toHaveTextContent(`Conectado${EMAIL_PADRAO}`);

      await user.click(screen.getByRole('button', { name: 'Criar senha' }));
      expect(screen.queryByLabelText('Senha atual')).not.toBeInTheDocument();
      await user.type(screen.getByLabelText('Nova senha'), 'NovaSenha#2027');
      await user.click(screen.getByRole('button', { name: 'Criar senha' }));

      expect(auth.updateUser).toHaveBeenCalledWith({ password: 'NovaSenha#2027' });
      expect(await aviso()).toHaveTextContent('Senha criada');
      expect(await screen.findByText('2 formas de entrar')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Desvincular Google' })).toBeEnabled();
    });

    it('desvincula o Google quando sobra a senha', async () => {
      supabaseFalso.definirFormasDeEntrar([identidadeDeTeste('email'), identidadeDeTeste('google')]);
      const { user } = abrir();
      expect(await screen.findByText('2 formas de entrar')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Desvincular Google' }));
      expect(auth.unlinkIdentity).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }));
      expect(await aviso()).toHaveTextContent('Google desvinculado');
      expect(await screen.findByText('1 forma de entrar')).toBeInTheDocument();
    });

    it('conectar leva para o provedor e volta para esta tela', async () => {
      supabaseFalso.provedoresAtivos.mockResolvedValue({ google: true });
      const { user } = abrir();
      await user.click(await screen.findByRole('button', { name: 'Conectar Google' }));
      expect(auth.linkIdentity).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'http://localhost:3000/conta/dados' } });
    });

    it('avisa quando o provedor ainda não está ligado no Supabase', async () => {
      const { user } = abrir();
      await user.click(await screen.findByRole('button', { name: 'Conectar Apple' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Entrar com a Apple ainda não está disponível.');
      expect(auth.linkIdentity).not.toHaveBeenCalled();
    });

    it('explica quando ligar contas ainda está desligado no Supabase', async () => {
      supabaseFalso.provedoresAtivos.mockResolvedValue({ google: true });
      auth.linkIdentity.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('off'), { code: 'manual_linking_disabled', status: 422, __isAuthError: true }) });
      const { user } = abrir();
      await user.click(await screen.findByRole('button', { name: 'Conectar Google' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Ligar outra forma de entrar ainda não está liberado.');
    });
  });

  describe('aparelhos conectados', () => {
    it('encerra um aparelho e sai de todos os outros', async () => {
      supabaseFalso.definirAparelhos([
        { id: 'sessao-atual', user_agent: CHROME_MAC, criado_em: diasAtras(9), usado_em: new Date().toISOString(), atual: true },
        { id: 'sessao-iphone', user_agent: APP_IPHONE, criado_em: diasAtras(9), usado_em: new Date(Date.now() - 2 * 3_600_000).toISOString(), atual: false },
        { id: 'sessao-edge', user_agent: EDGE_WINDOWS, criado_em: diasAtras(9), usado_em: diasAtras(3), atual: false },
      ]);
      const { user } = abrir();
      const lista = await screen.findByRole('list', { name: 'Aparelhos' });
      expect(within(lista).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        // O ícone Material entra no texto: computador para navegadores, celular para o app.
        'computerChrome · macOSagoraESTE NAVEGADOR',
        'smartphoneiPhone · apphá 2 hEncerrar',
        'computerEdge · Windowshá 3 diasEncerrar',
      ]);

      await user.click(screen.getByRole('button', { name: 'Encerrar iPhone · app' }));
      expect(await aviso()).toHaveTextContent('Sessão encerrada');
      expect(supabaseFalso.aparelhos().map((a) => a.id)).toEqual(['sessao-atual', 'sessao-edge']);

      await user.click(screen.getByRole('button', { name: 'Sair de todos os outros aparelhos' }));
      expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
      await waitFor(() => expect(within(lista).getAllByRole('listitem')).toHaveLength(1));
      expect(screen.getByRole('status')).toHaveTextContent('Outros aparelhos desconectados');
      expect(screen.queryByRole('button', { name: 'Sair de todos os outros aparelhos' })).not.toBeInTheDocument();
    });
  });

  describe('excluir conta', () => {
    it('só libera depois de digitar EXCLUIR, agenda a exclusão e leva para o login com o prazo', async () => {
      const { user, local } = abrir();
      await user.click(await screen.findByRole('button', { name: 'Excluir conta' }));
      const janela = screen.getByRole('dialog', { name: 'Excluir conta' });
      expect(janela).toHaveTextContent('O apelido @Rafa_9 fica livre para outro torcedor.');
      expect(janela).toHaveTextContent('Você tem 30 dias para desistir entrando de novo.');
      expect(janela).toHaveTextContent('cancele também nos ajustes da App Store ou do Google Play');
      const confirmar = within(janela).getByRole('button', { name: 'Excluir definitivamente' });
      expect(confirmar).toBeDisabled();

      await user.type(within(janela).getByLabelText('Digite EXCLUIR para confirmar'), 'excluir');
      await user.click(confirmar);

      expect(functions.invoke).toHaveBeenCalledWith('excluir-conta', { body: {} });
      await waitFor(() => expect(local()).toBe('/entrar'));
      expect(screen.getByText(/Sua conta será excluída em \d{2}\/\d{2}\/\d{4}\. Se mudar de ideia/)).toBeInTheDocument();
      expect(supabaseFalso.perfil('usuario-1')?.exclusao_agendada_para).toEqual(expect.any(String));
    });

    it('"Manter conta" fecha sem excluir', async () => {
      const { user } = abrir();
      await user.click(await screen.findByRole('button', { name: 'Excluir conta' }));
      await user.click(screen.getByRole('button', { name: 'Manter conta' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(functions.invoke).not.toHaveBeenCalled();
    });

    it('se não der para encerrar a assinatura, a conta fica e o motivo aparece', async () => {
      functions.invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ erro: 'falha_ao_encerrar_assinatura' }), { status: 500 }) } });
      const { user, local } = abrir();
      await user.click(await screen.findByRole('button', { name: 'Excluir conta' }));
      await user.type(screen.getByLabelText('Digite EXCLUIR para confirmar'), 'EXCLUIR');
      await user.click(screen.getByRole('button', { name: 'Excluir definitivamente' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Não conseguimos encerrar sua assinatura agora');
      expect(local()).toBe('/conta/dados');
    });

    it('quem entra dentro do prazo pode manter a conta', async () => {
      supabaseFalso.logar(perfilDeTeste({ exclusao_agendada_para: '2026-11-13T12:00:00Z' }));
      const { user } = renderApp('/');
      expect(await screen.findByRole('heading', { name: 'Sua conta está marcada para exclusão' })).toBeInTheDocument();
      expect(screen.getByText(/apagada de vez em 13\/11\/2026/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Manter minha conta' }));
      expect(await screen.findByRole('button', { name: /Rafa_9/ })).toBeInTheDocument();
      expect(supabaseFalso.perfil('usuario-1')?.exclusao_agendada_para).toBeNull();
    });
  });
});
