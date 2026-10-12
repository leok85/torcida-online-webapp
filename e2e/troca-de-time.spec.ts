import { expect, test } from './fixtures';

test('troca de time: escolhe o clube, confirma e, ao voltar, a troca aparece como já usada', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' });
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Espera o login terminar antes de trocar de página (senão a sessão ainda não foi gravada).
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));
  await page.goto('/jogos');

  await page.getByRole('button', { name: /Rafa_9/ }).click();
  await page.getByRole('menuitem', { name: /Trocar de time/ }).click();
  await expect(page).toHaveURL('/conta/time');

  await page.getByRole('radio', { name: /Argentina/ }).click();
  await page.getByRole('radio', { name: /River Plate/ }).click();
  await expect(page.getByText('Jogos, campeonatos e notícias passam a ser de Argentina')).toBeVisible();
  const confirmar = page.getByRole('button', { name: 'Confirmar troca definitiva' });
  await expect(confirmar).toBeDisabled();
  await page.getByRole('checkbox', { name: /Entendi que a troca é definitiva/ }).click();
  await confirmar.click();

  await expect(page.getByRole('heading', { name: 'Agora você é River Plate' })).toBeVisible();
  expect(backend.perfilDe('rafa@example.com')).toMatchObject({ time_id: 9002, time_anterior_id: 162, pais: 'AR' });

  // Recarregar relê o perfil: a troca única já foi usada.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Troca já utilizada' })).toBeVisible();
  await expect(page.getByText(/Você trocou do Palmeiras para o River Plate/)).toBeVisible();
});
