// Catálogo de futebol dos testes (Vitest e Playwright): um recorte das tabelas paises, ligas e clubes.
// Os ids do Brasil são os da BSD; os demais são inventados.
import type { Partida } from '../lib/database.types';
import type { ClubeRow, Liga, Pais } from '../lib/database.types';

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

/** Mesmo formato do embed do AuthContext: clube:clubes(id, nome, nome_curto), pais_dados:paises(nome, bandeira). */
export function comCatalogo<T extends { pais: string | null; time_id: number | null }>(perfil: T) {
  const c = CLUBES_DE_TESTE.find((x) => x.id === perfil.time_id);
  const p = PAISES_DE_TESTE.find((x) => x.codigo === perfil.pais);
  return {
    ...perfil,
    clube: c ? { id: c.id, nome: c.nome, nome_curto: c.nome_curto } : null,
    pais_dados: p ? { nome: p.nome, bandeira: p.bandeira } : null,
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
