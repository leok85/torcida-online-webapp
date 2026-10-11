import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { supabaseFalso } from './supabaseFalso';

// Todo teste usa o Supabase falso; para checar uma chamada, importe `supabaseFalso` no teste.
vi.mock('../lib/supabase', async () => (await import('./supabaseFalso')).moduloSupabaseFalso);

afterEach(() => {
  cleanup();
  supabaseFalso.resetar();
  localStorage.clear();
  sessionStorage.clear();
});
