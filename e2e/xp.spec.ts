import { lancarXp } from '../src/test/xpDeTeste';
import { expect, test } from './fixtures';

test('XP: o login do dia conta uma vez, aparece no topo, no perfil e na sequência das missões', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' });
  backend.assinar('rafa@example.com');
  const eu = [...backend.perfis.values()].find((p) => p.apelido === 'Rafa_9')!;
  lancarXp(backend.xp, { usuario_id: eu.id, acao: 'palpite_exato', detalhe: 'Placar exato: Palmeiras 2 x 1 Corinthians' });

  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));

  // 240 do palpite + 20 do login de hoje = nível 2.
  const topo = page.getByRole('banner');
  await expect(topo.getByText('NÍVEL 2')).toBeVisible();
  await expect(topo.getByText('1º · 260 XP')).toBeVisible();

  // Recarregar não conta o dia de novo.
  await page.reload();
  await expect(topo.getByText('1º · 260 XP')).toBeVisible();
  expect(backend.xp.lancamentos.filter((l) => l.acao === 'login_diario')).toHaveLength(1);

  await page.goto('/perfil');
  const historico = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Histórico de XP' }) });
  await expect(historico.getByText('Login diário')).toBeVisible();
  await expect(historico.getByText('Placar exato: Palmeiras 2 x 1 Corinthians')).toBeVisible();

  await page.goto('/missoes');
  await expect(page.getByRole('region', { name: 'Sequência de login' })).toContainText('1 dia');
  await expect(page.getByText('Nenhuma missão nesta semana')).toBeVisible();
});
