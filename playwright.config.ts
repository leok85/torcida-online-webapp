import { defineConfig, devices } from '@playwright/test';

const PORTA = 5174;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORTA}`,
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx vite --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}`,
    // Servidor próprio, com o Supabase apontando para um host que não existe: o que escapar do backend falso falha.
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'http://supabase.e2e', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e', VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_e2e' },
  },
});
