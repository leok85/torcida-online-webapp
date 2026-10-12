// Catálogo de futebol dos testes (Vitest e Playwright): um recorte das tabelas paises, ligas e clubes.
// Os ids do Brasil são os da BSD; os demais são inventados.
import type { ClassificacaoRow, ClubeRow, CompeticaoRow, Liga, Pais, Partida } from '../lib/database.types';

export const PAISES_DE_TESTE: Pais[] = [
  { codigo: 'BR', nome: 'Brasil', bandeira: 'br', ordem: 1 },
  { codigo: 'AR', nome: 'Argentina', bandeira: 'ar', ordem: 2 },
  { codigo: 'ES', nome: 'Espanha', bandeira: 'es', ordem: 10 },
];

export const LIGAS_DE_TESTE: Liga[] = [
  { id: 9, nome: 'Brasileirão Série A', pais: 'BR', divisao: 1, temporada: '2026', artigo: 'o' },
  { id: 34, nome: 'Brasileirão Série B', pais: 'BR', divisao: 2, temporada: '2026', artigo: 'o' },
  { id: 85, nome: 'Liga Profesional', pais: 'AR', divisao: 1, temporada: '2026', artigo: 'a' },
  { id: 3, nome: 'LaLiga', pais: 'ES', divisao: 1, temporada: '26/27', artigo: 'a' },
];

const clube = (id: number, nome: string, pais: string, liga_id: number): ClubeRow => ({
  id,
  nome,
  nome_curto: null,
  pais,
  liga_id,
  atualizado_em: '2026-10-11T12:00:00Z',
});

export const CLUBES_DE_TESTE: ClubeRow[] = [
  clube(160, 'Flamengo', 'BR', 9),
  clube(162, 'Palmeiras', 'BR', 9),
  clube(167, 'Corinthians', 'BR', 9),
  clube(158, 'São Paulo', 'BR', 9),
  clube(809, 'Goiás', 'BR', 34),
  clube(9001, 'Boca Juniors', 'AR', 85),
  clube(9002, 'River Plate', 'AR', 85),
  clube(9101, 'Real Madrid', 'ES', 3),
  clube(9102, 'Barcelona', 'ES', 3),
];

/** Mesmo formato do embed do AuthContext: clube:clubes(id, nome, nome_curto, liga_id), pais_dados:paises(nome, bandeira). */
export function comCatalogo<T extends { pais: string | null; time_id: number | null; time_anterior_id?: number | null }>(perfil: T) {
  const c = CLUBES_DE_TESTE.find((x) => x.id === perfil.time_id);
  const anterior = CLUBES_DE_TESTE.find((x) => x.id === perfil.time_anterior_id);
  const p = PAISES_DE_TESTE.find((x) => x.codigo === perfil.pais);
  return {
    ...perfil,
    clube: c ? { id: c.id, nome: c.nome, nome_curto: c.nome_curto, liga_id: c.liga_id } : null,
    pais_dados: p ? { nome: p.nome, bandeira: p.bandeira } : null,
    clube_anterior: anterior ? { id: anterior.id, nome: anterior.nome } : null,
  };
}

/** Clubes de um país com a liga embutida, como em clubes?select=...,liga:ligas(nome, divisao). */
export const clubesDoPais = (pais: string) =>
  CLUBES_DE_TESTE.filter((c) => c.pais === pais).map((c) => {
    const liga = LIGAS_DE_TESTE.find((l) => l.id === c.liga_id);
    return { id: c.id, nome: c.nome, nome_curto: c.nome_curto, pais: c.pais, liga: liga ? { nome: liga.nome, divisao: liga.divisao } : null };
  });

/** Recorte da tabela cidades (municípios do IBGE). */
export const CIDADES_DE_TESTE = [
  { id: 4205407, nome: 'Florianópolis', regiao: 'SC' },
  { id: 4106902, nome: 'Curitiba', regiao: 'PR' },
  { id: 3550308, nome: 'São Paulo', regiao: 'SP' },
  { id: 2412203, nome: 'São Paulo do Potengi', regiao: 'RN' },
  { id: 4314902, nome: 'Porto Alegre', regiao: 'RS' },
  { id: 2611606, nome: 'Recife', regiao: 'PE' },
  { id: 4216602, nome: 'São José', regiao: 'SC' },
  { id: 3549904, nome: 'São José dos Campos', regiao: 'SP' },
];

