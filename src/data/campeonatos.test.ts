import { describe, expect, it } from 'vitest';
import type { CompeticaoRow, Partida } from '../lib/database.types';
import { COMPETICOES_DE_TESTE, partidaDeTeste, TABELAS_DE_TESTE, temporadaDoPalmeiras } from '../test/catalogoDeTeste';
import { aproveitamento, atualizacaoDaTabela, formaDaLinha, montarCampeonatos, ordemDaFase, resultadoDoConfronto, resumoDaTabela, type Competicao } from './campeonatos';
import { linhaDaTabela } from '../test/catalogoDeTeste';

const AGORA = new Date('2026-10-12T15:00:00Z');
const competicoes = COMPETICOES_DE_TESTE as Competicao[];
const montar = (jogos = temporadaDoPalmeiras(), comps = competicoes) => montarCampeonatos(jogos, comps, TABELAS_DE_TESTE, 162, 9, AGORA);

describe('montarCampeonatos', () => {
  it('lista a liga principal, depois as copas em disputa e por fim as encerradas; amistoso fica de fora', () => {
    expect(montar().map((c) => c.nome)).toEqual(['Brasileirão Série A', 'Copa Libertadores', 'Copa do Brasil']);
  });

  it('pontos corridos: posição, pontos, rodada, próximo jogo e só os jogos da temporada atual', () => {
    const [br] = montar();
    expect(br).toMatchObject({
      formato: 'pontos_corridos',
      rotuloFormato: 'pontos corridos · 38 rodadas',
      encerrado: false,
      destaque: '2º',
      complemento: '61 pts · rodada 30',
      rodape: 'São Paulo x Palmeiras · dom 16:00',
      ultimos: ['V', 'V'],
    });
    expect(br.tabela.map((l) => l.clube_nome)).toEqual(['Flamengo', 'Palmeiras', 'Corinthians', 'São Paulo']);
    expect(br.proximos.map((p) => p.id)).toEqual([4, 5]);
  });

  it('grupos + mata-mata: fase atual, adversário, ida fora de casa e o caminho até a final', () => {
    const lib = montar()[1];
    expect(lib).toMatchObject({
      rotuloFormato: 'grupos + mata-mata',
      destaque: 'Semifinal',
      complemento: 'vs Fluminense',
      rodape: 'Ida · qua 14/10 21:30 · fora',
      encerrado: false,
    });
    // A fase preliminar que o clube não jogou fica fora; a final entra antes de a BSD listar.
    expect(lib.caminho.map((e) => [e.nome, e.estado, e.resultado])).toEqual([
      ['Fase de grupos', 'concluida', null],
      ['Oitavas de final', 'concluida', 'V'],
      ['Quartas de final', 'concluida', 'V'],
      ['Semifinal', 'atual', null],
      ['Final', 'futura', null],
    ]);
    expect(lib.caminho[0].tabela.map((l) => l.clube_nome)).toEqual(['Cerro Porteño', 'Palmeiras']);
    expect(lib.faseAtual?.jogos.map((p) => p.id)).toEqual([15, 16]);
  });

  it('mata-mata em que o clube caiu: eliminado, por quem e sem as fases seguintes', () => {
    const cdb = montar()[2];
    expect(cdb).toMatchObject({
      rotuloFormato: 'encerrado · set 2026',
      encerrado: true,
      destaque: 'Eliminado',
      complemento: 'nas quartas',
      rodape: 'Eliminado pelo Corinthians',
      faseAtual: null,
    });
    expect(cdb.caminho.map((e) => [e.nome, e.estado, e.resultado])).toEqual([
      ['5ª fase', 'concluida', 'V'],
      ['Oitavas de final', 'concluida', 'V'],
      ['Quartas de final', 'concluida', 'D'],
    ]);
  });

  it('campeão quando vence a final', () => {
    const estadual: CompeticaoRow = {
      liga_id: 77,
      nome: 'Campeonato Paulista',
      temporada_id: 5,
      temporada: 'Paulista 2026',
      inicio: '2026-01-10',
      fim: '2026-04-10',
      formato: 'grupos_mata_mata',
      fases: [
        { fase: 'group-stage', nome: 'Fase de grupos', rodadas: 6, inicio: '2026-01-10', fim: '2026-03-01' },
        { fase: 'final', nome: 'Final', rodadas: 1, inicio: '2026-04-01', fim: '2026-04-10' },
      ],
      atualizado_em: '2026-10-12T09:40:00Z',
    };
    const fim: Partial<Partida> = { status: 'encerrada', periodo: null, minuto: null, liga_id: 77, liga_nome: 'Campeonato Paulista', temporada_id: 5 };
    const jogos = [
      partidaDeTeste({ id: 40, ...fim, inicio: '2026-04-02T19:00:00Z', fase: 'final', gols_mandante: 1, gols_visitante: 1 }),
      partidaDeTeste({ id: 41, ...fim, inicio: '2026-04-09T19:00:00Z', fase: 'final', jogo_de_ida: 40, mandante_id: 167, mandante_nome: 'Corinthians', visitante_id: 162, visitante_nome: 'Palmeiras', gols_mandante: 0, gols_visitante: 2 }),
    ];
    const [paulista] = montarCampeonatos(jogos, [estadual as Competicao], [], 162, null, AGORA);
    expect(paulista).toMatchObject({ campeao: true, destaque: 'Campeão', complemento: '2026', rodape: 'Final contra o Corinthians', rotuloFormato: 'encerrado · abr 2026' });
  });

  it('liga principal sem tabela e sem jogos ainda aparece, sem posição', () => {
    const [br] = montarCampeonatos([], competicoes, [], 162, 9, AGORA);
    expect(br).toMatchObject({ nome: 'Brasileirão Série A', destaque: '—', complemento: 'sem tabela ainda', rodape: null });
  });
});

