import { partidaDeTeste } from '../src/test/catalogoDeTeste';
import { detalhesDeTeste } from '../src/test/jogoDeTeste';
import { expect, test } from './fixtures';

test('pós-jogo: "Dar notas" do início, notas enviadas e a média da torcida depois de recarregar', async ({ page, backend }) => {
  // Acabou há 10 min: a janela das notas está aberta.
  const apito = new Date(Date.now() - 10 * 60_000).toISOString();
  backend.partidas.push(partidaDeTeste({ status: 'encerrada', periodo: null, minuto: null, gols_mandante: 4, gols_visitante: 1, encerrada_em: apito }));
  backend.detalhes.set(7290, detalhesDeTeste());
  backend.notasJogadores.push({ partida_id: 7290, jogador_id: 3876, usuario_id: 'outro', clube_id: 162, nota: 9 });
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' });
  backend.assinar('rafa@example.com');
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));

  await page.getByRole('button', { name: /Dar notas/ }).click();
  await expect(page).toHaveURL('/jogo/7290/notas');
  const notas = page.getByRole('region', { name: 'Suas notas' });
  await expect(notas.getByText(/fecha em (49|50) min/)).toBeVisible();

  await notas.getByRole('radiogroup', { name: 'Nota de C. Miguel' }).getByRole('radio', { name: '7' }).click();
  await notas.getByRole('radiogroup', { name: 'Nota de A. Barboza' }).getByRole('radio', { name: '10' }).click();
  await notas.getByRole('button', { name: /Enviar avaliações/ }).click();
  await expect(notas.getByRole('button', { name: 'Avaliações enviadas' })).toBeVisible();
  expect(backend.notasJogadores.filter((n) => n.usuario_id !== 'outro').map((n) => [n.jogador_id, n.nota])).toEqual([
    [24, 7],
    [3876, 10],
  ]);

  await page.reload();
  const media = page.getByRole('region', { name: 'Notas da partida' });
  await expect(media.getByText('2 votaram')).toBeVisible();
  const barboza = media.getByRole('listitem').filter({ hasText: 'A. Barboza' });
  await expect(barboza).toContainText('SUA10');
  await expect(barboza).toContainText('9,5');
});
