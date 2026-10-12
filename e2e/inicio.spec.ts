import { partidaDeTeste } from '../src/test/catalogoDeTeste';
import { expect, test } from './fixtures';

const ONBOARDING_FEITO = { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' };

test('o início mostra o jogo do clube vindo da tabela partidas', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, ONBOARDING_FEITO);
  backend.partidas.push(partidaDeTeste({ status: 'encerrada', periodo: null, minuto: null, gols_mandante: 4, gols_visitante: 1 }));

  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/');

  const jogo = page.getByRole('region', { name: 'Jogo do Palmeiras' });
  await expect(jogo.getByText('ENCERRADO')).toBeVisible();
  await expect(jogo.getByLabel('Placar: 4 a 1')).toBeVisible();
  await expect(jogo.getByText('Corinthians')).toBeVisible();

  // O placar muda na tabela (jogo novo ao vivo) e a página pega na próxima consulta, ao recarregar.
  backend.partidas.push(partidaDeTeste({ id: 7301, inicio: '2026-10-18T21:00:00+00:00', visitante_id: 160, visitante_nome: 'Flamengo' }));
  await page.reload();
  await expect(jogo.getByText('AO VIVO · 2º T')).toBeVisible();
  await expect(jogo.getByRole('button', { name: /Entrar no chat/ })).toBeVisible();
});
