import { noticiaDeTeste } from '../src/test/noticiasDeTeste';
import { expect, test } from './fixtures';

test('notícias: abre uma da lista, ganha o XP, vai ao site original, comenta e curte', async ({ page, context, backend }) => {
  const agora = Date.now();
  const recente = noticiaDeTeste({ titulo: 'Meia titular volta e deve começar jogando', publicada_em: new Date(agora - 2 * 3_600_000).toISOString() });
  const outra = noticiaDeTeste({
    titulo: 'Clube encaminha renovação do lateral até 2029',
    resumo: 'O contrato foi apresentado ao jogador e a assinatura sai na semana que vem.',
    fonte: 'Gazeta Esportiva',
    link: 'https://gazeta.example.com/renovacao-do-lateral',
    // Imagem de site externo: o backend falso aborta, e a tela cai no listrado.
    imagem_url: 'https://img.gazeta.example.com/lateral.jpg',
    publicada_em: new Date(agora - 26 * 3_600_000).toISOString(),
  });
  backend.noticias.noticias.push(recente, outra, noticiaDeTeste({ titulo: 'Notícia de outra torcida', clubes: [167] }));
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' });
  // O site de origem também é falso: a aba nova não sai para a rede.
  await context.route('https://gazeta.example.com/**', (rota) => rota.fulfill({ contentType: 'text/html', body: '<h1>Gazeta Esportiva</h1>' }));

  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));

  await page.getByRole('link', { name: /Notícias/ }).click();
  const primeira = page.getByRole('article', { name: recente.titulo });
  await expect(primeira).toBeVisible();
  await expect(page.getByText('Notícia de outra torcida')).toHaveCount(0);
  // Entrar em /noticias não lê nada: o destaque só convida.
  await expect(primeira.getByText('+10 XP por ler')).toBeVisible();
  await expect(primeira.getByText('Ninguém comentou ainda. Abra a conversa!')).toBeVisible();
  expect(backend.xp.lancamentos.filter((l) => l.acao === 'leitura_noticia')).toHaveLength(0);

  await page.getByRole('list', { name: 'Mais notícias' }).getByRole('link', { name: new RegExp(outra.titulo) }).click();
  await expect(page).toHaveURL(new RegExp(`/noticias/${outra.id}$`));
  const artigo = page.getByRole('article', { name: outra.titulo });
  await expect(artigo.getByText('Gazeta Esportiva', { exact: true })).toBeVisible();
  await expect(artigo.getByText(outra.resumo)).toBeVisible();
  // A imagem externa foi abortada: no lugar dela, o listrado.
  await expect(artigo.locator('img')).toHaveCount(0);
  await expect(artigo.getByRole('status')).toHaveText(/\+10 XP pela leitura/);
  // Login do dia (20) + a notícia aberta pela lista (10).
  await expect(page.getByRole('banner').getByText(/30 XP/)).toBeVisible();
  expect(backend.xp.lancamentos.filter((l) => l.acao === 'leitura_noticia')).toHaveLength(1);

  // "Ler no site": link de verdade para o original, em aba nova; o clique é contado pelo banco.
  const original = artigo.getByRole('link', { name: 'Ler no site' });
  await expect(original).toHaveAttribute('href', outra.link);
  await expect(original).toHaveAttribute('target', '_blank');
  await expect(original).toHaveAttribute('rel', 'noopener noreferrer');
  const [aba] = await Promise.all([context.waitForEvent('page'), original.click()]);
  await expect(aba).toHaveURL(outra.link);
  await aba.close();
  await expect.poll(() => backend.noticias.cliques).toEqual([{ noticia_id: outra.id, usuario_id: expect.any(String) }]);
  await expect(page).toHaveURL(new RegExp(`/noticias/${outra.id}$`));

  await artigo.getByRole('textbox', { name: 'Escreva um comentário' }).fill('Renova logo esse contrato!');
  await artigo.getByRole('button', { name: 'Publicar' }).click();
  await expect(artigo.getByRole('list', { name: 'Comentários' }).getByText('Renova logo esse contrato!')).toBeVisible();
  await expect(artigo.getByRole('heading', { name: '1 comentário' })).toBeVisible();

  const curtir = artigo.getByRole('button', { name: /Curtir a notícia/ });
  await curtir.click();
  await expect(curtir).toHaveAttribute('aria-pressed', 'true');

  // Recarregar a página mantém o que o "banco" guardou, sem creditar a leitura de novo.
  await page.reload();
  const deNovo = page.getByRole('article', { name: outra.titulo });
  await expect(deNovo.getByText('Lida')).toBeVisible();
  await expect(deNovo.getByRole('button', { name: /Curtir a notícia/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(deNovo.getByRole('list', { name: 'Comentários' }).getByText('Renova logo esse contrato!')).toBeVisible();
  expect(backend.noticias.comentarios).toEqual([expect.objectContaining({ noticia_id: outra.id, texto: 'Renova logo esse contrato!' })]);
  expect(backend.xp.lancamentos.filter((l) => l.acao === 'leitura_noticia')).toHaveLength(1);
});
