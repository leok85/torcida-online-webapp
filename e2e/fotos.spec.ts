import { readFileSync } from 'node:fs';
import { partidaDeTeste } from '../src/test/catalogoDeTeste';
import { expect, test } from './fixtures';

test('fotos: envia uma foto de verdade, reduzida no navegador, e ela aparece no mural depois de recarregar', async ({ page, backend }) => {
  backend.partidas.push(partidaDeTeste()); // Palmeiras x Corinthians ao vivo: janela "durante"
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' });
  backend.assinar('rafa@example.com');
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));

  await page.goto('/jogo/7290/fotos');
  await page.getByRole('button', { name: /Enviar foto · \+40 XP/ }).click();
  const janela = page.getByRole('dialog', { name: 'Enviar foto' });
  // PNG de 256 px: o navegador redesenha e envia em WebP.
  await page.getByTestId('arquivo-da-foto-da-torcida').setInputFiles({ name: 'arquibancada.png', mimeType: 'image/png', buffer: readFileSync('public/icon-color.png') });
  await expect(janela.getByRole('img', { name: 'Prévia da foto' })).toBeVisible();
  await janela.getByRole('radio', { name: 'Comemoração' }).click();
  await janela.getByLabel(/Legenda/).fill('Bandeirão no gol');
  await janela.getByText('A foto é minha e segue as regras da comunidade').click();
  await janela.getByRole('button', { name: /Enviar foto/ }).click();
  await expect(page.getByRole('dialog', { name: 'Foto publicada' })).toBeVisible();

  const [caminho] = [...backend.arquivosDasFotos.keys()];
  expect(caminho).toMatch(/^7290\/162\/[^/]+\/.+\.webp$/);
  expect(backend.arquivosDasFotos.get(caminho)!.tipo).toBe('image/webp');
  expect(backend.fotosDaTorcida.fotos).toEqual([expect.objectContaining({ etiqueta: 'Comemoração', legenda: 'Bandeirão no gol', momento: 'durante', caminho })]);

  await page.getByRole('button', { name: 'Ver no mural' }).click();
  await page.reload();
  const campea = page.getByRole('region', { name: 'Mais curtida até agora' });
  const imagem = campea.getByRole('img', { name: 'Bandeirão no gol' });
  await expect(imagem).toBeVisible();
  // A imagem carregou de verdade pela URL assinada.
  await expect.poll(() => imagem.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(256);
  await expect(page.getByRole('button', { name: /Enviar foto · \+40 XP/ })).toBeDisabled();
});