const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Mesma regra da função buscar_cidades() da migration (só há cidades do Brasil no recorte). */
export function buscarCidadesDeTeste(termo: string, pais = 'BR', limite = 8) {
  limite = Math.min(Math.max(limite, 1), 20);
  const q = semAcento(termo.split(',')[0].trim()).replace(/[%_]/g, '');
  if (pais !== 'BR' || q.length < 2) return [];
  return CIDADES_DE_TESTE.filter((c) => semAcento(c.nome).includes(q))
    .sort((a, b) => Number(semAcento(b.nome).startsWith(q)) - Number(semAcento(a.nome).startsWith(q)) || a.nome.length - b.nome.length || a.nome.localeCompare(b.nome))
    .slice(0, limite);
}

/** Palmeiras 1 x 0 Corinthians ao vivo, no 2º tempo. Sobrescreva o que importa para o teste. */
export function partidaDeTeste(campos: Partial<Partida> = {}): Partida {
  return {
    id: 7290,
    liga_id: 9,
    liga_nome: 'Brasileirão Série A',
    rodada: 30,
    inicio: '2026-10-11T20:30:00+00:00',
    status: 'ao_vivo',
    periodo: '2T',
    minuto: 67,
    mandante_id: 162,
    mandante_nome: 'Palmeiras',
    visitante_id: 167,
    visitante_nome: 'Corinthians',
    gols_mandante: 1,
    gols_visitante: 0,
    gols: [{ jogador: 'A. Barboza', minuto: '16', mandante: true, contra: false, penalti: false }],
    temporada_id: 1,
    fase: 'regular-season',
    fase_nome: 'Temporada regular',
    grupo: null,
    jogo_de_ida: null,
    penaltis_mandante: null,
    penaltis_visitante: null,
    atualizado_em: '2026-10-11T21:40:00Z',
    ...campos,
  };
}

/** Mesma consulta de jogosDoClube: os jogos do clube, do mais antigo para o mais recente. */
export const jogosDoClubeDeTeste = (partidas: Partida[], clubeId: number) =>
  partidas.filter((p) => p.mandante_id === clubeId || p.visitante_id === clubeId).sort((a, b) => a.inicio.localeCompare(b.inicio));

/** Posições na liga principal (tabela classificacao): Palmeiras 2º no Brasileirão, Real Madrid 1º na LaLiga. */
export const CLASSIFICACAO_DE_TESTE: { liga_id: number; clube_id: number; posicao: number }[] = [
  { liga_id: 9, clube_id: 160, posicao: 1 },
  { liga_id: 9, clube_id: 162, posicao: 2 },
  { liga_id: 3, clube_id: 9101, posicao: 1 },
];

/** Mesma regra de resumo_do_clube(): torcedores com onboarding concluído e a posição na liga do clube no catálogo. */
export function resumoDoClubeDeTeste(perfis: { time_id: number | null; onboarding_concluido_em: string | null }[], clubeId: number) {
  const clube = CLUBES_DE_TESTE.find((c) => c.id === clubeId);
  if (!clube) return [];
  const liga = LIGAS_DE_TESTE.find((l) => l.id === clube.liga_id);
  const linha = CLASSIFICACAO_DE_TESTE.find((c) => c.liga_id === clube.liga_id && c.clube_id === clubeId);
  return [
    {
      torcedores: perfis.filter((p) => p.time_id === clubeId && p.onboarding_concluido_em).length,
      posicao: linha?.posicao ?? null,
      liga: liga?.nome ?? null,
      artigo: liga?.artigo ?? null,
    },
  ];
}

// ---------- Temporada do Palmeiras para a tela de Campeonatos ----------

const linhaDaTabela = (liga_id: number, grupo: string, posicao: number, clube_id: number, clube_nome: string, pontos: number, zona: string | null = null, zona_tipo: string | null = null): ClassificacaoRow => ({
  liga_id,
  grupo,
  clube_id,
  clube_nome,
  posicao,
  pontos,
  jogos: 30,
  vitorias: Math.floor(pontos / 3),
  empates: pontos % 3,
  derrotas: 30 - Math.floor(pontos / 3) - (pontos % 3),
  gols_pro: 40,
  gols_contra: 30,
  forma: null,
  zona,
  zona_tipo,
  atualizado_em: '2026-10-12T09:40:00Z',
});