describe('resultadoDoConfronto', () => {
  const fim: Partial<Partida> = { status: 'encerrada', periodo: null, minuto: null };
  it('soma ida e volta e usa os pênaltis do último jogo no empate', () => {
    const ida = partidaDeTeste({ ...fim, id: 1, gols_mandante: 1, gols_visitante: 0 });
    const volta = partidaDeTeste({ ...fim, id: 2, mandante_id: 778, visitante_id: 162, gols_mandante: 1, gols_visitante: 0, penaltis_mandante: 5, penaltis_visitante: 4 });
    expect(resultadoDoConfronto([ida, volta], 162)).toBe('D');
    expect(resultadoDoConfronto([ida], 162)).toBe('V');
  });

  it('sem todos os jogos encerrados, ainda não há resultado', () => {
    expect(resultadoDoConfronto([partidaDeTeste({ status: 'agendada' })], 162)).toBeNull();
  });
});

describe('ordemDaFase', () => {
  it('preliminares, fases numeradas, grupos e mata-mata até a final', () => {
    const fases = ['final', 'group-stage', 'qualification-round-2', 'round-of-16', 'round-5', 'semifinals', 'qualification-round-1', 'quarterfinals'];
    expect([...fases].sort((a, b) => ordemDaFase(a) - ordemDaFase(b))).toEqual([
      'qualification-round-1',
      'qualification-round-2',
      'round-5',
      'group-stage',
      'round-of-16',
      'quarterfinals',
      'semifinals',
      'final',
    ]);
  });
});

describe('tabela completa', () => {
  const tabela = Array.from({ length: 12 }, (_, i) => linhaDaTabela(9, '', i + 1, 100 + i, `Time ${i + 1}`, 40 - i));

  it('resumo: as 8 primeiras; com o clube mais abaixo, as 7 primeiras e ele; tabela curta inteira', () => {
    expect(resumoDaTabela(tabela, 103).map((l) => l.posicao)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(resumoDaTabela(tabela, 110).map((l) => l.posicao)).toEqual([1, 2, 3, 4, 5, 6, 7, 11]);
    expect(resumoDaTabela(tabela, 999)).toHaveLength(8);
    expect(resumoDaTabela(tabela.slice(0, 5), 110)).toHaveLength(5);
  });

  it('forma da BSD em V/E/D, aproveitamento e a hora da atualização', () => {
    expect(formaDaLinha('WDLwx')).toEqual(['V', 'E', 'D', 'V']);
    expect(formaDaLinha(null)).toEqual([]);
    expect(aproveitamento({ pontos: 61, jogos: 30 })).toBe(68);
    expect(aproveitamento({ pontos: 0, jogos: 0 })).toBe(0);
    expect(atualizacaoDaTabela([{ ...tabela[0], atualizado_em: '2026-10-13T09:40:00Z' }, tabela[1]])).toBe('atualizada ter 13/10 às 06:40');
    expect(atualizacaoDaTabela([])).toBeNull();
  });
});
