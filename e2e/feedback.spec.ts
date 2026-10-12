import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

test('feedback: abre pelo menu com a área da tela, anexa um print e envia', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' });
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.goto('/jogos');

  await page.getByRole('button', { name: /Rafa_9/ }).click();
  await page.getByRole('menuitem', { name: /Enviar feedback/ }).click();
  await expect(page).toHaveURL('/conta/feedback');
  await expect(page.getByRole('button', { name: 'Jogo e chat' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: /Problema/ }).click();
  await page.getByRole('textbox').fill('O placar travou no intervalo do jogo.');
  // O seletor de arquivos real do navegador e o upload multipart para o bucket privado.
  await page.getByTestId('arquivo-do-feedback').setInputFiles({ name: 'tela.png', mimeType: 'image/png', buffer: readFileSync('public/icon-color.png') });
  await expect(page.getByText('tela.png')).toBeVisible();
  await page.getByRole('button', { name: 'Enviar' }).click();

  await expect(page.getByRole('heading', { name: 'Valeu pelo toque' })).toBeVisible();
  const [salvo] = backend.feedbacks;
  expect(salvo).toMatchObject({ tipo: 'problema', area: 'jogo', xp: 50, email: 'rafa@example.com' });
  expect(salvo.dados_navegador).toMatchObject({ ultima_tela: '/jogos', navegador: expect.stringContaining('Chrome') });
  expect(backend.prints.get(salvo.anexo!)?.tipo).toBe('image/png');
  await expect(page.getByRole('list', { name: 'Seus envios' }).getByRole('listitem')).toHaveCount(1);
});
