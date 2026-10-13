import { partidaDeTeste } from '../src/test/catalogoDeTeste';
import { expect, test } from './fixtures';

test('escalação e palpite: de Jogos ao palpite confirmado, que continua lá depois de recarregar e trava 15 min antes', async ({ page, backend }) => {
  // Palmeiras x Corinthians daqui a 2 dias: o palpite está aberto.
  const inicio = new Date(Date.now() + 2 * 86_400_000);
  backend.partidas.push(
    partidaDeTeste({ id: 7301, inicio: inicio.toISOString(), status: 'agendada', periodo: null, minuto: null, gols_mandante: null, gols_visitante: null, gols: [] }),
  );
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' });
  backend.assinar('rafa@example.com');
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));

  await page.goto('/jogos');
  await page.getByRole('region', { name: 'Próximos' }).getByRole('link').first().click();
  await expect(page).toHaveURL('/jogo/7301/escalacao');

  const campo = page.getByRole('region', { name: 'Escalação' });
  await campo.getByRole('button', { name: 'ATA: Paulinho' }).click();
  await page.getByRole('group', { name: 'Jogadores para a posição' }).getByRole('button', { name: /^V\. Roque/ }).click();
  await expect(campo.getByRole('button', { name: 'ATA: V. Roque' })).toBeVisible();
  await expect(campo.getByRole('button', { name: 'PON: Paulinho' })).toBeVisible();
  await page.getByRole('button', { name: 'Mais um gol do Palmeiras' }).click();
  await page.getByRole('button', { name: /Quem marca\?/ }).click();
  await page.getByRole('combobox', { name: '1º gol do Palmeiras' }).selectOption({ label: '1º gol · V. Roque' });
  await page.getByRole('button', { name: /Confirmar escalação e palpite/ }).click();
  await expect(page.getByRole('button', { name: /Escalação e palpite confirmados/ })).toBeVisible();
  expect(backend.palpites).toEqual([
    expect.objectContaining({ formacao: '4-3-3', gols_mandante: 1, gols_visitante: 0, autores: [{ mandante: true, jogador: 33 }], escalacao: expect.objectContaining({ l2p0: 5053, l2p1: 33 }) }),
  ]);

  await page.reload();
  await expect(page.getByRole('button', { name: /Escalação e palpite confirmados/ })).toBeVisible();
  await expect(page.getByLabel('Gols do Palmeiras: 1')).toBeVisible();
  await expect(campo.getByRole('button', { name: 'ATA: V. Roque' })).toBeVisible();

  // O jogo passa a começar daqui a 10 min (a sincronização atualizou o horário): só leitura.
  backend.partidas[0].inicio = new Date(Date.now() + 10 * 60_000).toISOString();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('O palpite fechou 15 min antes do início.');
  await expect(campo.getByText('V. Roque')).toBeVisible();
  await expect(campo.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Confirmar/ })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: '1º gol do Palmeiras' })).toBeDisabled();
});
