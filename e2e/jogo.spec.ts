import { partidaDeTeste } from '../src/test/catalogoDeTeste';
import { detalhesDeTeste } from '../src/test/jogoDeTeste';
import { expect, test } from './fixtures';
import type { BackendFalso } from './backendFalso';
import type { Page } from '@playwright/test';

const ONBOARDING_FEITO = { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' };

async function entrarComoMembro(page: Page, backend: BackendFalso) {
  const rafa = backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, ONBOARDING_FEITO);
  backend.assinar('rafa@example.com');
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));
  return rafa;
}

test('ao vivo: "Entrar no chat" abre placar, números, lances e escalação, e o chat da torcida conversa', async ({ page, backend }) => {
  backend.partidas.push(partidaDeTeste());
  backend.detalhes.set(7290, detalhesDeTeste());
  backend.mensagensChat.push({
    id: 1,
    partida_id: 7290,
    clube_id: 162,
    autor_id: 'outro',
    autor_apelido: 'Bia.T',
    autor_foto: null,
    texto: 'Vamo Verdão!',
    criado_em: new Date().toISOString(),
  });
  await entrarComoMembro(page, backend);

  await page.getByRole('button', { name: /Entrar no chat/ }).click();
  await expect(page).toHaveURL('/jogo/7290');
  await expect(page.getByLabel('Placar: 1 a 0')).toBeVisible();
  await expect(page.getByText('2º tempo')).toBeVisible();
  const numeros = page.getByRole('region', { name: 'Números da partida' });
  await expect(numeros.getByText('Posse de bola')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lances do jogo' }).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('tab', { name: 'Inicial · 3-4-2-1' })).toBeVisible();

  const chat = page.getByRole('region', { name: 'Chat da torcida' });
  await expect(chat.getByText('Vamo Verdão!')).toBeVisible();
  await chat.getByRole('textbox', { name: 'Mensagem para a torcida' }).fill('Que golaço!');
  await chat.getByRole('button', { name: 'Enviar' }).click();
  await expect(chat.getByText('Que golaço!')).toBeVisible();
  expect(backend.mensagensChat.at(-1)).toMatchObject({ autor_apelido: 'Rafa_9', clube_id: 162, texto: 'Que golaço!' });

  // Sem o Realtime no E2E, a mensagem de outro torcedor chega pela busca a cada 5 s.
  backend.mensagensChat.push({ id: 99, partida_id: 7290, clube_id: 162, autor_id: 'outro', autor_apelido: 'Bia.T', autor_foto: null, texto: 'VIRA VIRA', criado_em: new Date().toISOString() });
  await expect(chat.getByText('VIRA VIRA')).toBeVisible({ timeout: 10_000 });

  // Recarregar mantém a conversa.
  await page.reload();
  await expect(chat.getByText('Que golaço!')).toBeVisible();
});

test('encerrado: "Chat" do início abre o jogo com o fim de jogo e o pós-jogo liberado', async ({ page, backend }) => {
  backend.partidas.push(partidaDeTeste({ status: 'encerrada', periodo: null, minuto: null, gols_mandante: 4, gols_visitante: 1 }));
  await entrarComoMembro(page, backend);
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page).toHaveURL('/jogo/7290');
  await expect(page.getByLabel('Placar: 4 a 1')).toBeVisible();
  await expect(page.getByText('VITÓRIA')).toBeVisible();
  await expect(page.getByRole('link', { name: /Pós-jogo e notas/ })).toHaveAttribute('href', '/pos-jogo');
  await expect(page.getByText('Os números deste jogo ainda não chegaram.')).toBeVisible();
});

test('o campo da escalação tem o mesmo tamanho em qualquer formação e em qualquer momento do jogo', async ({ page, backend }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  backend.partidas.push(partidaDeTeste());
  const d = detalhesDeTeste();
  // Goleiro + 5 linhas de um lado, goleiro + 3 do outro.
  d.escalacoes!.mandante.formacao = '4-1-2-1-2';
  d.escalacoes!.visitante.formacao = '4-4-2';
  backend.detalhes.set(7290, d);
  await entrarComoMembro(page, backend);
  await page.goto('/jogo/7290');

  const campo = page.locator('[class*="_campo_"]');
  await expect(page.getByRole('tab', { name: 'Inicial · 4-1-2-1-2' })).toBeVisible();
  const cinco = await campo.boundingBox();
  // Os 11 cabem dentro do campo.
  for (const nome of ['V. Roque', 'C. Miguel']) {
    const caixa = (await page.getByText(nome, { exact: true }).boundingBox())!;
    expect(caixa.y).toBeGreaterThanOrEqual(cinco!.y);
    expect(caixa.y + caixa.height).toBeLessThanOrEqual(cinco!.y + cinco!.height);
  }

  await page.getByRole('tab', { name: 'Corinthians' }).click();
  await expect(page.getByText('Escalação inicial · 4-4-2')).toBeVisible();
  const tres = await campo.boundingBox();
  expect(tres!.height).toBe(cinco!.height);
  expect(tres!.width).toBe(cinco!.width);

  // A lista de substituições vem logo abaixo do campo.
  const trocas = page.getByRole('region', { name: 'Substituições · Corinthians' });
  await expect(trocas).toBeVisible();
  expect((await trocas.boundingBox())!.y).toBeGreaterThan(tres!.y + tres!.height);

  // Encerrado o cabeçalho cresce (competição, data e os gols de cada lado): o campo continua do mesmo tamanho.
  backend.partidas[0].status = 'encerrada';
  backend.partidas[0].gols.push({ jogador: 'A. Giay', minuto: '78', mandante: true, contra: false, penalti: false });
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Inicial · 4-1-2-1-2' })).toBeVisible();
  expect((await campo.boundingBox())!.height).toBe(cinco!.height);
});

test('colunas: praticamente iguais em 1440 px; em telas maiores o espaço extra vai para o chat', async ({ page, backend }) => {
  backend.partidas.push(partidaDeTeste());
  backend.detalhes.set(7290, detalhesDeTeste());
  await entrarComoMembro(page, backend);
  const larguras = () =>
    page.getByRole('region', { name: 'Chat da torcida' }).evaluate((chat) => [...chat.parentElement!.children].map((c) => c.getBoundingClientRect().width));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/jogo/7290');
  await expect(page.getByRole('region', { name: 'Chat da torcida' })).toBeVisible();
  const [escalacao, numeros, chat] = await larguras();
  expect(Math.max(escalacao, numeros, chat) - Math.min(escalacao, numeros, chat)).toBeLessThanOrEqual(12);

  await page.setViewportSize({ width: 1920, height: 1080 });
  const [escalacaoLarga, numerosLarga, chatLargo] = await larguras();
  expect(escalacaoLarga).toBeLessThanOrEqual(440);
  expect(numerosLarga).toBeLessThanOrEqual(440);
  expect(chatLargo).toBeGreaterThan(escalacaoLarga * 1.6);
});
