// Convidar amigos: o código de convite é o apelido, e o link é /r/APELIDO no web app.
// O convite conta quando o amigo escolhe o clube; o XP de cada lado fica para o sistema de XP (convite_contou_em).
import { chamarFuncao, type Resultado } from '../assinatura/funcoes';
import { supabase } from '../lib/supabase';

export type Convidado = { chave: string; nome: string; estado: 'ativo' | 'sem_time' | 'pendente'; reenviado: boolean; desde: string };

export const LIMITE_DIARIO = 10;
export const BONUS_DO_CONVITE = 100;

export const linkDoConvite = (apelido: string) => `${window.location.origin}/r/${encodeURIComponent(apelido)}`;

/** Mesma regra do servidor: sem espaços, aspas nem sinais de tag. */
export const emailDeConviteValido = (email: string) => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email);

// O link /r/ guardado até o perfil existir: cobre a verificação de e-mail, recarregar e o cadastro pelo Google.
const CHAVE = 'to:convite';
export function guardarConvitePendente(apelido: string) {
  try {
    localStorage.setItem(CHAVE, apelido);
  } catch {
    // sem storage, o convite ainda vai no cadastro por e-mail (raw_user_meta_data.convite)
  }
}
export function lerConvitePendente() {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}
export function limparConvitePendente() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    // nada a limpar
  }
}

/** Quem chamou, para a página /r/APELIDO; null se o código não for de nenhum torcedor. */
export async function conviteDe(codigo: string): Promise<{ apelido: string; clube: string | null } | null> {
  const { data, error } = await supabase.rpc('convite_de', { codigo });
  if (error) return null;
  return (data as { apelido: string; clube: string | null }[] | null)?.[0] ?? null;
}

export async function meuConvidador(): Promise<string | null> {
  const { data, error } = await supabase.rpc('meu_convidador');
  return error ? null : ((data as string | null) ?? null);
}

export type ErroAoAplicar = 'convite_nao_encontrado' | 'convite_proprio' | 'convite_encerrado' | 'falha';

export async function aplicarConvite(codigo: string): Promise<{ ok: true; apelido: string } | { ok: false; erro: ErroAoAplicar }> {
  const { data, error } = await supabase.rpc('aplicar_convite', { codigo: codigo.trim().replace(/^@/, '') });
  if (!error) return { ok: true, apelido: data as string };
  const hint = (error as { hint?: string }).hint;
  return { ok: false, erro: hint === 'convite_nao_encontrado' || hint === 'convite_proprio' || hint === 'convite_encerrado' ? hint : 'falha' };
}

export async function buscarConvidados(): Promise<Convidado[] | null> {
  const { data, error } = await supabase.rpc('meus_convidados');
  return error ? null : ((data as Convidado[] | null) ?? []);
}

export async function convitesRestantes(): Promise<number> {
  const { data, error } = await supabase.rpc('convites_restantes');
  return error || typeof data !== 'number' ? LIMITE_DIARIO : data;
}

export const enviarConvites = (emails: string[], mensagem: string): Promise<Resultado<{ enviados: string[]; falharam: string[] }>> =>
  chamarFuncao('convidar-amigos', { acao: 'enviar', emails, mensagem });

export const reenviarConvite = (email: string) => chamarFuncao<{ ok: true }>('convidar-amigos', { acao: 'reenviar', email });

/** Mensagem do erro da função convidar-amigos. */
export function mensagemDoConvite(erro: string) {
  switch (erro) {
    case 'ja_convidado':
      return 'Um desses e-mails já recebeu convite';
    case 'limite_diario':
      return `Você já mandou ${LIMITE_DIARIO} convites hoje. Amanhã libera de novo.`;
    case 'proprio_email':
      return 'Esse é o seu e-mail.';
    case 'email_invalido':
      return 'Corrija o e-mail marcado em vermelho';
    case 'email_indisponivel':
      return 'O envio de convites está fora do ar. Copie o link e mande por onde preferir.';
    default:
      return 'Não deu para enviar agora. Tente de novo.';
  }
}
