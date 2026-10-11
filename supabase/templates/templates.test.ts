// Os templates são colados à mão no painel do Supabase; este teste pega erros antes disso.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pasta = import.meta.dirname;
const templates = readdirSync(pasta).filter((nome) => nome.endsWith('.html'));

// Variáveis que o Supabase preenche nos e-mails de autenticação (sintaxe de template do Go).
const PERMITIDAS = ['.Token', '.Email', '.Data.nome', 'if .Data.nome', 'end'];

describe.each(templates)('%s', (nome) => {
  const html = readFileSync(join(pasta, nome), 'utf8');
  const corpo = html.slice(html.indexOf('<!DOCTYPE html>'));

  it('mostra o código de 6 dígitos e não manda link', () => {
    expect(corpo).toContain('{{ .Token }}');
    expect(corpo).not.toMatch(/ConfirmationURL|TokenHash|RedirectTo|SiteURL/);
  });

  it('só usa variáveis que o Supabase conhece', () => {
    const usadas = [...corpo.matchAll(/\{\{\s*(.*?)\s*\}\}/g)].map((m) => m[1]);
    expect(usadas.length).toBeGreaterThan(0);
    for (const variavel of usadas) expect(PERMITIDAS).toContain(variavel);
  });

  it('não sobrou marcador do template base do Claude Design', () => {
    expect(corpo).not.toMatch(/\{\{[A-ZÀ-Ú_]+\}\}/);
  });

  it('carrega imagens por URL pública absoluta', () => {
    const fontes = [...corpo.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    for (const src of fontes) expect(src).toMatch(/^https:\/\//);
  });

  it('está em português e com o assunto anotado para o painel', () => {
    expect(corpo).toContain('<html lang="pt-BR">');
    expect(html).toMatch(/Assunto: \S/);
  });

  it('não expõe o código no assunto nem no título', () => {
    const assunto = html.match(/Assunto: (.*)/)?.[1] ?? '';
    const titulo = corpo.match(/<title>(.*)<\/title>/)?.[1] ?? '';
    expect(assunto).not.toContain('.Token');
    expect(titulo).not.toContain('.Token');
  });
});
