// Notícias (migration 20261028100000_noticias) para os dois falsos do Supabase (Vitest e Playwright): as mesmas regras de
// noticias_do_clube(), noticia(), ler_noticia(), abrir_original(), curtir_noticia() e dos comentários. O trigger
// barrar_restrito entra como `restrito` (cada falso passa o seu, ver restricoesDeTeste) e roda onde o banco roda: no
// insert, depois das checagens da função. Silenciado não comenta; suspenso não curte nem comenta.
import { nivelDoXp } from '../data/nivelDoXp';
import { lancarXp, type EstadoDoXp } from './xpDeTeste';

export type NoticiaDeTeste = {
  id: string;
  titulo: string;
  resumo: string;
  /** URL externa da imagem do feed. */
  imagem_url: string | null;
  link: string;
  /** Nome da fonte guardado na notícia (fonte_nome). */
  fonte: string;
  /** Vazio = todas as torcidas. */
  clubes: number[];
  estado: 'recebida' | 'publicada' | 'descartada';
  publicada_em: string | null;
  leituras: number;
  cliques: number;
  curtidas: number;
  comentarios: number;
};

export type ComentarioDeTeste = { id: number; noticia_id: string; autor_id: string; texto: string; curtidas: number; oculto: boolean; criado_em: string };

export type EstadoDasNoticias = {
  noticias: NoticiaDeTeste[];
  leituras: { noticia_id: string; usuario_id: string; lida_em: string }[];
  cliques: { noticia_id: string; usuario_id: string }[];
  curtidas: { noticia_id: string; usuario_id: string }[];
  comentarios: ComentarioDeTeste[];
  curtidasDeComentarios: { comentario_id: number; usuario_id: string }[];
};

export const estadoDasNoticias = (): EstadoDasNoticias => ({ noticias: [], leituras: [], cliques: [], curtidas: [], comentarios: [], curtidasDeComentarios: [] });

type Torcedor = { id: string; apelido: string | null; time_id: number | null; onboarding_concluido_em?: string | null } | undefined;
type Recusa = { hint: string; code: string; message?: string };
const recusa = (hint: string, code = 'P0001'): Recusa => ({ hint, code });
/** barrar_restrito(): o erro do trigger, ou null. `publicar` = o silêncio também vale (comentário). */
export type Restrito = (publicar: boolean) => Recusa | null;
const livre: Restrito = () => null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let sequencia = 0;
/** Notícia publicada do Palmeiras (162), de uma fonte externa. Sobrescreva só o que importa para o teste. */
export function noticiaDeTeste(campos: Partial<NoticiaDeTeste> = {}): NoticiaDeTeste {
  sequencia += 1;
  return {
    id: `00000000-0000-4000-9000-${String(sequencia).padStart(12, '0')}`,
    titulo: `Notícia de teste número ${sequencia}`,
    resumo: 'Resumo da notícia.',
    imagem_url: null,
    link: `https://gazeta.example.com/noticias/${sequencia}`,
    fonte: 'Gazeta Esportiva',
    clubes: [162],
    estado: 'publicada',
    publicada_em: '2026-10-14T12:00:00Z',
    leituras: 0,
    cliques: 0,
    curtidas: 0,
    comentarios: 0,
    ...campos,
  };
}

/** noticia_para_mim(): publicada e do clube do torcedor (ou de todas as torcidas). */
function paraMim(n: NoticiaDeTeste | undefined, eu: Torcedor): n is NoticiaDeTeste {
  return !!n && !!eu && n.estado === 'publicada' && (n.clubes.length === 0 || (eu.time_id !== null && n.clubes.includes(eu.time_id)));
}

const colunas = (n: NoticiaDeTeste) => ({
  id: n.id,
  titulo: n.titulo,
  resumo: n.resumo,
  imagem_url: n.imagem_url,
  link: n.link,
  fonte: n.fonte,
  publicada_em: n.publicada_em!,
  leituras: n.leituras,
  curtidas: n.curtidas,
  comentarios: n.comentarios,
});

