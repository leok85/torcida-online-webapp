// Catálogo de futebol dos testes (Vitest e Playwright): um recorte das tabelas paises, ligas e clubes.
// Os ids do Brasil são os da BSD; os demais são inventados.
import type { ClubeRow, Liga, Pais } from '../lib/database.types';

export const PAISES_DE_TESTE: Pais[] = [
  { codigo: 'BR', nome: 'Brasil', bandeira: 'br', ordem: 1 },
  { codigo: 'AR', nome: 'Argentina', bandeira: 'ar', ordem: 2 },
  { codigo: 'ES', nome: 'Espanha', bandeira: 'es', ordem: 10 },
];

export const LIGAS_DE_TESTE: Liga[] = [
  { id: 9, nome: 'Brasileirão Série A', pais: 'BR', divisao: 1, temporada: '2026' },
  { id: 34, nome: 'Brasileirão Série B', pais: 'BR', divisao: 2, temporada: '2026' },
  { id: 85, nome: 'Liga Profesional', pais: 'AR', divisao: 1, temporada: '2026' },
  { id: 3, nome: 'LaLiga', pais: 'ES', divisao: 1, temporada: '26/27' },
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
];

const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Mesma regra da função buscar_cidades() da migration (só há cidades do Brasil no recorte). */
export function buscarCidadesDeTeste(termo: string, pais = 'BR', limite = 8) {
  const q = semAcento(termo.split(',')[0].trim()).replace(/[%_]/g, '');
  if (pais !== 'BR' || q.length < 2) return [];
  return CIDADES_DE_TESTE.filter((c) => semAcento(c.nome).includes(q))
    .sort((a, b) => Number(semAcento(b.nome).startsWith(q)) - Number(semAcento(a.nome).startsWith(q)) || a.nome.length - b.nome.length || a.nome.localeCompare(b.nome))
    .slice(0, limite);
}
