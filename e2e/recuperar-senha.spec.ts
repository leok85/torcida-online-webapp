import { expect, test } from './fixtures';

test('recupera a senha com o código do e-mail e entra com a senha nova', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'SenhaAntiga#1', { apelido: 'Rafa_9' }, {
    pais: 'BR',
    time_id: 162,
    onboarding_concluido_em: '2026-10-01T12:00:00Z',
  });

  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByRole('link', { name: 'Esqueci a senha' }).click();
  await expect(page.getByLabel('E-mail')).toHaveValue('rafa@example.com');
  await page.getByRole('button', { name: 'Enviar código' }).click();

  await page.getByLabel('Código de 6 dígitos').fill(backend.ultimoCodigo('rafa@example.com', 'recovery'));
  await page.getByLabel('Senha nova', { exact: true }).fill('SenhaNova#2026');
  await page.getByLabel('Repita a senha nova').fill('SenhaNova#2026');
  await page.getByRole('button', { name: 'Salvar senha e entrar' }).click();
  await expect(page.getByRole('banner')).toContainText('Rafa_9');

  await page.getByRole('button', { name: /Rafa_9/ }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('SenhaAntiga#1');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos.');

  await page.getByLabel('Senha', { exact: true }).fill('SenhaNova#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/');
});

test('pedir código para e-mail sem conta não revela que ele não existe', async ({ page, backend }) => {
  await page.goto('/recuperar-senha');
  await page.getByLabel('E-mail').fill('ninguem@example.com');
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByText(/Se existir uma conta com/)).toContainText('ninguem@example.com');
  expect(backend.emails).toHaveLength(0);
});
