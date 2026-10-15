// Regras de XP da migration 20261026100000_xp_e_missoes, para os dois falsos (Vitest e Playwright).
// Os créditos automáticos (triggers) não são simulados: o teste empurra os lançamentos que quer ver.
import { nivelDoXp } from '../data/nivelDoXp';
import { inicioDaSemana } from '../data/semana';

export type LancamentoDeTeste = {
  id: number;
  usuario_id: string;
  acao: string;
  xp: number;
  fator: number;
  detalhe: string | null;
  partida_id: number | null;
  missao_id: string | null;
  criado_em: string;
};

export type MissaoDeTeste = {
  id: string;
  titulo: string;
  regra: string;
  icone: string;
  tipo: 'semanal' | 'por_jogo' | 'continua';
  acao: string;
  meta: number;
  xp: number;
  status: 'rascunho' | 'ativa' | 'pausada' | 'encerrada';
  ordem: number;
  criado_em: string;
};

export type RegraDeTeste = {
  acao: string;
  rotulo: string;
  xp: number;
  limite: number | null;
  limite_por: 'dia' | 'semana' | 'partida' | null;
  observacao: string | null;
  icone: string;
  ordem: number;
  atualizado_em: string;
};

type PerfilDoRanking = { id: string; apelido: string | null; time_id: number | null };

const r = (acao: string, rotulo: string, xp: number, limite: number | null, limite_por: RegraDeTeste['limite_por'], observacao: string | null, icone: string, ordem: number): RegraDeTeste => ({
  acao, rotulo, xp, limite, limite_por, observacao, icone, ordem, atualizado_em: '2026-10-26T12:00:00Z',
});

/** Valores iniciais de xp_regras. */
export const regrasDeTeste = (): RegraDeTeste[] => [
  r('login_diario', 'Login diário', 20, 1, 'dia', null, 'login', 1),
  r('palpite_enviado', 'Palpite enviado', 50, 1, 'partida', null, 'how_to_reg', 2),
  r('palpite_vencedor', 'Acertou o vencedor', 60, 1, 'partida', 'apurado no apito final', 'emoji_events', 3),
  r('palpite_exato', 'Placar exato', 240, 1, 'partida', 'bônus no apito final', 'target', 4),
  r('palpite_autor', 'Acertou quem marca', 40, null, null, 'por autor certo', 'sports_soccer', 5),
  r('notas', 'Notas nos jogadores', 50, 1, 'partida', null, 'grade', 6),
  r('mensagem_chat', 'Mensagem no chat', 2, 30, 'partida', null, 'forum', 7),
  r('foto_enviada', 'Foto publicada', 40, 3, 'partida', null, 'photo_camera', 8),
  r('foto_campea', 'Foto campeã', 500, null, null, 'mais curtida do clube', 'workspace_premium', 9),
  r('convite_aceito', 'Convite aceito', 100, null, null, 'para os dois torcedores', 'group_add', 10),
  r('feedback', 'Feedback enviado', 50, 2, 'semana', null, 'rate_review', 11),
];

export type EstadoDoXp = { lancamentos: LancamentoDeTeste[]; missoes: MissaoDeTeste[]; regras: RegraDeTeste[] };

export const estadoDoXp = (): EstadoDoXp => ({ lancamentos: [], missoes: [], regras: regrasDeTeste() });

const FUSO = 'America/Sao_Paulo';
const diaEmBrasilia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(d);
const inicioDoAno = (agora: Date) => new Date(Date.UTC(Number(diaEmBrasilia(agora).slice(0, 4)), 0, 1, 3));
const inicioDoMes = (agora: Date) => {
  const [a, m] = diaEmBrasilia(agora).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, 1, 3));
};

