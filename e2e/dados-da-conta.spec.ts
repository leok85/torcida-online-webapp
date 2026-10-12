import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const ONBOARDING_FEITO = { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' };

async function entrar(page: Page, { abrir = true } = {}) {
  if (abrir) await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function abrirDadosDaConta(page: Page) {
  await expect(page).toHaveURL('/');
  await page.getByRole('button', { name: /Rafa_9/ }).click();
  await page.getByRole('menuitem', { name: /Dados da conta/ }).click();
  await expect(page).toHaveURL('/conta/dados');
}

test('foto: escolhe, ajusta o recorte com o mouse e salva uma foto quadrada de 512 px', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, ONBOARDING_FEITO);
  await entrar(page);
  await abrirDadosDaConta(page);

  // O seletor de arquivos real do navegador: o canvas, o arrastar e o zoom só existem aqui.
  await page.getByTestId('arquivo-da-foto').setInputFiles({ name: 'eu.png', mimeType: 'image/png', buffer: readFileSync('public/icon-color.png') });
  const janela = page.getByRole('dialog', { name: 'Ajustar foto' });
  await expect(janela.getByRole('img', { name: 'Foto escolhida' })).toBeVisible();

  await janela.getByRole('button', { name: 'Aumentar zoom' }).click();
  await expect(janela.getByRole('slider', { name: 'Zoom' })).toHaveValue('1.25');
  const area = janela.getByRole('group', { name: /Área de ajuste da foto/ });
  const caixa = (await area.boundingBox())!;
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await page.mouse.down();
  await page.mouse.move(caixa.x + caixa.width / 2 + 40, caixa.y + caixa.height / 2 + 10, { steps: 4 });
  await page.mouse.up();

  await janela.getByRole('button', { name: 'Salvar foto' }).click();
  await expect(page.getByRole('status')).toHaveText(/Foto atualizada\./);
  await expect(janela).toBeHidden();

  const foto = backend.perfilDe('rafa@example.com')!.foto!;
  expect(foto).toMatch(/^[0-9a-f-]+\/[0-9a-f-]+\.(webp|jpg)$/);
  // A foto salva é a recortada (512 x 512) e aparece no topo, servida pelo bucket.
  const noTopo = page.getByRole('banner').locator('img[src*="/avatares/"]');
  await expect(noTopo).toHaveAttribute('src', new RegExp(`/avatares/${foto}$`));
  const lado = await noTopo.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  });
  expect(lado).toEqual([512, 512]);
  await expect(page.getByRole('button', { name: 'Trocar foto' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remover' })).toBeVisible();
});

test('e-mail: troca com o código enviado para o endereço novo', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, ONBOARDING_FEITO);
  await entrar(page);
  await abrirDadosDaConta(page);

  await page.getByRole('button', { name: 'Alterar e-mail' }).click();
  await page.getByLabel('Novo e-mail').fill('rafa.novo@example.com');
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await page.getByLabel('Código de 6 dígitos').fill(backend.ultimoCodigo('rafa.novo@example.com', 'email_change'));

  await expect(page.getByRole('status')).toHaveText(/E-mail atualizado\./);
  await expect(page.getByText('rafa.novo@example.com')).toBeVisible();

  // O e-mail novo passa a valer para entrar.
  await page.reload();
  await expect(page.getByText('rafa.novo@example.com')).toBeVisible();
});

test('excluir conta: agenda, tira do app e, entrando de novo no prazo, dá para manter a conta', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, ONBOARDING_FEITO);
  await entrar(page);
  await abrirDadosDaConta(page);

  await page.getByRole('button', { name: 'Excluir conta' }).click();
  const janela = page.getByRole('dialog', { name: 'Excluir sua conta?' });
  await janela.getByLabel('Digite EXCLUIR para confirmar').fill('EXCLUIR');
  await janela.getByRole('button', { name: 'Excluir minha conta' }).click();

  await expect(page).toHaveURL('/entrar');
  await expect(page.getByText(/Sua conta será excluída em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  expect(backend.perfilDe('rafa@example.com')!.exclusao_agendada_para).toBeTruthy();

  // O recado aparece uma vez só.
  await page.reload();
  await expect(page.getByText(/Sua conta será excluída/)).toBeHidden();

  await entrar(page, { abrir: false });
  await expect(page.getByRole('heading', { name: 'Sua conta está marcada para exclusão' })).toBeVisible();
  await page.getByRole('button', { name: 'Manter minha conta' }).click();
  await expect(page.getByRole('button', { name: /Rafa_9/ })).toBeVisible();
  expect(backend.perfilDe('rafa@example.com')!.exclusao_agendada_para).toBeNull();
});
