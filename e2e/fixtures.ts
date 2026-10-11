import { test as base, expect } from '@playwright/test';
import { BackendFalso } from './backendFalso';

/** `backend` é instalado antes de qualquer navegação: nenhuma chamada sai para o Supabase real. */
export const test = base.extend<{ backend: BackendFalso }>({
  backend: async ({ context }, use) => {
    const backend = new BackendFalso();
    await backend.instalar(context);
    await use(backend);
  },
});

export { expect };
