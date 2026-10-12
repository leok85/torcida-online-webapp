// Edge Function (Deno): POST /functions/v1/gerenciar-assinatura { acao, ... }; as ações estão em handler.ts.
import { banco, correio, pagamentos } from '../_compartilhado/adaptadores.ts';
import { gerenciarAssinatura } from './handler.ts';

Deno.serve((req) => gerenciarAssinatura(req, banco, pagamentos, correio));
