// Edge Function (Deno): POST /functions/v1/excluir-conta com o JWT do torcedor logado.
import { admin, banco, pagamentos } from '../_compartilhado/adaptadores.ts';
import { excluirConta } from './handler.ts';

async function encerrarAssinaturas(usuarioId: string) {
  const assinatura = await banco.assinaturaWebEmAndamento(usuarioId);
  if (assinatura) await pagamentos.cancelarAgora(assinatura.id_externo);
}

Deno.serve((req) => excluirConta(req, admin, encerrarAssinaturas));