/** Lança XP para um torcedor (como os triggers fariam). */
export function lancarXp(estado: EstadoDoXp, campos: Partial<LancamentoDeTeste> & { usuario_id: string; acao: string }) {
  const regra = estado.regras.find((x) => x.acao === campos.acao);
  const l: LancamentoDeTeste = {
    id: (estado.lancamentos.at(-1)?.id ?? 0) + 1,
    xp: regra?.xp ?? 0,
    fator: 1,
    detalhe: null,
    partida_id: null,
    missao_id: null,
    criado_em: new Date().toISOString(),
    ...campos,
  };
  estado.lancamentos.push(l);
  return l;
}

const doTorcedor = (estado: EstadoDoXp, id: string) => estado.lancamentos.filter((l) => l.usuario_id === id);
const soma = (ls: LancamentoDeTeste[]) => ls.reduce((s, l) => s + l.xp, 0);
const desde = (ls: LancamentoDeTeste[], inicio: Date) => ls.filter((l) => new Date(l.criado_em) >= inicio);

/** registrar_presenca(): uma vez por dia de Brasília; 0 sem perfil ou se o dia já contou. */
export function registrarPresencaDeTeste(estado: EstadoDoXp, eu: { id: string } | undefined, agora = new Date()) {
  if (!eu) return 0;
  const hoje = diaEmBrasilia(agora);
  if (doTorcedor(estado, eu.id).some((l) => l.acao === 'login_diario' && diaEmBrasilia(new Date(l.criado_em)) === hoje)) return 0;
  return lancarXp(estado, { usuario_id: eu.id, acao: 'login_diario', criado_em: agora.toISOString() }).xp;
}

/** Dias seguidos com login até hoje (ou até ontem, se hoje ainda não contou). */
function sequenciaDeLogin(dias: Set<string>, agora: Date) {
  let d = new Date(agora);
  if (!dias.has(diaEmBrasilia(d))) d = new Date(d.getTime() - 86_400_000);
  let n = 0;
  while (dias.has(diaEmBrasilia(d))) {
    n += 1;
    d = new Date(d.getTime() - 86_400_000);
  }
  return n;
}

export function meuXpDeTeste(estado: EstadoDoXp, eu: { id: string } | undefined, agora = new Date()) {
  if (!eu) return [];
  const meus = doTorcedor(estado, eu.id);
  const total = soma(meus);
  const temporada = soma(desde(meus, inicioDoAno(agora)));
  const porTorcedor = new Map<string, number>();
  for (const l of desde(estado.lancamentos, inicioDoAno(agora))) porTorcedor.set(l.usuario_id, (porTorcedor.get(l.usuario_id) ?? 0) + l.xp);
  const acima = [...porTorcedor].filter(([id, xp]) => id !== eu.id && xp > temporada).length;
  const semana = inicioDaSemana(agora);
  return [
    {
      xp_total: total,
      ...nivelDoXp(total),
      xp_semana: soma(desde(meus, semana)),
      xp_temporada: temporada,
      posicao_temporada: acima + 1,
    },
  ];
}

/** minha_presenca(): a sequência de login e os dias desta semana com login (yyyy-mm-dd, em ordem). */
export function minhaPresencaDeTeste(estado: EstadoDoXp, eu: { id: string } | undefined, agora = new Date()) {
  if (!eu) return [{ sequencia: 0, dias: [] }];
  const logins = doTorcedor(estado, eu.id).filter((l) => l.acao === 'login_diario');
  return [
    {
      sequencia: sequenciaDeLogin(new Set(logins.map((l) => diaEmBrasilia(new Date(l.criado_em)))), agora),
      dias: [...new Set(desde(logins, inicioDaSemana(agora)).map((l) => diaEmBrasilia(new Date(l.criado_em))))].sort(),
    },
  ];
}