export const COMPETICOES_DE_TESTE: CompeticaoRow[] = [
  { liga_id: 9, nome: 'Brasileirão Série A', temporada_id: 28, temporada: 'Brasileiro Serie A 2026', inicio: '2026-01-28', fim: '2026-12-02', formato: 'pontos_corridos', fases: [{ fase: 'regular-season', nome: 'Temporada regular', rodadas: 38, inicio: '2026-01-28', fim: '2026-12-02' }], atualizado_em: '2026-10-12T09:40:00Z' },
  {
    liga_id: 32,
    nome: 'Copa Libertadores',
    temporada_id: 96,
    temporada: 'CONMEBOL Libertadores 2026',
    inicio: '2026-01-01',
    fim: '2026-12-31',
    formato: 'grupos_mata_mata',
    fases: [
      { fase: 'qualification-round-1', nome: '1ª fase preliminar', rodadas: 1, inicio: '2026-02-04', fim: '2026-02-13' },
      { fase: 'group-stage', nome: 'Fase de grupos', rodadas: 6, inicio: '2026-04-07', fim: '2026-05-29' },
      { fase: 'round-of-16', nome: 'Oitavas de final', rodadas: 1, inicio: '2026-08-11', fim: '2026-08-26' },
      { fase: 'quarterfinals', nome: 'Quartas de final', rodadas: 1, inicio: '2026-09-08', fim: '2026-09-18' },
      { fase: 'semifinals', nome: 'Semifinal', rodadas: 1, inicio: '2026-10-15', fim: '2026-10-23' },
    ],
    atualizado_em: '2026-10-12T09:40:00Z',
  },
  {
    liga_id: 35,
    nome: 'Copa do Brasil',
    temporada_id: 78,
    temporada: 'Copa do Brasil 2026',
    inicio: '2026-02-17',
    fim: '2026-11-08',
    formato: 'mata_mata',
    fases: [
      { fase: 'round-5', nome: '5ª fase', rodadas: 1, inicio: '2026-04-21', fim: '2026-05-15' },
      { fase: 'round-of-16', nome: 'Oitavas de final', rodadas: 1, inicio: '2026-08-01', fim: '2026-08-06' },
      { fase: 'quarterfinals', nome: 'Quartas de final', rodadas: 1, inicio: '2026-08-26', fim: '2026-09-03' },
      { fase: 'semifinals', nome: 'Semifinal', rodadas: 1, inicio: '2026-11-01', fim: '2026-11-08' },
    ],
    atualizado_em: '2026-10-12T09:40:00Z',
  },
];

export const TABELAS_DE_TESTE: ClassificacaoRow[] = [
  linhaDaTabela(9, '', 1, 160, 'Flamengo', 63, 'Libertadores', 'qualification'),
  linhaDaTabela(9, '', 2, 162, 'Palmeiras', 61, 'Libertadores', 'qualification'),
  linhaDaTabela(9, '', 3, 167, 'Corinthians', 50, 'Sul-Americana', 'qualification'),
  linhaDaTabela(9, '', 4, 158, 'São Paulo', 31, 'Rebaixamento', 'relegation'),
  linhaDaTabela(32, 'Grupo F', 1, 791, 'Cerro Porteño', 13, 'Classificação', 'playoff'),
  linhaDaTabela(32, 'Grupo F', 2, 162, 'Palmeiras', 11, 'Classificação', 'playoff'),
  linhaDaTabela(32, 'Grupo A', 1, 160, 'Flamengo', 16, 'Classificação', 'playoff'),
];

