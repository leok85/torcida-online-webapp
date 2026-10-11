import { expect, test } from './fixtures';

const ONBOARDING_FEITO = { pais: 'BR', time_id: 'clube-b', onboarding_concluido_em: '2026-10-01T12:00:00Z' };

async function entrar(page: import('@playwright/test').Page) {
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('o link "Assinar" do site passa pelo login e chega aos planos com a escolha feita lá', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, ONBOARDING_FEITO);

  await page.goto('/assinar?plano=mensal&moeda=EUR');
  await expect(page).toHaveURL('/entrar');
  await entrar(page);

  await expect(page).toHaveURL('/assinar?plano=mensal&moeda=EUR');
  await expect(page.getByRole('radio', { name: /Mensal/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Plano mensal · € 5,49 por mês')).toBeVisible();

  await page.getByRole('button', { name: 'Continuar para pagamento' }).click();
  await expect(page).toHaveURL('/assinar/pagamento?plano=mensal&moeda=EUR');
});

test('quem não é membro vê o bloqueio; com a assinatura gravada, a página abre', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, ONBOARDING_FEITO);

  await page.goto('/entrar');
  await entrar(page);
  await page.getByRole('link', { name: /Ranking/ }).click();
  await expect(page.getByText('SÓ PARA MEMBROS', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ranking/ })).toContainText('só para membros');

  // O webhook do pagamento grava a assinatura; ao recarregar, o app relê sou_assinante().
  backend.assinar('rafa@example.com');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ranking', exact: true })).toBeVisible();
  await expect(page.getByText('SÓ PARA MEMBROS', { exact: true })).toHaveCount(0);

  await page.goto('/conta/assinatura');
  await expect(page.getByRole('heading', { name: 'Plano anual' })).toBeVisible();
  await expect(page.getByText('ATIVA')).toBeVisible();
});