const marcas = (estado: EstadoDasNoticias, n: NoticiaDeTeste, eu: Torcedor) => ({
  curti: estado.curtidas.some((c) => c.noticia_id === n.id && c.usuario_id === eu?.id),
  li: estado.leituras.some((l) => l.noticia_id === n.id && l.usuario_id === eu?.id),
});

/** Ordem publicada_em desc, id desc (uuid compara como o texto em minúsculas). */
const maisNova = (a: { publicada_em: string; id: string }, b: { publicada_em: string; id: string }) =>
  new Date(b.publicada_em).getTime() - new Date(a.publicada_em).getTime() || b.id.toLowerCase().localeCompare(a.id.toLowerCase());

/** noticias_do_clube(): cursor (publicada_em, id) < (p_antes, p_antes_id ?? 'ffff…'), como a comparação de tupla do banco. */
export function noticiasDoClubeDeTeste(
  estado: EstadoDasNoticias,
  eu: Torcedor,
  { p_limite = 20, p_antes = null, p_antes_id = null }: { p_limite?: number; p_antes?: string | null; p_antes_id?: string | null },
) {
  const cursor = p_antes == null ? null : { publicada_em: p_antes, id: p_antes_id ?? 'ffffffff-ffff-ffff-ffff-ffffffffffff' };
  return estado.noticias
    .filter((n) => paraMim(n, eu) && (cursor == null || maisNova(cursor, { publicada_em: n.publicada_em!, id: n.id }) < 0))
    .sort((a, b) => maisNova({ publicada_em: a.publicada_em!, id: a.id }, { publicada_em: b.publicada_em!, id: b.id }))
    .slice(0, Math.min(Math.max(p_limite ?? 20, 1), 50))
    .map((n) => ({ ...colunas(n), ...marcas(estado, n, eu) }));
}

export function noticiaUnicaDeTeste(estado: EstadoDasNoticias, eu: Torcedor, id: string) {
  const n = estado.noticias.find((x) => x.id === id);
  return paraMim(n, eu) ? [{ ...colunas(n), ...marcas(estado, n, eu) }] : [];
}

/** abrir_original(): conta o clique e devolve o link de origem. */
export function abrirOriginalDeTeste(estado: EstadoDasNoticias, eu: Torcedor, id: string): Recusa | string {
  const n = estado.noticias.find((x) => x.id === id);
  if (!eu || !paraMim(n, eu)) return recusa('noticia_inexistente');
  estado.cliques.push({ noticia_id: id, usuario_id: eu.id });
  n.cliques += 1;
  return n.link;
}

const diaEmBrasilia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

/** ler_noticia(): uma leitura por torcedor; o XP (creditar_xp) respeita o limite do dia de Brasília. */
export function lerNoticiaDeTeste(estado: EstadoDasNoticias, xp: EstadoDoXp, eu: Torcedor, id: string, agora = new Date()): Recusa | number {
  const n = estado.noticias.find((x) => x.id === id);
  if (!eu || !paraMim(n, eu)) return recusa('noticia_inexistente');
  if (estado.leituras.some((l) => l.noticia_id === id && l.usuario_id === eu.id)) return 0;
  estado.leituras.push({ noticia_id: id, usuario_id: eu.id, lida_em: agora.toISOString() });
  n.leituras += 1;
  const regra = xp.regras.find((r) => r.acao === 'leitura_noticia');
  if (!regra) return 0;
  const hoje = diaEmBrasilia(agora);
  const feitas = xp.lancamentos.filter((l) => l.usuario_id === eu.id && l.acao === 'leitura_noticia' && diaEmBrasilia(new Date(l.criado_em)) === hoje).length;
  if (regra.limite != null && feitas >= regra.limite) return 0;
  return lancarXp(xp, { usuario_id: eu.id, acao: 'leitura_noticia', detalhe: n.titulo, criado_em: agora.toISOString() }).xp;
}

