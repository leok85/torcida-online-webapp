import { expect, test } from './fixtures';

test('link /r/APELIDO: cadastro com o convite aplicado, que conta quando o amigo escolhe o clube', async ({ page, backend }) => {
  backend.criarUsuario('leo@example.com', 'Senha#2026', { apelido: 'Leo.Mansur' }, { pais: 'BR', time_id: 160, onboarding_concluido_em: '2026-10-01T12:00:00Z' });
  const leo = backend.perfilDe('leo@example.com')!;

  await page.goto('/r/leo.mansur');
  await expect(page).toHaveURL('/criar-conta');
  await expect(page.getByRole('heading', { name: 'Aceite o convite' })).toBeVisible();
  await expect(page.getByText('Leo.Mansur te chamou para a torcida do Flamengo')).toBeVisible();

  await page.getByLabel('Nome').fill('Pedro Lima');
  await page.getByLabel('Apelido na torcida').fill('Pedrao');
  await page.getByRole('textbox', { name: 'E-mail' }).fill('pedro@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Torcida#2026');
  await page.getByRole('checkbox', { name: 'Tenho 18 anos ou mais.' }).check({ force: true });
  await page.getByRole('checkbox', { name: /Li e aceito os/ }).check({ force: true });
  await expect(page.getByText('Apelido disponível.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page).toHaveURL('/verificar-email');
  // O convite vai no cadastro: o perfil já nasce com quem convidou.
  expect(backend.perfilDe('pedro@example.com')?.convidado_por).toBe(leo.id);
  await page.getByLabel('Código de 6 dígitos').fill(backend.ultimoCodigo('pedro@example.com', 'signup'));

  await expect(page.getByText('Convite do Leo.Mansur aplicado')).toBeVisible();
  await page.getByRole('button', { name: 'Escolher meu clube' }).click();
  await page.getByRole('button', { name: 'Brasil' }).click();
  await page.getByRole('button', { name: /Continuar/ }).click();
  await page.getByRole('button', { name: 'Flamengo' }).click();
  await page.getByLabel('Sua cidade').fill('porto ale');
  await page.getByRole('option', { name: /^Porto Alegre/ }).click();
  await page.getByRole('button', { name: /Entrar na torcida/ }).click();
  await expect(page).toHaveURL('/assinar');
  expect(backend.perfilDe('pedro@example.com')?.convite_contou_em).toEqual(expect.any(String));
});

test('modal de convite: copia o link, convida por e-mail e o convidado continua pendente depois de recarregar', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, { pais: 'BR', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('rafa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('Senha#2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));

  await page.getByRole('button', { name: /Convidar amigos/ }).click();
  const modal = page.getByRole('dialog', { name: 'Chame a torcida e ganhe junto' });
  await modal.getByRole('button', { name: /Copiar link/ }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/r\/Rafa_9$/);

  await modal.getByRole('button', { name: 'Convidar por e-mail' }).click();
  const campo = modal.getByRole('textbox', { name: 'E-mails dos amigos' });
  await campo.fill('pedro@example.com,');
  await campo.fill('bia@example.com');
  await campo.press('Enter');
  await modal.getByRole('button', { name: 'Enviar 2 convites' }).click();
  await expect(modal.getByRole('status')).toContainText('Convite enviado para 2 amigos');
  expect(backend.convitesEmail.map((c) => c.email)).toEqual(['pedro@example.com', 'bia@example.com']);

  await page.reload();
  await page.getByRole('button', { name: /Convidar amigos/ }).click();
  const lista = page.getByRole('region', { name: 'Seus convidados' });
  await expect(lista.getByText('0 ativos · 2 pendentes')).toBeVisible();
  await lista.getByRole('button', { name: 'Reenviar para pedro@example.com' }).click();
  await expect(lista.getByText('Reenviado')).toBeVisible();
});
