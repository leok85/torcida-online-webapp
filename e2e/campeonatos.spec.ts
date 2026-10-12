import { COMPETICOES_DE_TESTE, TABELAS_DE_TESTE, temporadaDoPalmeiras } from '../src/test/catalogoDeTeste';
import { expect, test } from './fixtures';

test('Campeonatos lista as competições do clube e abre o mata-mata com o caminho até a final', async ({ page, backend }) => {
  await page.clock.install({ time: new Date('2026-10-12T03:00:00Z') });
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' });
  backend.partidas.push(...temporadaDoPalmeiras());
  backend.competicoes.push(...COMPETICOES_DE_TESTE);
  backend.classificacao.push(...TABELAS_DE_TESTE);

  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Campeonatos' }).click();

  await expect(page.getByText('Palmeiras está em 3 competições na temporada')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Brasileirão Série A · rodada 30' })).toBeVisible();

  await page.getByRole('tab', { name: /Copa Libertadores/ }).click();
  await expect(page.getByRole('region', { name: 'Fase atual' })).toContainText('Semifinal');
  const caminho = page.getByRole('region', { name: 'Caminho até a final' });
  await caminho.getByRole('button', { name: 'Ver jogos de Oitavas de final' }).click();
  await expect(caminho).toContainText('Palmeiras 2 x 0 Boca Juniors');
});