export function curtirNoticiaDeTeste(estado: EstadoDasNoticias, eu: Torcedor, id: string, restrito: Restrito = livre): Recusa | { curti: boolean; curtidas: number }[] {
  const n = estado.noticias.find((x) => x.id === id);
  if (!eu || !paraMim(n, eu)) return recusa('noticia_inexistente');
  const i = estado.curtidas.findIndex((c) => c.noticia_id === id && c.usuario_id === eu.id);
  if (i >= 0) {
    estado.curtidas.splice(i, 1);
    n.curtidas = Math.max(n.curtidas - 1, 0);
    return [{ curti: false, curtidas: n.curtidas }];
  }
  // O trigger é no insert: tirar a curtida passa, dar não.
  const barrado = restrito(false);
  if (barrado) return barrado;
  estado.curtidas.push({ noticia_id: id, usuario_id: eu.id });
  n.curtidas += 1;
  return [{ curti: true, curtidas: n.curtidas }];
}

/** comentarios_da_noticia(): 'relevantes' por curtidas e depois os mais novos; oculto só para o autor. */
export function comentariosDaNoticiaDeTeste(
  estado: EstadoDasNoticias,
  xp: EstadoDoXp,
  perfis: Iterable<{ id: string; apelido: string | null }>,
  eu: Torcedor,
  { p_id, p_ordem = 'relevantes', p_limite = 50 }: { p_id: string; p_ordem?: string; p_limite?: number },
) {
  if (!paraMim(estado.noticias.find((x) => x.id === p_id), eu)) return [];
  const todos = [...perfis];
  return estado.comentarios
    .filter((c) => c.noticia_id === p_id && (!c.oculto || c.autor_id === eu!.id) && todos.some((p) => p.id === c.autor_id))
    .sort((a, b) => (p_ordem === 'recentes' ? 0 : b.curtidas - a.curtidas) || b.criado_em.localeCompare(a.criado_em))
    .slice(0, Math.min(Math.max(p_limite ?? 50, 1), 200))
    .map((c) => ({
      id: c.id,
      autor_id: c.autor_id,
      apelido: todos.find((p) => p.id === c.autor_id)!.apelido,
      nivel: nivelDoXp(xp.lancamentos.filter((l) => l.usuario_id === c.autor_id).reduce((s, l) => s + l.xp, 0)).nivel,
      texto: c.texto,
      curtidas: c.curtidas,
      curti: estado.curtidasDeComentarios.some((cc) => cc.comentario_id === c.id && cc.usuario_id === eu!.id),
      meu: c.autor_id === eu!.id,
      oculto: c.oculto,
      criado_em: c.criado_em,
    }));
}

/** comentar_noticia(): perfil completo, notícia para mim, um comentário a cada 10 s, texto de 1 a 500. */
export function comentarNoticiaDeTeste(estado: EstadoDasNoticias, eu: Torcedor, pedido: { p_id: string; p_texto: string }, restrito: Restrito = livre, agora = new Date()): Recusa | number {
  if (!eu?.onboarding_concluido_em || !eu.apelido) return recusa('sem_perfil');
  const n = estado.noticias.find((x) => x.id === pedido.p_id);
  if (!paraMim(n, eu)) return recusa('noticia_inexistente');
  if (estado.comentarios.some((c) => c.autor_id === eu.id && agora.getTime() - new Date(c.criado_em).getTime() < 10_000)) return recusa('devagar');
  const texto = (pedido.p_texto ?? '').trim();
  if (texto.length < 1 || texto.length > 500) return recusa('', '23514');
  const barrado = restrito(true);
  if (barrado) return barrado;
  const id = (estado.comentarios.at(-1)?.id ?? 0) + 1;
  estado.comentarios.push({ id, noticia_id: n.id, autor_id: eu.id, texto, curtidas: 0, oculto: false, criado_em: agora.toISOString() });
  n.comentarios += 1;
  return id;
}

