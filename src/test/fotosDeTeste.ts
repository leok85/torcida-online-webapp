// Regras das fotos da torcida (W07) para os dois falsos do Supabase (Vitest e Playwright): as mesmas de
// registrar_foto(), fotos_do_jogo(), curtir_foto() e denunciar_foto() das migrations.
import { DENUNCIAS_PARA_OCULTAR, LIMITE_DE_JOINHAS, janelaDaFoto, joinhasAbertos, type Momento } from '../data/janelaDasFotos';
import type { Partida } from '../lib/database.types';

export type FotoDeTeste = {
  id: string;
  partida_id: number;
  clube_id: number;
  autor_id: string;
  autor_apelido: string;
  momento: Momento;
  etiqueta: string;
  caminho: string;
  legenda: string;
  curtidas: number;
  denuncias: number;
  oculta: boolean;
  criado_em: string;
};

export type EstadoDasFotos = {
  fotos: FotoDeTeste[];
  joinhas: { foto_id: string; usuario_id: string; partida_id: number }[];
  denuncias: { foto_id: string; usuario_id: string }[];
};

export const estadoDasFotos = (): EstadoDasFotos => ({ fotos: [], joinhas: [], denuncias: [] });

type Torcedor = { id: string; apelido: string | null; time_id: number | null } | undefined;
type Recusa = { hint: string; code: string };
const recusa = (hint: string): Recusa => ({ hint, code: 'P0001' });

const ETIQUETAS = ['Antes do jogo', '1º tempo', 'Intervalo', '2º tempo', 'Comemoração'];

function torcedor(eu: Torcedor, assinante: boolean, partida: Partida | undefined): Recusa | null {
  if (!eu?.time_id || !eu.apelido) return recusa('sem_perfil');
  if (!assinante) return recusa('so_membros');
  if (!partida || ![partida.mandante_id, partida.visitante_id].includes(eu.time_id)) return recusa('outro_clube');
  return null;
}

/** registrar_foto(): grava a foto da janela aberta (uma por janela). */
export function registrarFotoDeTeste(
  estado: EstadoDasFotos,
  eu: Torcedor,
  assinante: boolean,
  partidas: Partida[],
  pedido: { p_partida: number; p_caminho: string; p_etiqueta: string; p_legenda?: string },
  agora = new Date(),
): Recusa | string {
  const partida = partidas.find((p) => p.id === pedido.p_partida);
  const erro = torcedor(eu, assinante, partida);
  if (erro) return erro;
  const janela = janelaDaFoto(partida!, agora);
  if (!janela) return recusa('fora_da_janela');
  if (!pedido.p_caminho?.startsWith(`${partida!.id}/${eu!.time_id}/${eu!.id}/`)) return recusa('caminho_invalido');
  if (!ETIQUETAS.includes(pedido.p_etiqueta)) return recusa('etiqueta_invalida');
  const legenda = (pedido.p_legenda ?? '').trim();
  if (legenda.length > 80) return recusa('legenda_longa');
  if (estado.fotos.some((f) => f.partida_id === partida!.id && f.autor_id === eu!.id && f.momento === janela)) return recusa('ja_enviou');
  const id = `foto-${estado.fotos.length + 1}`;
  estado.fotos.push({
    id,
    partida_id: partida!.id,
    clube_id: eu!.time_id!,
    autor_id: eu!.id,
    autor_apelido: eu!.apelido!,
    momento: janela,
    etiqueta: pedido.p_etiqueta,
    caminho: pedido.p_caminho,
    legenda,
    curtidas: 0,
    denuncias: 0,
    oculta: false,
    criado_em: agora.toISOString(),
  });
  return id;
}

/** fotos_do_jogo(): a galeria da minha torcida, da mais curtida para a menos. */
export function fotosDoJogoDeTeste(estado: EstadoDasFotos, eu: Torcedor, assinante: boolean, partidaId: number) {
  if (!eu?.time_id || !assinante) return [];
  return estado.fotos
    .filter((f) => f.partida_id === partidaId && f.clube_id === eu.time_id)
    .filter((f) => !f.oculta || f.autor_id === eu.id)
    .filter((f) => !estado.denuncias.some((d) => d.foto_id === f.id && d.usuario_id === eu.id))
    .sort((a, b) => b.curtidas - a.curtidas || a.criado_em.localeCompare(b.criado_em))
    .map((f) => ({
      id: f.id,
      autor_apelido: f.autor_apelido,
      momento: f.momento,
      etiqueta: f.etiqueta,
      caminho: f.caminho,
      legenda: f.legenda,
      curtidas: f.curtidas,
      eu_curti: estado.joinhas.some((j) => j.foto_id === f.id && j.usuario_id === eu.id),
      minha: f.autor_id === eu.id,
      criado_em: f.criado_em,
    }));
}

/** curtir_foto(): dá ou tira o joinha; devolve se ficou curtida. */
export function curtirFotoDeTeste(estado: EstadoDasFotos, eu: Torcedor, assinante: boolean, partidas: Partida[], fotoId: string, agora = new Date()): Recusa | boolean {
  const foto = estado.fotos.find((f) => f.id === fotoId);
  if (!foto) return recusa('foto_invalida');
  const partida = partidas.find((p) => p.id === foto.partida_id);
  const erro = torcedor(eu, assinante, partida);
  if (erro) return erro;
  if (foto.clube_id !== eu!.time_id || foto.oculta) return recusa('foto_invalida');
  if (foto.autor_id === eu!.id) return recusa('propria_foto');
  if (!joinhasAbertos(partida!, agora)) return recusa('joinhas_fechados');
  const i = estado.joinhas.findIndex((j) => j.foto_id === fotoId && j.usuario_id === eu!.id);
  if (i >= 0) {
    estado.joinhas.splice(i, 1);
    foto.curtidas = Math.max(0, foto.curtidas - 1);
    return false;
  }
  if (estado.joinhas.filter((j) => j.usuario_id === eu!.id && j.partida_id === foto.partida_id).length >= LIMITE_DE_JOINHAS) return recusa('limite_de_joinhas');
  estado.joinhas.push({ foto_id: fotoId, usuario_id: eu!.id, partida_id: foto.partida_id });
  foto.curtidas += 1;
  return true;
}

/** denunciar_foto(): some para quem denunciou; com 3 denúncias sai da galeria. */
export function denunciarFotoDeTeste(estado: EstadoDasFotos, eu: Torcedor, assinante: boolean, partidas: Partida[], fotoId: string): Recusa | null {
  const foto = estado.fotos.find((f) => f.id === fotoId);
  if (!foto) return recusa('foto_invalida');
  const erro = torcedor(eu, assinante, partidas.find((p) => p.id === foto.partida_id));
  if (erro) return erro;
  if (foto.clube_id !== eu!.time_id) return recusa('foto_invalida');
  if (foto.autor_id === eu!.id) return recusa('propria_foto');
  if (estado.denuncias.some((d) => d.foto_id === fotoId && d.usuario_id === eu!.id)) return null;
  estado.denuncias.push({ foto_id: fotoId, usuario_id: eu!.id });
  foto.denuncias += 1;
  foto.oculta = foto.oculta || foto.denuncias >= DENUNCIAS_PARA_OCULTAR;
  return null;
}
