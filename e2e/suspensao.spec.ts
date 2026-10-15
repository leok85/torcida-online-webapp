import { expect, test } from './fixtures';

const SUSPENSA = 'Sua conta está suspensa. Fale com o suporte.';

async function entrar(page: import('@playwright/test').Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.beforeEach(({ backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' });
});

test('conta suspensa não entra: o login mostra a suspensão', async ({ page, backend }) => {
  backend.restringir('rafa@example.com', 'suspensao');
  await entrar(page);
  await expect(page.getByRole('alert')).toContainText(SUSPENSA);
  await expect(page).toHaveURL(/\/entrar$/);
});

test('suspensa com o app aberto: na próxima troca de tela a sessão cai e a tela de entrar explica', async ({ page, backend }) => {
  await entrar(page);
  await expect(page.getByRole('banner')).toBeVisible();
  // A equipe suspende: as sessões são apagadas, mas o token de acesso ainda vale (até 1 h).
  backend.restringir('rafa@example.com', 'suspensao');
  await page.goto('/jogos');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByText(SUSPENSA)).toBeVisible();
  // E não volta a entrar.
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
});
