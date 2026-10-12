// Dados da conta (W21): foto, regra do apelido, formas de entrar e aparelhos conectados.
import type { UserIdentity } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/** Uma troca de apelido a cada 30 dias (a mesma regra do trigger perfis_antes_de_atualizar). */
export const DIAS_ENTRE_TROCAS_DE_APELIDO = 30;
/** Prazo para desistir da exclusão (o mesmo da Edge Function excluir-conta). */
export const DIAS_PARA_DESISTIR = 30;

const DIA_MS = 86_400_000;
const FUSO = 'America/Sao_Paulo';
const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: FUSO });

export const dataCurta = (iso: string) => DATA.format(new Date(iso));

/* ---------- foto ---------- */

const BUCKET = 'avatares';
export const TIPOS_DE_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
export const FOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Tamanho da foto salva, já recortada. */
export const LADO_DA_FOTO = 512;

/** URL pública da foto salva em perfis.foto ("<id>/<arquivo>.webp"). */
export const urlDaFoto = (foto: string | null | undefined) =>
  foto ? supabase.storage.from(BUCKET).getPublicUrl(foto).data.publicUrl : null;

/** Mensagem de erro do arquivo escolhido, ou null se ele serve. */
export function problemaDaFoto(arquivo: { type: string; size: number }) {
  if (!TIPOS_DE_FOTO.includes(arquivo.type)) return 'Use uma imagem JPG, PNG ou WebP.';
  if (arquivo.size > FOTO_MAX_BYTES) return 'A imagem passa de 5 MB. Escolha uma menor.';
  return null;
}

/** Envia a foto recortada para a pasta do torcedor e devolve o caminho para gravar em perfis.foto. */
export async function enviarFoto(usuarioId: string, imagem: Blob) {
  const tipo = imagem.type === 'image/jpeg' ? 'jpg' : 'webp';
  // Nome novo a cada troca: a URL muda e nenhum cache mostra a foto antiga.
  const caminho = `${usuarioId}/${crypto.randomUUID()}.${tipo}`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, imagem, { contentType: imagem.type, cacheControl: '31536000' });
  if (error) throw error;
  return caminho;
}

/** Apaga uma foto antiga; se falhar, só sobra um arquivo sem uso na pasta do torcedor. */
export async function apagarFoto(caminho: string) {
  await supabase.storage.from(BUCKET).remove([caminho]);
}

/* ---------- apelido ---------- */

/** Quando o apelido pode ser trocado de novo (null = pode agora). */
export function proximaTrocaDeApelido(alteradoEm: string | null, agora = new Date()) {
  if (!alteradoEm) return null;
  const libera = new Date(new Date(alteradoEm).getTime() + DIAS_ENTRE_TROCAS_DE_APELIDO * DIA_MS);
  return libera > agora ? libera : null;
}

/** Linha de apoio do apelido: "Última troca há 92 dias · pode trocar agora". */
export function textoDoApelido(alteradoEm: string | null, agora = new Date()) {
  if (!alteradoEm) return 'Dá para trocar uma vez a cada 30 dias';
  const dias = Math.floor((agora.getTime() - new Date(alteradoEm).getTime()) / DIA_MS);
  const ultima = dias < 1 ? 'Trocado hoje' : `Última troca há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  const libera = proximaTrocaDeApelido(alteradoEm, agora);
  return libera ? `${ultima} · próxima troca em ${dataCurta(libera.toISOString())}` : `${ultima} · pode trocar agora`;
}

/* ---------- senha ---------- */

/** Linha de apoio da senha: "Alterada hoje", "Alterada há 3 dias", "Alterada há 4 meses". */
export function textoDaSenha(alteradaEm: string, agora = new Date()) {
  const dias = Math.floor((agora.getTime() - new Date(alteradaEm).getTime()) / DIA_MS);
  if (dias < 1) return 'Alterada hoje';
  if (dias < 30) return `Alterada há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `Alterada há ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(dias / 365);
  return `Alterada há ${anos} ${anos === 1 ? 'ano' : 'anos'}`;
}

/* ---------- formas de entrar ---------- */

export type Provedor = 'email' | 'apple' | 'google';

/** Contas Apple e Google ligadas ao torcedor, e se ele tem senha (identidade "email"). */
export async function formasDeEntrar() {
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;
  return data.identities;
}

export const identidadeDe = (identidades: UserIdentity[], provedor: Provedor) => identidades.find((i) => i.provider === provedor);

export const emailDaIdentidade = (i: UserIdentity | undefined) =>
  typeof i?.identity_data?.email === 'string' ? (i.identity_data.email as string) : null;

/* ---------- aparelhos ---------- */

export type Aparelho = { id: string; nome: string; tipo: 'computador' | 'celular'; usadoEm: string; atual: boolean };

/** "Chrome · macOS", "iPhone · app": o que dá para dizer pelo user agent da sessão. */
export function descreverAparelho(userAgent: string | null): Pick<Aparelho, 'nome' | 'tipo'> {
  const ua = userAgent ?? '';
  const celular = /iPhone|iPad|Android|Mobile/i.test(ua);
  const tipo = celular ? 'celular' : 'computador';
  // O app nativo não é um navegador: chega com o cliente HTTP do sistema (Expo/React Native).
  const app = /Expo|okhttp|CFNetwork|Dalvik|ReactNative/i.test(ua);
  const sistema = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android|okhttp|Dalvik/.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Windows/.test(ua)
            ? 'Windows'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : null;
  if (app) return { nome: `${sistema ?? 'Celular'} · app`, tipo: 'celular' };
  const navegador = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  if (!navegador && !sistema) return { nome: 'Aparelho desconhecido', tipo };
  return { nome: [navegador ?? 'Navegador', sistema].filter(Boolean).join(' · '), tipo };
}

export async function meusAparelhos(): Promise<Aparelho[]> {
  const { data, error } = await supabase.rpc('meus_aparelhos');
  if (error) throw error;
  return data.map((s) => ({ id: s.id, ...descreverAparelho(s.user_agent), usadoEm: s.usado_em, atual: s.atual }));
}

export async function encerrarAparelho(id: string) {
  const { error } = await supabase.rpc('encerrar_aparelho', { sessao: id });
  if (error) throw error;
}

/** "agora", "há 2 h", "há 3 dias": último uso de um aparelho. */
export function usadoHa(iso: string, agora = new Date()) {
  const minutos = Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutos < 5) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  if (minutos < 1440) return `há ${Math.floor(minutos / 60)} h`;
  const dias = Math.floor(minutos / 1440);
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}
