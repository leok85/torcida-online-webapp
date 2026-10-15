// Restrições (migration 20261027100000_usuarios_no_admin) para os dois falsos: minhas_restricoes() e o trigger
// barrar_restrito, que recusa as ações de quem está suspenso e as publicações (chat e fotos) de quem está silenciado.

export type RestricaoDeTeste = { usuario_id: string; tipo: 'silencio' | 'suspensao'; ate: string; encerrada_em?: string | null };

const emVigor = (r: RestricaoDeTeste, agora: Date) => !r.encerrada_em && new Date(r.ate) > agora;

export function minhasRestricoesDeTeste(restricoes: RestricaoDeTeste[], usuarioId: string | undefined, agora = new Date()) {
  const porTipo = new Map<string, string>();
  for (const r of restricoes) {
    if (r.usuario_id !== usuarioId || !emVigor(r, agora)) continue;
    if (!porTipo.has(r.tipo) || porTipo.get(r.tipo)! < r.ate) porTipo.set(r.tipo, r.ate);
  }
  return [...porTipo].map(([tipo, ate]) => ({ tipo, ate }));
}

const DATA_E_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** barrar_restrito(): o erro do trigger, ou null quando a ação passa. `publicar` = chat e fotos (o silêncio vale). */
export function barrarRestritoDeTeste(restricoes: RestricaoDeTeste[], usuarioId: string | undefined, publicar: boolean, agora = new Date()) {
  const minhas = minhasRestricoesDeTeste(restricoes, usuarioId, agora);
  if (minhas.some((r) => r.tipo === 'suspensao')) return { code: 'P0001', hint: 'suspenso', message: 'Conta suspensa' };
  const silencio = minhas.find((r) => r.tipo === 'silencio');
  if (publicar && silencio) {
    return { code: 'P0001', hint: 'silenciado', message: `Você está silenciado até ${DATA_E_HORA.format(new Date(silencio.ate)).replace(',', '')}` };
  }
  return null;
}
