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
  // A equipe suspende: o token de acesso ainda vale (até 1 h).
  backend.restringir('rafa@example.com', 'suspensao');
  await page.goto('/jogos');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByText(SUSPENSA)).toBeVisible();
  // E não volta a entrar.
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
});

test('suspensa e de volta depois que o token venceu: a renovação cai e a tela de entrar explica', async ({ page, backend }) => {
  await entrar(page);
  await expect(page.getByRole('banner')).toBeVisible();
  // A pessoa fecha a aba; enquanto isso a equipe suspende e o token de acesso vence (mais de 1 h).
  await page.goto('about:blank');
  backend.restringir('rafa@example.com', 'suspensao');
  await page.addInitScript(() => {
    if (sessionStorage.getItem('token-vencido')) return;
    sessionStorage.setItem('token-vencido', '1');
    for (const chave of Object.keys(localStorage).filter((k) => k.startsWith('sb-'))) {
      const sessao = JSON.parse(localStorage.getItem(chave)!);
      localStorage.setItem(chave, JSON.stringify({ ...sessao, expires_at: Math.floor(Date.now() / 1000) - 60 }));
    }
  });
  const renovacao = page.waitForResponse((r) => r.url().includes('grant_type=refresh_token'));
  await page.goto('/');
  expect(await (await renovacao).json()).toMatchObject({ error_code: 'user_banned' });
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByText(SUSPENSA)).toBeVisible();
});