export function extratoDeTeste(estado: EstadoDoXp, eu: { id: string } | undefined, limite = 30) {
  if (!eu) return [];
  return doTorcedor(estado, eu.id)
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em) || b.id - a.id)
    .slice(0, Math.min(Math.max(limite, 1), 100))
    .map((l) => {
      const regra = estado.regras.find((x) => x.acao === l.acao);
      const missao = estado.missoes.find((m) => m.id === l.missao_id);
      return {
        id: l.id,
        acao: l.acao,
        rotulo: regra?.rotulo ?? (l.acao === 'missao' ? 'Missão concluída' : l.acao),
        icone: regra?.icone ?? missao?.icone ?? 'flag',
        xp: l.xp,
        fator: l.fator,
        detalhe: l.detalhe,
        partida_id: l.partida_id,
        criado_em: l.criado_em,
      };
    });
}

export function missoesDeTeste(estado: EstadoDoXp, eu: { id: string } | undefined, agora = new Date()) {
  if (!eu) return [];
  const meus = doTorcedor(estado, eu.id);
  const semana = inicioDaSemana(agora);
  return estado.missoes
    .filter((m) => m.status === 'ativa')
    .sort((a, b) => a.ordem - b.ordem || a.criado_em.localeCompare(b.criado_em))
    .map((m) => {
      const daAcao = meus.filter((l) => l.acao === m.acao);
      let feito: number;
      if (m.tipo === 'semanal') feito = desde(daAcao, semana).length;
      else if (m.tipo === 'por_jogo') {
        const porJogo = new Map<number, number>();
        for (const l of desde(daAcao, semana)) if (l.partida_id != null) porJogo.set(l.partida_id, (porJogo.get(l.partida_id) ?? 0) + 1);
        feito = Math.max(0, ...porJogo.values());
      } else feito = desde(daAcao, new Date(m.criado_em)).length;
      const concluidas = meus.filter((l) => l.missao_id === m.id && (m.tipo === 'continua' || new Date(l.criado_em) >= semana));
      return {
        id: m.id,
        titulo: m.titulo,
        regra: m.regra,
        icone: m.icone,
        tipo: m.tipo,
        acao: m.acao,
        meta: m.meta,
        progresso: Math.min(feito, m.meta),
        xp: m.xp,
        concluida_em: concluidas.map((l) => l.criado_em).sort().at(-1) ?? null,
        termina_em: m.tipo === 'semanal' ? new Date(semana.getTime() + 7 * 86_400_000).toISOString() : null,
      };
    });
}

export function rankingDeTeste(
  estado: EstadoDoXp,
  perfis: Iterable<PerfilDoRanking>,
  eu: { id: string } | undefined,
  { p_periodo = 'temporada', p_clube = null, p_limite = 50 }: { p_periodo?: string; p_clube?: number | null; p_limite?: number },
  agora = new Date(),
) {
  const inicio = p_periodo === 'semana' ? inicioDaSemana(agora) : p_periodo === 'mes' ? inicioDoMes(agora) : inicioDoAno(agora);
  const porTorcedor = new Map<string, number>();
  for (const l of desde(estado.lancamentos, inicio)) porTorcedor.set(l.usuario_id, (porTorcedor.get(l.usuario_id) ?? 0) + l.xp);
  const todos = [...perfis];
  const linhas = [...porTorcedor]
    .map(([id, xp]) => ({ perfil: todos.find((p) => p.id === id), xp }))
    .filter((x): x is { perfil: PerfilDoRanking; xp: number } => !!x.perfil?.apelido && (p_clube == null || x.perfil.time_id === p_clube))
    .sort((a, b) => b.xp - a.xp || a.perfil.apelido!.localeCompare(b.perfil.apelido!));
  const classificados = linhas.map((x) => ({
    posicao: 1 + linhas.filter((y) => y.xp > x.xp).length,
    usuario_id: x.perfil.id,
    apelido: x.perfil.apelido!,
    clube_id: x.perfil.time_id!,
    xp: x.xp,
    nivel: nivelDoXp(soma(doTorcedor(estado, x.perfil.id))).nivel,
    eu: x.perfil.id === eu?.id,
  }));
  const topo = classificados.slice(0, Math.min(Math.max(p_limite, 1), 200));
  const minha = classificados.find((c) => c.eu);
  return minha && !topo.includes(minha) ? [...topo, minha] : topo;
}
