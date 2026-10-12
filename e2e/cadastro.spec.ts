import { expect, test } from './fixtures';

test('cadastro completo: dados, código do e-mail, boas-vindas, país, clube e cidade, planos e app', async ({ page, backend }) => {
  await page.goto('/criar-conta');
  await page.getByLabel('Nome').fill('Nova Torcedora');
  await page.getByLabel('Apelido na torcida').fill('Nova.Torcedora');
  await page.getByRole('textbox', { name: 'E-mail' }).fill('nova@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Torcida#2026');
  await page.getByRole('checkbox', { name: 'Tenho 18 anos ou mais.' }).check({ force: true });
  await page.getByRole('checkbox', { name: /Li e aceito os/ }).check({ force: true });
  await expect(page.getByText('Apelido disponível.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page).toHaveURL('/verificar-email');
  await page.getByLabel('Código de 6 dígitos').fill(backend.ultimoCodigo('nova@example.com', 'signup'));

  await expect(page.getByRole('heading', { name: /Bem-vindo/ })).toContainText('Nova.Torcedora');
  await page.getByRole('button', { name: 'Escolher meu clube' }).click();

  await page.getByRole('button', { name: 'Brasil' }).click();
  await page.getByRole('button', { name: /Continuar/ }).click();

  // Regressão: um botão que vira submit no meio do clique faz o navegador enviar o formulário da etapa seguinte.
  // O cartão inteiro é um <form>; "Continuar" não pode concluir o onboarding. Só reproduz em navegador real.
  await expect(page.getByText('Etapa 2 de 2 · clube e cidade')).toBeVisible();
  expect(backend.perfilDe('nova@example.com')?.onboarding_concluido_em).toBeNull();

  await page.getByRole('button', { name: 'Corinthians' }).click();
  await page.getByLabel('Sua cidade').fill('porto ale');
  await page.getByRole('option', { name: /^Porto Alegre/ }).click();
  await page.getByRole('button', { name: /Entrar na torcida/ }).click();

  // Quem não é membro vê a oferta de planos logo depois.
  await expect(page).toHaveURL('/assinar');
  await expect(page.getByRole('heading', { name: 'Seja membro' })).toBeVisible();
  await page.getByRole('button', { name: 'Agora não' }).click();

  await expect(page).toHaveURL('/');
  const header = page.getByRole('banner');
  await expect(header).toContainText('Nova.Torcedora');
  await expect(header).toContainText('Corinthians');
  expect(backend.perfilDe('nova@example.com')).toMatchObject({
    pais: 'BR',
    time_id: 167,
    cidade: 'Porto Alegre, RS',
    cidade_id: 4314902,
    onboarding_concluido_em: expect.any(String),
  });
});

test('o código colado do e-mail com espaços funciona', async ({ page, backend }) => {
  await page.goto('/criar-conta');
  await page.getByLabel('Nome').fill('Colador');
  await page.getByLabel('Apelido na torcida').fill('Colador');
  await page.getByRole('textbox', { name: 'E-mail' }).fill('colador@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Torcida#2026');
  await page.getByRole('checkbox', { name: 'Tenho 18 anos ou mais.' }).check({ force: true });
  await page.getByRole('checkbox', { name: /Li e aceito os/ }).check({ force: true });
  await expect(page.getByText('Apelido disponível.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar conta' }).click();

  const codigo = backend.ultimoCodigo('colador@example.com', 'signup');
  const comEspacos = ` ${codigo.slice(0, 3)} ${codigo.slice(3)}\n`;
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((texto) => navigator.clipboard.writeText(texto), comEspacos);
  await page.getByLabel('Código de 6 dígitos').focus();
  await page.keyboard.press('ControlOrMeta+V');

  await expect(page.getByRole('heading', { name: /Bem-vindo/ })).toBeVisible();
});

test('e-mail que já tem conta não cria outra', async ({ page, backend }) => {
  backend.criarUsuario('ja@example.com', 'Senha#2026', { apelido: 'Ja_Tenho' });
  await page.goto('/criar-conta');
  await page.getByLabel('Nome').fill('Repetido');
  await page.getByLabel('Apelido na torcida').fill('Repetido');
  await page.getByRole('textbox', { name: 'E-mail' }).fill('ja@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Torcida#2026');
  await page.getByRole('checkbox', { name: 'Tenho 18 anos ou mais.' }).check({ force: true });
  await page.getByRole('checkbox', { name: /Li e aceito os/ }).check({ force: true });
  await expect(page.getByText('Apelido disponível.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByText('Esse e-mail já tem conta na Torcida Online')).toBeVisible();
  await expect(page).toHaveURL('/criar-conta');
  expect(backend.usuarios.size).toBe(1);
});
