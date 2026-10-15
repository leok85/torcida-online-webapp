import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { criarFetchQueAvisaSuspensao } from '../auth/suspensao';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

if (!url || !chave) {
  throw new Error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.local (veja .env.example).');
}

const LEMBRAR = 'to:manter-conectado';

const lembrar = () => localStorage.getItem(LEMBRAR) !== '0';

/** "Manter conectado": a sessão vai para o localStorage; desmarcado, fica só no sessionStorage e some ao fechar a aba. */
export function setManterConectado(valor: boolean) {
  localStorage.setItem(LEMBRAR, valor ? '1' : '0');
}

const armazenamento: SupportedStorage = {
  getItem: (chave) => localStorage.getItem(chave) ?? sessionStorage.getItem(chave),
  setItem: (chave, valor) => {
    const [usar, limpar] = lembrar() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
    usar.setItem(chave, valor);
    limpar.removeItem(chave);
  },
  removeItem: (chave) => {
    localStorage.removeItem(chave);
    sessionStorage.removeItem(chave);
  },
};

export const supabase = createClient<Database>(url, chave, {
  auth: { storage: armazenamento, flowType: 'pkce' },
  global: { fetch: criarFetchQueAvisaSuspensao() },
});

/** Provedores sociais ligados no painel do Supabase; o botão só aparece quando o provedor está ativo. */
let provedores: Promise<Record<string, boolean>> | undefined;

export function provedoresAtivos() {
  provedores ??= fetch(`${url}/auth/v1/settings`, { headers: { apikey: chave } })
    .then((r) => (r.ok ? r.json() : { external: {} }))
    .then((s: { external?: Record<string, boolean> }) => s.external ?? {})
    .catch(() => ({}));
  return provedores;
}