/** apagar_comentario_da_noticia(): só o próprio; o contador só desconta o que estava visível. */
export function apagarComentarioDeTeste(estado: EstadoDasNoticias, eu: Torcedor, comentario: number) {
  const i = estado.comentarios.findIndex((c) => c.id === comentario && c.autor_id === eu?.id);
  if (i < 0) return;
  const [c] = estado.comentarios.splice(i, 1);
  const n = estado.noticias.find((x) => x.id === c.noticia_id);
  if (n && !c.oculto) n.comentarios = Math.max(n.comentarios - 1, 0);
}

export function curtirComentarioDeTeste(estado: EstadoDasNoticias, eu: Torcedor, comentario: number, restrito: Restrito = livre): Recusa | { curti: boolean; curtidas: number }[] {
  const c = estado.comentarios.find((x) => x.id === comentario && !x.oculto);
  if (!c || !eu || !paraMim(estado.noticias.find((x) => x.id === c.noticia_id), eu)) return recusa('comentario_inexistente');
  const i = estado.curtidasDeComentarios.findIndex((cc) => cc.comentario_id === comentario && cc.usuario_id === eu.id);
  if (i >= 0) {
    estado.curtidasDeComentarios.splice(i, 1);
    c.curtidas = Math.max(c.curtidas - 1, 0);
    return [{ curti: false, curtidas: c.curtidas }];
  }
  const barrado = restrito(false);
  if (barrado) return barrado;
  estado.curtidasDeComentarios.push({ comentario_id: comentario, usuario_id: eu.id });
  c.curtidas += 1;
  return [{ curti: true, curtidas: c.curtidas }];
}

type Pedido = { p_id?: string; p_limite?: number; p_antes?: string | null; p_antes_id?: string | null; p_ordem?: string; p_texto?: string; p_comentario?: number };

/**
 * As RPCs de notícias para os dois falsos: `undefined` quando `fn` não é delas; senão { erro } no formato do PostgREST
 * ou { dados }. Id que não é uuid é recusado como o PostgREST faz (22P02), antes de chegar à função.
 */
export function rpcDeNoticias(
  fn: string,
  pedido: Pedido,
  ctx: { estado: EstadoDasNoticias; xp: EstadoDoXp; perfis: Iterable<{ id: string; apelido: string | null }>; eu: Torcedor; restrito: Restrito },
): { erro: { code: string; message: string; hint: string | null } } | { dados: unknown } | undefined {
  const { estado, xp, perfis, eu, restrito } = ctx;
  if (!fn.includes('noticia') && fn !== 'abrir_original') return undefined;
  if (pedido.p_id !== undefined && !UUID.test(pedido.p_id)) {
    return { erro: { code: '22P02', message: `invalid input syntax for type uuid: "${pedido.p_id}"`, hint: null } };
  }
  const id = pedido.p_id!;
  const r =
    fn === 'noticias_do_clube'
      ? noticiasDoClubeDeTeste(estado, eu, pedido)
      : fn === 'noticia'
        ? noticiaUnicaDeTeste(estado, eu, id)
        : fn === 'ler_noticia'
          ? lerNoticiaDeTeste(estado, xp, eu, id)
          : fn === 'abrir_original'
            ? abrirOriginalDeTeste(estado, eu, id)
            : fn === 'curtir_noticia'
              ? curtirNoticiaDeTeste(estado, eu, id, restrito)
              : fn === 'comentarios_da_noticia'
                ? comentariosDaNoticiaDeTeste(estado, xp, perfis, eu, { ...pedido, p_id: id })
                : fn === 'comentar_noticia'
                  ? comentarNoticiaDeTeste(estado, eu, { p_id: id, p_texto: pedido.p_texto ?? '' }, restrito)
                  : fn === 'curtir_comentario_da_noticia'
                    ? curtirComentarioDeTeste(estado, eu, pedido.p_comentario!, restrito)
                    : fn === 'apagar_comentario_da_noticia'
                      ? (apagarComentarioDeTeste(estado, eu, pedido.p_comentario!), null)
                      : undefined;
  if (r === undefined) return undefined;
  if (r && typeof r === 'object' && 'hint' in r) return { erro: { code: r.code, message: r.message ?? (r.hint || 'check'), hint: r.hint } };
  return { dados: r };
}
