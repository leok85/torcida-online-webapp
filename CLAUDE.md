# Torcida Online — web app

React 19 + Vite + TypeScript, CSS Modules e Supabase (auth e Postgres, projeto `rtgsbxsscwumcfpcytzq`).
Interface, comentários e nomes do domínio em português.

## Regra: toda mudança vem com teste

Ao criar ou alterar código, escreva ou atualize os testes no mesmo trabalho e rode `npm run test:all` antes de encerrar.
Como testar, onde cada teste mora e as armadilhas conhecidas estão na skill `qa` (`.claude/skills/qa/SKILL.md`).

## Regra: toda feature entra por PR com CI verde

A `main` é protegida: ninguém faz push direto. Para cada feature ou correção:

1. Crie uma branch a partir da `main` atualizada (`feat/...`, `fix/...`).
2. Faça os commits com os testes junto e rode `npm run test:all` localmente.
3. Faça push e abra o PR com `gh pr create` (descreva o que mudou e como foi testado).
4. Espere o CI (`.github/workflows/ci.yml`) ficar verde: `gh pr checks --watch`. Se falhar, corrija na mesma branch.
5. Só faça merge com o CI verde (`gh pr merge --squash --delete-branch`) e confirme com quem pediu a feature antes de mesclar.

## Comandos

- `npm run dev` — app em http://localhost:5173 (precisa de `.env.local`; veja `.env.example`)
- `npm test` / `npm run test:watch` — Vitest
- `npm run test:e2e` — Playwright
- `npm run test:all` — typecheck + Vitest + Playwright
- `npm run build` — typecheck + build de produção

## Supabase

- Migrations em `supabase/migrations/`; depois de mudar o schema, regenere `src/lib/database.types.ts` e atualize os falsos dos testes.
- Templates de e-mail (código de 6 dígitos) em `supabase/templates/`, para colar no painel. O visual segue o `Email Template.html` do projeto Torcida Online no Claude Design; `templates.test.ts` confere variáveis, marcadores e imagens.
