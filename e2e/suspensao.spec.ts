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

test('suspensa com a sessão aberta: a renovação é recusada, a sessão cai e a tela de entrar explica', async ({ page, backend }) => {
  await entrar(page);
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));
  backend.restringir('rafa@example.com', 'suspensao');

  // O token de acesso venceu: ao reabrir, o cliente tenta renovar e o Auth responde user_banned.
  await page.evaluate(() => {
    const chave = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))!;
    const sessao = JSON.parse(localStorage.getItem(chave)!);
    localStorage.setItem(chave, JSON.stringify({ ...sessao, expires_at: Math.floor(Date.now() / 1000) - 60 }));
  });
  await page.reload();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByText(SUSPENSA)).toBeVisible();
});
