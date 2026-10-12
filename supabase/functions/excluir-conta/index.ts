// Edge Function (Deno): POST /functions/v1/excluir-conta.
// Com o JWT do torcedor logado, agenda a exclusão; com o cabeçalho x-segredo (pg_cron), apaga as vencidas.
// Publicada com verify_jwt desligado: o handler valida o token ou o segredo.
import { admin, banco, pagamentos } from '../_compartilhado/adaptadores.ts';
import { excluirConta } from './handler.ts';

async function encerrarAssinaturas(usuarioId: string) {
  const assinatura = await banco.assinaturaWebEmAndamento(usuarioId);
  if (assinatura) await pagamentos.cancelarAgora(assinatura.id_externo);
}

async function agendarExclusao(usuarioId: string, data: Date) {
  const { error } = await admin.from('perfis').update({ exclusao_agendada_para: data.toISOString() }).eq('id', usuarioId);
  if (error) throw new Error(error.message);
}

async function contasVencidas(agora: Date) {
  const { data, error } = await admin.from('perfis').select('id').lte('exclusao_agendada_para', agora.toISOString());
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => p.id as string);
}

async function apagarArquivos(usuarioId: string) {
  const { data } = await admin.storage.from('avatares').list(usuarioId);
  if (data?.length) await admin.storage.from('avatares').remove(data.map((f) => `${usuarioId}/${f.name}`));
}

Deno.serve((req) =>
  excluirConta(req, {
    admin,
    encerrarAssinaturas,
    agendarExclusao,
    contasVencidas,
    apagarArquivos,
    // O mesmo segredo que o pg_cron manda para a sincronização dos jogos.
    segredo: Deno.env.get('SINCRONIZAR_PARTIDAS_SEGREDO'),
  }),
);
