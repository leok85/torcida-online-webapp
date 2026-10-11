import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    // Não lê o .env.local: os testes nunca devem apontar para o Supabase real.
    envDir: './src/test',
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'supabase/**/*.test.ts'],
      setupFiles: ['./src/test/setup.ts'],
      env: {
        VITE_SUPABASE_URL: 'http://supabase.test',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_teste',
        VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_teste',
      },
      coverage: {
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/lib/database.types.ts'],
      },
    },
  }),
);
