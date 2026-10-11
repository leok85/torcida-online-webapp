// Edge Function (Deno): POST /functions/v1/gerenciar-assinatura { acao: 'cancelar' | 'reativar' | 'portal' }.
import { banco, pagamentos } from '../_compartilhado/adaptadores.ts';
import { gerenciarAssinatura } from './handler.ts';

Deno.serve((req) => gerenciarAssinatura(req, banco, pagamentos));
