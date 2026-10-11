import { expect, test } from './fixtures';

const ONBOARDING_FEITO = { pais: 'BR', time_id: 'clube-b', onboarding_concluido_em: '2026-10-01T12:00:00Z' };

test('login leva de volta à página pedida e sair encerra a sessão', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, ONBOARDING_FEITO);

  await page.goto('/ranking');
  await expect(page).toHaveURL('/entrar');

  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos.');

  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/ranking');
  await expect(page.getByRole('banner')).toContainText('Rafa_9');

  // Sessão persiste ao recarregar ("Manter conectado" vem marcado).
  await page.reload();
  await expect(page.getByRole('banner')).toContainText('Rafa_9');

  await page.getByRole('button', { name: /Rafa_9/ }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await expect(page).toHaveURL('/entrar');
  const chaves = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]);
  expect(chaves.some((k) => k.includes('auth-token'))).toBe(false);
});

test('sem "Manter conectado", a sessão fica só nesta aba', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, ONBOARDING_FEITO);
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('checkbox', { name: 'Manter conectado' }).uncheck({ force: true });
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('banner')).toContainText('Rafa_9');

  const onde = await page.evaluate(() => ({
    local: Object.keys(localStorage).some((k) => k.includes('auth-token')),
    sessao: Object.keys(sessionStorage).some((k) => k.includes('auth-token')),
  }));
  expect(onde).toEqual({ local: false, sessao: true });

  // Uma aba nova não herda a sessão.
  const outraAba = await page.context().newPage();
  await outraAba.goto('/');
  await expect(outraAba).toHaveURL('/entrar');
});

test('e-mail não confirmado: pede código novo no login e confirma', async ({ page, backend }) => {
  await page.goto('/criar-conta');
  await page.getByLabel('Nome').fill('Pendente');
  await page.getByLabel('Apelido na torcida').fill('Pendente');
  await page.getByRole('textbox', { name: 'E-mail' }).fill('pendente@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Torcida#2026');
  await page.getByRole('checkbox', { name: 'Tenho 18 anos ou mais.' }).check({ force: true });
  await page.getByRole('checkbox', { name: /Li e aceito os/ }).check({ force: true });
  await expect(page.getByText('Apelido disponível.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL('/verificar-email');

  // Abandona a verificação e tenta entrar depois.
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('pendente@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Torcida#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Falta confirmar seu e-mail')).toBeVisible();
  await page.getByRole('button', { name: 'Enviar código' }).click();

  await expect(page).toHaveURL('/verificar-email');
  expect(backend.emails.filter((e) => e.para === 'pendente@example.com')).toHaveLength(2);
  await page.getByLabel('Código de 6 dígitos').fill(backend.ultimoCodigo('pendente@example.com', 'signup'));
  await expect(page.getByRole('heading', { name: /Bem-vindo/ })).toBeVisible();
});
