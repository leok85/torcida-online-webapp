import { partidaDeTeste } from '../src/test/catalogoDeTeste';
import { expect, test } from './fixtures';

const ONBOARDING_FEITO = { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' };

async function entrarComJogosLentos(page: import('@playwright/test').Page, backend: import('./backendFalso').BackendFalso) {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, ONBOARDING_FEITO);
  backend.partidas.push(partidaDeTeste());
  // Segura a resposta dos jogos até o teste liberar.
  let liberar!: () => void;
  const liberado = new Promise<void>((r) => (liberar = r));
  await page.route('**/rest/v1/partidas**', async (rota) => {
    await liberado;
    await rota.fallback();
  });
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  return liberar;
}

test('o card do Início carrega com skeleton e vira o jogo no mesmo lugar', async ({ page, backend }) => {
  const liberar = await entrarComJogosLentos(page, backend);
  const card = page.getByRole('region', { name: 'Jogo do Palmeiras' });
  await expect(card).toHaveAttribute('aria-busy', 'true');
  const carregando = await card.boundingBox();

  liberar();
  await expect(card.getByText('AO VIVO · 2º T')).toBeVisible();
  await expect(card).not.toHaveAttribute('aria-busy');
  // O skeleton tem a mesma largura do card pronto: a página não pula para os lados.
  expect((await card.boundingBox())!.width).toBe(carregando!.width);
});

test('o brilho do skeleton para quando o sistema pede menos animação', async ({ page, backend }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const liberar = await entrarComJogosLentos(page, backend);
  const bloco = page.getByRole('region', { name: 'Jogo do Palmeiras' }).locator('[aria-hidden="true"]').first();
  await expect(bloco).toHaveCSS('animation-name', 'none');
  liberar();
});

test('com animação liberada, o skeleton brilha', async ({ page, backend }) => {
  const liberar = await entrarComJogosLentos(page, backend);
  const bloco = page.getByRole('region', { name: 'Jogo do Palmeiras' }).locator('[aria-hidden="true"]').first();
  await expect(bloco).not.toHaveCSS('animation-name', 'none');
  liberar();
});
