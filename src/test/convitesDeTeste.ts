// Regras de convite da migration 20261016100000_convites.sql, para os dois falsos (Vitest e Playwright).

type PerfilMinimo = {
  id: string;
  apelido: string | null;
  apelido_anterior: string | null;
  onboarding_concluido_em: string | null;
  exclusao_agendada_para: string | null;
  convidado_por: string | null;
  convite_contou_em: string | null;
  time_id: number | null;
  criado_em: string;
};

export type ConviteEmailDeTeste = { convidador: string; email: string; mensagem: string | null; enviado_em: string; reenviado_em: string | null };

export const LIMITE_DE_CONVITES = 10;

/** dono_do_convite(): apelido atual ou anterior de quem já escolheu o clube e não pediu exclusão. */
export function donoDoConvite<P extends PerfilMinimo>(perfis: Iterable<P>, codigo: unknown): P | undefined {
  if (typeof codigo !== 'string' || !codigo.trim()) return undefined;
  const alvo = codigo.trim().slice(0, 20).toLowerCase();
  const validos = [...perfis].filter((p) => p.onboarding_concluido_em && !p.exclusao_agendada_para);
  return validos.find((p) => p.apelido?.toLowerCase() === alvo) ?? validos.find((p) => p.apelido_anterior?.toLowerCase() === alvo);
}

const mesmoDia = (iso: string | null) => !!iso && new Date(iso).toDateString() === new Date().toDateString();

/** convites_enviados_hoje(): envios e reenvios do dia. */
export const convitesHoje = (convites: ConviteEmailDeTeste[], convidador: string) =>
  convites.filter((c) => c.convidador === convidador && mesmoDia(c.enviado_em)).length +
  convites.filter((c) => c.convidador === convidador && mesmoDia(c.reenviado_em)).length;

/** meus_convidados(): quem entrou pelo convite e os e-mails que ainda não criaram conta. */
export function convidadosDe(perfis: Iterable<PerfilMinimo>, convites: ConviteEmailDeTeste[], emailDe: (id: string) => string | undefined, eu: string) {
  const meus = [...perfis].filter((p) => p.convidado_por === eu);
  const cadastrados = new Set(meus.map((p) => emailDe(p.id)?.toLowerCase()));
  const linhas = [
    ...meus.map((p) => ({
      chave: p.id,
      nome: p.apelido ?? 'Novo torcedor',
      estado: (p.onboarding_concluido_em ? 'ativo' : 'sem_time') as 'ativo' | 'sem_time' | 'pendente',
      reenviado: false,
      desde: p.convite_contou_em ?? p.criado_em,
    })),
    ...convites
      .filter((c) => c.convidador === eu && !cadastrados.has(c.email))
      .map((c) => ({ chave: c.email, nome: c.email, estado: 'pendente' as const, reenviado: !!c.reenviado_em, desde: c.enviado_em })),
  ];
  const ordem = { ativo: 0, sem_time: 1, pendente: 2 };
  return linhas.sort((a, b) => ordem[a.estado] - ordem[b.estado] || b.desde.localeCompare(a.desde));
}

/** aplicar_convite(): devolve o apelido de quem convidou, ou o hint do erro. */
export function aplicarConviteDeTeste<P extends PerfilMinimo>(perfis: Map<string, P>, eu: string, codigo: unknown): { apelido: string } | { hint: string } {
  const perfil = perfis.get(eu);
  if (!perfil) return { hint: 'sem_perfil' };
  if (perfil.convidado_por) return { apelido: perfis.get(perfil.convidado_por)?.apelido ?? '' };
  if (perfil.onboarding_concluido_em) return { hint: 'convite_encerrado' };
  const dono = donoDoConvite(perfis.values(), typeof codigo === 'string' ? codigo.replace(/^@/, '') : codigo);
  if (!dono) return { hint: 'convite_nao_encontrado' };
  if (dono.id === eu) return { hint: 'convite_proprio' };
  perfis.set(eu, { ...perfil, convidado_por: dono.id });
  return { apelido: dono.apelido! };
}

/** Função convidar-amigos (handler + registrar_convites/registrar_reenvio), sem o envio de verdade. */
export function convidarAmigosDeTeste(
  convites: ConviteEmailDeTeste[],
  eu: { id: string; email: string | undefined },
  corpo: { acao?: string; emails?: unknown; mensagem?: unknown; email?: unknown },
): { status: number; corpo: object } {
  const valido = (e: string) => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e);
  if (corpo.acao === 'enviar') {
    const emails = [...new Set((Array.isArray(corpo.emails) ? corpo.emails : []).map((e) => String(e).trim().toLowerCase()))];
    if (!emails.length || emails.length > LIMITE_DE_CONVITES) return { status: 400, corpo: { erro: 'emails_invalidos' } };
    if (emails.some((e) => !valido(e))) return { status: 400, corpo: { erro: 'email_invalido' } };
    if (eu.email && emails.includes(eu.email.toLowerCase())) return { status: 400, corpo: { erro: 'proprio_email' } };
    const repetido = emails.find((e) => convites.some((c) => c.convidador === eu.id && c.email === e));
    if (repetido) return { status: 409, corpo: { erro: 'ja_convidado', email: repetido } };
    if (convitesHoje(convites, eu.id) + emails.length > LIMITE_DE_CONVITES) return { status: 429, corpo: { erro: 'limite_diario' } };
    const mensagem = typeof corpo.mensagem === 'string' && corpo.mensagem.trim() ? corpo.mensagem.trim() : null;
    for (const email of emails) convites.push({ convidador: eu.id, email, mensagem, enviado_em: new Date().toISOString(), reenviado_em: null });
    return { status: 200, corpo: { enviados: emails, falharam: [] } };
  }
  if (corpo.acao === 'reenviar') {
    const convite = convites.find((c) => c.convidador === eu.id && c.email === String(corpo.email).trim().toLowerCase());
    if (!convite) return { status: 404, corpo: { erro: 'nao_convidado' } };
    if (convite.reenviado_em) return { status: 409, corpo: { erro: 'ja_reenviado' } };
    if (convitesHoje(convites, eu.id) + 1 > LIMITE_DE_CONVITES) return { status: 429, corpo: { erro: 'limite_diario' } };
    convite.reenviado_em = new Date().toISOString();
    return { status: 200, corpo: { ok: true } };
  }
  return { status: 400, corpo: { erro: 'acao_invalida' } };
}
