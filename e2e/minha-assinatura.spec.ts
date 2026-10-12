import { expect, test } from './fixtures';

async function entrar(page: import('@playwright/test').Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));
}

test.beforeEach(({ backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' });
});

test('trocar de plano pelos planos e pelo pagamento, como no design', async ({ page, backend }) => {
  backend.assinar('rafa@example.com', { plano: 'mensal', expira_em: '2099-10-11T12:00:00Z' });
  await entrar(page);
  await page.goto('/conta/assinatura');
  await page.getByRole('button', { name: 'Trocar de plano' }).click();
  await expect(page).toHaveURL('/assinar?plano=anual');
  await expect(page.getByRole('radio', { name: /Mensal/ })).toBeDisabled();
  await page.getByRole('button', { name: /Continuar para pagamento/ }).click();
  await expect(page.getByText('− R$ 7,45')).toBeVisible();
  await page.getByRole('button', { name: 'Pagar R$ 141,55' }).click();
  await expect(page.getByRole('status')).toHaveText(/Plano anual ativado/);
  await expect(page.getByRole('heading', { name: 'Plano anual' })).toBeVisible();
});

test('e-mail de cobrança com o código mandado para o endereço novo', async ({ page, backend }) => {
  backend.assinar('rafa@example.com', { expira_em: '2099-10-11T12:00:00Z' });
  await entrar(page);
  await page.goto('/conta/assinatura');
  await page.getByRole('button', { name: 'Trocar e-mail de cobrança' }).click();
  await page.getByRole('radio', { name: /Usar outro e-mail/ }).click();
  await page.getByRole('textbox', { name: 'Novo e-mail de cobrança' }).fill('financeiro@email.com');
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await page.getByLabel('Código de 6 dígitos').fill(backend.codigoDeCobranca('financeiro@email.com'));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('financeiro@email.com · e-mail separado')).toBeVisible();
  // Recarregar relê o resumo do Stripe: o e-mail novo ficou salvo.
  await page.reload();
  await expect(page.getByText('financeiro@email.com · e-mail separado')).toBeVisible();
});