/** Jogos do Palmeiras na temporada (com um amistoso e um jogo da temporada passada, que a tela ignora). */
export function temporadaDoPalmeiras(): Partida[] {
  const fim: Partial<Partida> = { status: 'encerrada', periodo: null, minuto: null };
  const marcado: Partial<Partida> = { status: 'agendada', periodo: null, minuto: null, gols_mandante: null, gols_visitante: null, gols: [] };
  const lib = { liga_id: 32, liga_nome: 'Copa Libertadores', temporada_id: 96, rodada: null };
  const cdb = { liga_id: 35, liga_nome: 'Copa do Brasil', temporada_id: 78, rodada: null };
  return [
    // Brasileirão: 2025 (outra temporada), dois resultados e dois jogos marcados.
    partidaDeTeste({ id: 1, ...fim, inicio: '2025-11-23T00:30:00Z', temporada_id: 29, gols_mandante: 0, gols_visitante: 0 }),
    partidaDeTeste({ id: 2, ...fim, inicio: '2026-10-09T00:30:00Z', temporada_id: 28, rodada: 29, visitante_id: 166, visitante_nome: 'Bahia', gols_mandante: 1, gols_visitante: 0 }),
    partidaDeTeste({ id: 3, ...fim, inicio: '2026-10-11T20:30:00Z', temporada_id: 28, rodada: 30, gols_mandante: 4, gols_visitante: 1 }),
    partidaDeTeste({ id: 4, ...marcado, inicio: '2026-10-18T19:00:00Z', temporada_id: 28, rodada: 31, mandante_id: 158, mandante_nome: 'São Paulo', visitante_id: 162, visitante_nome: 'Palmeiras' }),
    partidaDeTeste({ id: 5, ...marcado, inicio: '2026-10-25T21:00:00Z', temporada_id: 28, rodada: 32, visitante_id: 160, visitante_nome: 'Flamengo' }),
    // Libertadores: grupo, oitavas (passou), quartas (passou nos pênaltis) e semifinal marcada.
    partidaDeTeste({ id: 10, ...fim, ...lib, inicio: '2026-05-20T00:30:00Z', fase: 'group-stage', fase_nome: 'Fase de grupos', grupo: 'Grupo F', visitante_id: 791, visitante_nome: 'Cerro Porteño', gols_mandante: 2, gols_visitante: 2 }),
    partidaDeTeste({ id: 11, ...fim, ...lib, inicio: '2026-08-12T00:30:00Z', fase: 'round-of-16', fase_nome: 'Oitavas de final', visitante_id: 780, visitante_nome: 'Boca Juniors', gols_mandante: 2, gols_visitante: 0 }),
    partidaDeTeste({ id: 12, ...fim, ...lib, inicio: '2026-08-19T00:30:00Z', fase: 'round-of-16', fase_nome: 'Oitavas de final', jogo_de_ida: 11, mandante_id: 780, mandante_nome: 'Boca Juniors', visitante_id: 162, visitante_nome: 'Palmeiras', gols_mandante: 1, gols_visitante: 0 }),
    partidaDeTeste({ id: 13, ...fim, ...lib, inicio: '2026-09-09T22:00:00Z', fase: 'quarterfinals', fase_nome: 'Quartas de final', visitante_id: 778, visitante_nome: 'LDU', gols_mandante: 1, gols_visitante: 0 }),
    partidaDeTeste({ id: 14, ...fim, ...lib, inicio: '2026-09-16T22:00:00Z', fase: 'quarterfinals', fase_nome: 'Quartas de final', jogo_de_ida: 13, mandante_id: 778, mandante_nome: 'LDU', visitante_id: 162, visitante_nome: 'Palmeiras', gols_mandante: 3, gols_visitante: 2, penaltis_mandante: 3, penaltis_visitante: 4 }),
    partidaDeTeste({ id: 15, ...marcado, ...lib, inicio: '2026-10-15T00:30:00Z', fase: 'semifinals', fase_nome: 'Semifinal', mandante_id: 153, mandante_nome: 'Fluminense', visitante_id: 162, visitante_nome: 'Palmeiras' }),
    partidaDeTeste({ id: 16, ...marcado, ...lib, inicio: '2026-10-22T00:30:00Z', fase: 'semifinals', fase_nome: 'Semifinal', jogo_de_ida: 15, visitante_id: 153, visitante_nome: 'Fluminense' }),
    // Copa do Brasil: passou na 5ª fase e nas oitavas, caiu nas quartas.
    partidaDeTeste({ id: 20, ...fim, ...cdb, inicio: '2026-04-22T22:00:00Z', fase: 'round-5', fase_nome: '5ª fase', visitante_id: 809, visitante_nome: 'Goiás', gols_mandante: 3, gols_visitante: 0 }),
    partidaDeTeste({ id: 21, ...fim, ...cdb, inicio: '2026-08-02T22:00:00Z', fase: 'round-of-16', fase_nome: 'Oitavas de final', visitante_id: 160, visitante_nome: 'Flamengo', gols_mandante: 1, gols_visitante: 0 }),
    partidaDeTeste({ id: 22, ...fim, ...cdb, inicio: '2026-08-06T22:00:00Z', fase: 'round-of-16', fase_nome: 'Oitavas de final', jogo_de_ida: 21, mandante_id: 160, mandante_nome: 'Flamengo', visitante_id: 162, visitante_nome: 'Palmeiras', gols_mandante: 0, gols_visitante: 0 }),
    partidaDeTeste({ id: 23, ...fim, ...cdb, inicio: '2026-08-27T22:00:00Z', fase: 'quarterfinals', fase_nome: 'Quartas de final', visitante_id: 167, visitante_nome: 'Corinthians', gols_mandante: 0, gols_visitante: 1 }),
    partidaDeTeste({ id: 24, ...fim, ...cdb, inicio: '2026-09-03T22:00:00Z', fase: 'quarterfinals', fase_nome: 'Quartas de final', jogo_de_ida: 23, mandante_id: 167, mandante_nome: 'Corinthians', visitante_id: 162, visitante_nome: 'Palmeiras', gols_mandante: 1, gols_visitante: 1 }),
    // Amistoso: não é competição.
    partidaDeTeste({ id: 30, ...fim, liga_id: 79, liga_nome: 'Club Friendlies', temporada_id: 1, inicio: '2026-07-10T20:00:00Z', fase: null, fase_nome: null, gols_mandante: 2, gols_visitante: 2 }),
  ];
}
