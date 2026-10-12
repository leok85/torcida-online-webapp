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
  await expect(jogo.getByText(/^ENCERRADO · HÁ/)).toBeVisible();
  await expect(jogo.getByLabel('Placar: 4 a 1')).toBeVisible();
  await expect(jogo.getByText('Corinthians')).toBeVisible();

  // O placar muda na tabela (jogo novo ao vivo) e a página pega na próxima consulta, ao recarregar.
  backend.partidas.push(partidaDeTeste({ id: 7301, inicio: '2026-10-18T21:00:00+00:00', visitante_id: 160, visitante_nome: 'Flamengo' }));
  await page.reload();
  await expect(jogo.getByText('AO VIVO · 2º T')).toBeVisible();
  await expect(jogo.getByRole('button', { name: /Entrar no chat/ })).toBeVisible();
});

test('Jogos, pelo menu, lista o ao vivo, os próximos e os resultados do clube', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, ONBOARDING_FEITO);
  backend.partidas.push(
    partidaDeTeste(),
    partidaDeTeste({ id: 7279, inicio: '2026-10-09T00:30:00Z', status: 'encerrada', periodo: null, minuto: null, visitante_id: 166, visitante_nome: 'Bahia' }),
    partidaDeTeste({ id: 7301, inicio: '2026-10-15T00:30:00Z', status: 'agendada', periodo: null, minuto: null, gols_mandante: null, gols_visitante: null, gols: [], visitante_id: 160, visitante_nome: 'Flamengo' }),
  );

  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();

  const menu = page.getByRole('navigation');
  await menu.getByRole('link', { name: 'Jogos, jogo ao vivo' }).click();
  await expect(page).toHaveURL('/jogos');
  await expect(menu.getByRole('link', { name: 'Jogos, jogo ao vivo' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: 'Jogo ao vivo' })).toContainText('Palmeiras 1 — 0 Corinthians');
  await expect(page.getByRole('region', { name: 'Próximos' }).getByRole('link')).toHaveAccessibleName(/Palmeiras × Flamengo.*abre no apito final/);
  await expect(page.getByRole('region', { name: 'Resultados' }).getByRole('link')).toHaveAccessibleName(/^Vitória: Palmeiras 1 — 0 Bahia/);
});
