---
name: qa
description: Testes do web app Torcida Online (Vitest + Testing Library para unidade e telas, Playwright para fluxos no navegador, ambos com Supabase falso). Use sempre que criar ou alterar código em src/ — tela, componente, hook, regra de negócio, correção de bug, mudança de schema no Supabase — para escrever ou atualizar os testes no mesmo trabalho e rodá-los antes de dizer que terminou. Use também quando pedirem para testar, rodar ou consertar testes, ver cobertura, fazer QA, checar regressão, ou perguntarem "isso está funcionando?".
---

# QA do web app

O combinado do time: **toda mudança de código vem com teste**, e nada é dado como pronto sem a suíte verde.
Testes aqui não são burocracia: já pegaram dois bugs reais que passaram por revisão manual (veja "Armadilhas").

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm test` | Vitest uma vez (unidade + telas, ~5 s) |
| `npm run test:watch` | Vitest em modo watch, para programar junto |
| `npm run test:e2e` | Playwright no Chromium; sobe o próprio Vite na porta 5174 |
| `npm run typecheck` | `tsc` do app, dos testes e do e2e |
| `npm run test:all` | typecheck + Vitest + Playwright: rode antes de encerrar |
| `npm run test:coverage` | cobertura do Vitest em `coverage/` |

Para um arquivo só: `npx vitest run src/pages/auth/Entrar.test.tsx` ou `npx playwright test e2e/login.spec.ts`.
Se o Chromium do Playwright não estiver instalado: `npx playwright install chromium`.

## Qual camada usar

- **Função pura ou hook** → `arquivo.test.ts` ao lado do código (ex.: `src/auth/validacao.test.ts`).
- **Tela ou fluxo entre telas** → `Tela.test.tsx` ao lado da tela, renderizando o app inteiro com `renderApp` (rotas e guards reais). É onde fica a maior parte dos testes: rápido e cobre o comportamento que a pessoa vê.
- **O que só existe em navegador real** → Playwright em `e2e/`. Use para: fluxos críticos de ponta a ponta (cadastro, login, recuperação), área de transferência, storage entre abas, recarregar a página, e qualquer bug que dependa da ordem entre o React e as ações nativas do navegador (o jsdom não reproduz esses casos).

Na dúvida, comece pelo Vitest; suba para o E2E quando o teste no jsdom não consegue falhar sem a correção.

## Supabase nos testes

Nenhum teste fala com o Supabase real nem envia e-mail. Isso é intencional: o projeto é compartilhado e o SMTP tem limite.

**Vitest** — `src/test/setup.ts` troca `src/lib/supabase` por `src/test/supabaseFalso.ts` em todos os testes.

```tsx
import { AuthApiError } from '@supabase/supabase-js';
import { screen, waitFor } from '@testing-library/react';
import { renderApp } from '../../test/renderApp';
import { perfilDeTeste, perfilNovo, supabaseFalso } from '../../test/supabaseFalso';

const { auth } = supabaseFalso.cliente; // todas as funções de auth são vi.fn()

