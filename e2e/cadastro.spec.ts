import { expect, test } from './fixtures';

test('cadastro completo: dados, código do e-mail, boas-vindas, onboarding e app', async ({ page, backend }) => {
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
  const checagemDoApelido = page.waitForResponse(/rpc\/apelido_disponivel/);
  await page.getByRole('button', { name: 'Escolher meu clube' }).click();

  await page.getByRole('button', { name: 'Brasil' }).click();
  await page.getByRole('button', { name: /Continuar/ }).click();
  await page.getByRole('button', { name: 'Clube D' }).click();
  // Uma pessoa leva mais que o debounce até aqui; sem esperar, a etapa 3 ainda não pode concluir e o bug não aparece.
  await checagemDoApelido;
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.getByRole('button', { name: /Continuar/ }).click();

  // Regressão: o mesmo <button> virava submit no meio do clique e o navegador concluía o onboarding sem mostrar a etapa 3.
  // Só reproduz em navegador real (no jsdom o React re-renderiza depois da ação padrão do clique).
  await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible();
  expect(backend.perfilDe('nova@example.com')?.onboarding_concluido_em).toBeNull();

  await expect(page.getByLabel('Apelido na torcida')).toHaveValue('Nova.Torcedora');
  await page.getByLabel('Cidade').fill('Porto Alegre');
  await page.getByRole('button', { name: /Concluir/ }).click();

  await expect(page).toHaveURL('/');
  const header = page.getByRole('banner');
  await expect(header).toContainText('Nova.Torcedora');
  await expect(header).toContainText('Clube D');
  expect(backend.perfilDe('nova@example.com')).toMatchObject({
    pais: 'BR',
    time_id: 'clube-d',
    cidade: 'Porto Alegre',
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
