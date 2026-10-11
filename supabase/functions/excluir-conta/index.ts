// Edge Function (Deno): POST /functions/v1/excluir-conta com o JWT do torcedor logado.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { excluirConta } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) => excluirConta(req, admin));