it('mostra erro de credenciais em português', async () => {
  auth.signInWithPassword.mockResolvedValue({ data: {}, error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials') });
  const { user, local } = renderApp('/entrar');
  // ...preenche e clica
  expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
  expect(local()).toBe('/entrar'); // local() = pathname atual
});

it('login cria a sessão como o Supabase faria', async () => {
  auth.signInWithPassword.mockImplementation(async () => {
    supabaseFalso.logar(perfilDeTeste()); // dispara SIGNED_IN
    return { data: {}, error: null };
  });
  // ...
});
```

- `supabaseFalso.logar(perfil)` antes do `renderApp` = começar logado; `perfilNovo()` = sem onboarding.
- `adicionarPerfil(...)` coloca outro torcedor no "banco" (ex.: dono de um apelido); `perfil(id)` lê o estado salvo.
- O estado é zerado depois de cada teste.

**Playwright** — use `test` e `expect` de `e2e/fixtures.ts`. A fixture `backend` (`e2e/backendFalso.ts`) intercepta `/auth/v1` e `/rest/v1`:

```ts
import { expect, test } from './fixtures';

test('...', async ({ page, backend }) => {
  backend.criarUsuario('rafa@example.com', 'Senha#2026', { apelido: 'Rafa_9' }, { pais: 'BR', time_id: 'clube-b', onboarding_concluido_em: '2026-10-01T12:00:00Z' });
  await page.goto('/entrar');
  // ...
  await page.getByLabel('Código de 6 dígitos').fill(backend.ultimoCodigo('rafa@example.com', 'signup'));
  expect(backend.perfilDe('rafa@example.com')).toMatchObject({ time_id: 'clube-b' });
});
```

**Quando o app passar a usar uma chamada nova do Supabase** (tabela, RPC, endpoint de auth), implemente-a nos dois falsos. O backend do Playwright responde 404 "Rota falsa não implementada" para o que não conhece, e é por essa mensagem que você vai perceber. **Quando mudar o schema** (`supabase/migrations`), espelhe as regras que o app depende (unicidade, RLS, triggers, constraints) no `backendFalso.ts` e regenere `src/lib/database.types.ts`.

## Como trabalhar

1. **Antes de mexer**, rode os testes da área para saber o ponto de partida.
2. **Bug**: escreva primeiro o teste que reproduz o bug e veja ele falhar; depois corrija. Se não conseguir fazer o teste falhar sem a correção, o teste não protege nada — tente outra camada (muitas vezes, o E2E).
3. **Funcionalidade nova**: teste o comportamento visível — caminho feliz, mensagens de erro, validações e bordas (vazio, duplicado, limite, sem conexão).
4. **Antes de encerrar**, rode `npm run test:all` e relate os números reais. Se algo ficou sem teste, diga o quê e por quê.

## Como escrever bons testes aqui

- **Busque como a pessoa vê**: `getByRole`, `getByLabelText`, textos visíveis. Evite classes CSS (são hasheadas pelos CSS Modules) e `data-testid`, a não ser para coisas que a pessoa não vê (como o `local` do `renderApp`).
- **Ícones Material são texto `aria-hidden`.** Em rótulos que envolvem um ícone (o `Checkbox`), `getByLabelText` inclui o texto do ícone; use `getByRole('checkbox', { name: '...' })`.
- **Nomes de teste em português**, descrevendo o comportamento ("não deixa salvar com as senhas diferentes"). Em teste de regressão, deixe um comentário curto com o bug.
- **Sem esperas fixas.** Use `findBy*`/`waitFor` no Vitest e as asserções automáticas do Playwright (`await expect(locator)...`); para esperar o servidor, use `page.waitForResponse`.
- **Cuidado com o teste que passa por sorte de tempo.** Testes clicam mais rápido que pessoas. Se o comportamento depende de algo assíncrono (a checagem do apelido tem debounce de 350 ms), espere isso terminar antes da ação, senão o caminho testado nem chega a acontecer.
- **Campo de data no jsdom**: `fireEvent.change(campo, { target: { value: '1994-03-14' } })`; o `user.type` não funciona bem.
- Use `.check({ force: true })` nos checkboxes no Playwright: o input real é invisível e o visual é um `span`.

## Armadilhas que já pegamos

- **Botão que muda de `type` durante o clique** (Onboarding): no Chrome, o React re-renderiza entre o clique e a ação padrão, então um botão que vira `submit` submete o formulário recém-montado. O jsdom não reproduz isso. A regressão está em `e2e/cadastro.spec.ts`; a correção é dar `key` diferente ao botão.
- **`maxLength` em campo que aceita colar** (CodeInput): o navegador corta o texto colado antes do `onChange` limpar. " 123 456" virava "12345". Limite o tamanho no `onChange`.
- **`composes` entre CSS Modules não garante a ordem do CSS**: overrides de cor/borda podem perder. Teste não pega isso; confira na tela (screenshot do Playwright) quando mexer em estilos compartilhados.

## Checklist de entrega

- [ ] Testes novos ou atualizados cobrindo a mudança (e a regressão, se for bug)
- [ ] Falsos do Supabase atualizados, se o app passou a usar algo novo
- [ ] `npm run test:all` verde, com os números reportados
- [ ] PR aberto e CI verde (`gh pr checks --watch`) antes do merge; veja o fluxo no `CLAUDE.md`
