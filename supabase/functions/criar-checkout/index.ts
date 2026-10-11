// Edge Function (Deno): POST /functions/v1/criar-checkout { plano, moeda } com o JWT do torcedor.
import { banco, pagamentos } from '../_compartilhado/adaptadores.ts';
import { criarCheckout } from './handler.ts';

Deno.serve((req) => criarCheckout(req, banco, pagamentos));
