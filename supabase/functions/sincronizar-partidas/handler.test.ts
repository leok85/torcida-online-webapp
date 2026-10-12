import { describe, expect, it, vi } from 'vitest';
import {
  competicaoDe,
  formatoDaCompeticao,
  golsDe,
  linhasDaClassificacao,
  MAX_INCIDENTES,
  nomeDaFase,
  nomeDaZona,
  periodoDe,
  sincronizar,
  type Banco,
  type Bsd,
  type ClassificacaoBsd,
  type EventoBsd,
  type IncidenteBsd,
  type Competicao,
  type LinhaDaClassificacao,
  type Partida,
  type PartidaSalva,
} from './handler';

const AGORA = new Date('2026-10-11T21:00:00Z');

const evento = (campos: Partial<EventoBsd> = {}): EventoBsd => ({
  id: 7290,
  league_id: 9,
  round_number: 30,
  event_date: '2026-10-11T20:30:00+00:00',
  status: 'inprogress',
  period: '2nd_half',
  current_minute: 67,
  home_team_id: 162,
  home_team: 'Palmeiras',
  away_team_id: 167,
  away_team: 'Corinthians',
  home_score: 1,
  away_score: 0,
  ...campos,
});

const gol = (campos: Partial<IncidenteBsd> = {}): IncidenteBsd => ({ type: 'goal', minute: 16, player: 'A. Barboza', is_home: true, goal_type: 'regular', ...campos });

function montar({ aoVivo = [evento()] as EventoBsd[], agenda = [] as EventoBsd[], salvas = new Map<number, PartidaSalva>(), idsAoVivo = [] as number[], finais = new Map<number, EventoBsd>(), incidentes = [gol()] as IncidenteBsd[], naJanela = true, tabelas = new Map<number, ClassificacaoBsd>(), ligasRecentes = [] as number[], torcedores = [] as number[], copas = [] as number[], doTime = new Map<number, EventoBsd[]>() } = {}) {
  const bsd = {
    aoVivo: vi.fn(async () => [...aoVivo]),
    eventos: vi.fn(async (_de: string, _ate: string) => [...agenda]),
    evento: vi.fn(async (id: number) => finais.get(id) ?? null),
    incidentes: vi.fn(async (_id: number) => incidentes),
    nomeDaLiga: vi.fn(async (_id: number) => 'Copa Libertadores'),
    classificacao: vi.fn(async (id: number) => {
      const tabela = tabelas.get(id);
      if (!tabela) throw new Error('BSD 404');
      return tabela;
    }),
    eventosDoTime: vi.fn(async (time: number, _de: string) => doTime.get(time) ?? []),
  } satisfies Bsd;
  const salvarCompeticao = vi.fn(async (_c: Competicao) => {});
  const clubesComTorcedores = vi.fn(async () => torcedores);
  const competicoesDosClubes = vi.fn(async (_clubes: number[], _desde: Date) => copas);
  const salvarClassificacao = vi.fn(async (_liga: number, _linhas: LinhaDaClassificacao[]) => {});
  const ligasComJogoDesde = vi.fn(async (_desde: Date) => ligasRecentes);
  const salvar = vi.fn(async (_p: Partida[]) => {});
  const haJogoNaJanela = vi.fn(async (_de: Date, _ate: Date) => naJanela);
  const banco: Banco = {
    catalogo: async () => ({
      clubes: new Map([[162, 'Palmeiras'], [167, 'Corinthians'], [160, 'Flamengo']]),
      ligas: new Map([[9, 'Brasileirão Série A'], [34, 'Brasileirão Série B']]),
    }),
    partidas: async (ids) => new Map([...salvas].filter(([id]) => ids.includes(id))),
    idsAoVivo: async () => idsAoVivo,
    haJogoNaJanela,
    salvar,
    ligasComJogoDesde,
    salvarClassificacao,
    salvarCompeticao,
    clubesComTorcedores,
    competicoesDosClubes,
  };
  const salvasNaChamada = () => salvar.mock.calls.at(-1)?.[0] ?? [];
  return { bsd, banco, salvar, haJogoNaJanela, salvasNaChamada, salvarClassificacao, ligasComJogoDesde, salvarCompeticao, competicoesDosClubes };
}

const pedido = (corpo: object = { modo: 'ao_vivo' }, segredo = 'segredo-cron') =>
  new Request('http://supabase.test/functions/v1/sincronizar-partidas', {
    method: 'POST',
    headers: { 'x-segredo': segredo, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });

const rodar = (m: ReturnType<typeof montar>, req = pedido()) =>
  sincronizar(req, { bsd: m.bsd, banco: m.banco, segredo: 'segredo-cron', agora: () => AGORA });

describe('sincronizar-partidas', () => {
  it('copia o jogo ao vivo com placar, período, minuto, liga do catálogo e gols', async () => {
    const m = montar();
    const resposta = await rodar(m);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true, modo: 'ao_vivo', salvas: 1, incidentes: 1 });
    expect(m.salvasNaChamada()).toEqual([
      {
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
        temporada_id: null,
        fase: null,
        fase_nome: null,
        grupo: null,
        jogo_de_ida: null,
        penaltis_mandante: null,
        penaltis_visitante: null,
        atualizado_em: AGORA.toISOString(),
      },
    ]);
  });

  it('ignora jogos sem nenhum clube do catálogo', async () => {
    const m = montar({ aoVivo: [evento({ id: 1, home_team_id: 2391, away_team_id: 2390 })] });
    await rodar(m);
    expect(m.salvar).not.toHaveBeenCalled();
    expect(m.bsd.incidentes).not.toHaveBeenCalled();
  });

  it('não pede os gols de novo quando o placar não mudou', async () => {
    const salva: PartidaSalva = { liga_nome: 'Brasileirão Série A', gols_mandante: 1, gols_visitante: 0, gols: [{ jogador: 'A. Barboza', minuto: '16', mandante: true, contra: false, penalti: false }] };
    const m = montar({ salvas: new Map([[7290, salva]]) });
    await rodar(m);
    expect(m.bsd.incidentes).not.toHaveBeenCalled();
    expect(m.salvasNaChamada()[0].gols).toEqual(salva.gols);
  });

  it('busca o resultado final de quem estava ao vivo e saiu da lista', async () => {
    const final = evento({ status: 'finished', period: 'FT', current_minute: 90, home_score: 4, away_score: 1 });
    const m = montar({ aoVivo: [], idsAoVivo: [7290], finais: new Map([[7290, final]]) });
    await rodar(m);
    expect(m.bsd.evento).toHaveBeenCalledWith(7290);
    expect(m.salvasNaChamada()[0]).toMatchObject({ status: 'encerrada', periodo: null, minuto: null, gols_mandante: 4, gols_visitante: 1 });
  });

  it('no modo agenda pede os últimos 2 dias e os próximos 7, ou a janela pedida', async () => {
    const m = montar({ agenda: [evento({ status: 'notstarted', home_score: null, away_score: null, current_minute: null, period: '' })] });
    await rodar(m, pedido({ modo: 'agenda' }));
    expect(m.bsd.eventos).toHaveBeenCalledWith('2026-10-09', '2026-10-18');
    expect(m.salvasNaChamada()[0]).toMatchObject({ status: 'agendada', gols: [], periodo: null });
    expect(m.bsd.incidentes).not.toHaveBeenCalled();

    await rodar(m, pedido({ modo: 'agenda', dias_antes: 30, dias_depois: 0 }));
    expect(m.bsd.eventos).toHaveBeenLastCalledWith('2026-09-11', '2026-10-11');
  });

  it('usa o nome da BSD para liga e adversário fora do catálogo', async () => {
    const m = montar({ aoVivo: [evento({ league_id: 384, away_team_id: 5001, away_team: 'Club Olimpia', home_score: 0, away_score: 0 })] });
    await rodar(m);
    expect(m.bsd.nomeDaLiga).toHaveBeenCalledWith(384);
    expect(m.salvasNaChamada()[0]).toMatchObject({ liga_nome: 'Copa Libertadores', visitante_nome: 'Club Olimpia', gols: [] });
  });

  it('limita os pedidos de gols por rodada para poupar a cota da BSD', async () => {
    const muitos = Array.from({ length: MAX_INCIDENTES + 5 }, (_, i) => evento({ id: 1000 + i }));
    const m = montar({ aoVivo: muitos });
    const corpo = await (await rodar(m)).json();
    expect(m.bsd.incidentes).toHaveBeenCalledTimes(MAX_INCIDENTES);
    expect(corpo).toMatchObject({ salvas: MAX_INCIDENTES + 5, incidentes: MAX_INCIDENTES });
  });

  it('com o teto de incidentes, busca primeiro os gols dos jogos mais recentes', async () => {
    const antigos = Array.from({ length: MAX_INCIDENTES }, (_, i) => evento({ id: 2000 + i, status: 'finished', event_date: `2026-10-0${1 + (i % 5)}T20:00:00+00:00` }));
    const recente = evento({ id: 7290, status: 'finished', event_date: '2026-10-11T20:30:00+00:00' });
    const m = montar({ agenda: [...antigos, recente] });
    await rodar(m, pedido({ modo: 'agenda' }));
    expect(m.bsd.incidentes).toHaveBeenNthCalledWith(1, 7290);
  });

  it('fora da janela de algum jogo salvo, nem chama a BSD', async () => {
    const m = montar({ naJanela: false });
    const resposta = await rodar(m);
    expect(await resposta.json()).toEqual({ ok: true, modo: 'ao_vivo', salvas: 0, incidentes: 0, sem_jogo_na_janela: true });
    expect(m.bsd.aoVivo).not.toHaveBeenCalled();
    expect(m.salvar).not.toHaveBeenCalled();
  });

  it('a janela vai de 3 h antes até 5 min depois de agora (pelo horário de início)', async () => {
    const m = montar();
    await rodar(m);
    expect(m.haJogoNaJanela).toHaveBeenCalledWith(new Date('2026-10-11T18:00:00Z'), new Date('2026-10-11T21:05:00Z'));
  });

  it('o modo agenda não depende da janela', async () => {
    const m = montar({ naJanela: false, agenda: [evento({ status: 'notstarted', home_score: null, away_score: null })] });
    await rodar(m, pedido({ modo: 'agenda' }));
    expect(m.haJogoNaJanela).not.toHaveBeenCalled();
    expect(m.salvar).toHaveBeenCalled();
  });

  it('converte todos os status da BSD; pênaltis seguem ao vivo', async () => {
    const m = montar({
      aoVivo: [
        evento({ id: 1, status: 'penalties', period: 'extra_time', current_minute: 120, home_score: 1, away_score: 1 }),
        evento({ id: 2, status: 'delayed', period: null, current_minute: null, home_score: null, away_score: null }),
        evento({ id: 3, status: 'halftime', period: null, current_minute: 45, home_score: 0, away_score: 0 }),
        evento({ id: 4, status: 'aet', period: 'FT', home_score: 2, away_score: 1 }),
        evento({ id: 5, status: 'cancelled', home_score: null, away_score: null }),
        evento({ id: 6, status: 'unresolved' }),
      ],
    });
    await rodar(m);
    const porId = Object.fromEntries(m.salvasNaChamada().map((p) => [p.id, [p.status, p.periodo]]));
    expect(porId).toEqual({
      1: ['ao_vivo', 'PEN'],
      2: ['agendada', null],
      3: ['ao_vivo', 'INT'],
      4: ['encerrada', null],
      5: ['cancelada', null],
    });
  });

  it('recusa quem não manda o segredo do cron', async () => {
    const m = montar();
    const resposta = await rodar(m, pedido({}, 'outro'));
    expect(resposta.status).toBe(401);
    expect(m.bsd.aoVivo).not.toHaveBeenCalled();
  });

  it('avisa quando falta a chave da BSD ou o segredo', async () => {
    const m = montar();
    expect((await sincronizar(pedido(), { bsd: null, banco: m.banco, segredo: 'segredo-cron' })).status).toBe(503);
    expect((await sincronizar(pedido(), { bsd: m.bsd, banco: m.banco, segredo: undefined })).status).toBe(500);
  });

  it('responde 502 sem salvar nada quando a BSD falha', async () => {
    const m = montar();
    m.bsd.aoVivo.mockRejectedValueOnce(new Error('BSD 429'));
    const resposta = await rodar(m);
    expect(resposta.status).toBe(502);
    expect(m.salvar).not.toHaveBeenCalled();
  });
});

describe('sincronizar-partidas · classificação', () => {
  const linha = (position: number, team_id: number, pts: number) => ({ position, team_id, team_name: `Time ${team_id}`, played: 30, won: 10, drawn: 5, lost: 15, gf: 40, ga: 45, pts, form: 'WDLWW' });

  it('atualiza as competições com jogo nas últimas 6 h, inclusive copas fora do catálogo', async () => {
    const m = montar({ ligasRecentes: [9, 32], tabelas: new Map([[9, { standings: [linha(1, 160, 60), linha(2, 162, 58)] }], [32, { groups: { 'Group F': [linha(2, 162, 11)] } }]]) });
    const resposta = await rodar(m, pedido({ modo: 'classificacao' }));
    expect(await resposta.json()).toEqual({ ok: true, modo: 'classificacao', ligas: 2, linhas: 3, falhas: [] });
    expect(m.ligasComJogoDesde).toHaveBeenCalledWith(new Date('2026-10-11T15:00:00Z'));
    expect(m.salvarClassificacao).toHaveBeenCalledWith(32, [expect.objectContaining({ grupo: 'Grupo F', clube_id: 162, clube_nome: 'Palmeiras' })]);
    expect(m.salvarClassificacao).toHaveBeenCalledWith(9, [
      expect.objectContaining({ liga_id: 9, grupo: '', clube_id: 160, clube_nome: 'Flamengo', posicao: 1, pontos: 60, jogos: 30, gols_pro: 40, gols_contra: 45, forma: 'WDLWW' }),
      expect.objectContaining({ clube_id: 162, posicao: 2 }),
    ]);
  });

  it('com "todas", passa pelas ligas do catálogo e pelas copas dos clubes com torcedores, e segue quando uma falha', async () => {
    const m = montar({ torcedores: [162], copas: [32, 9], tabelas: new Map([[34, { standings: [linha(1, 809, 70)] }], [32, { standings: [] }]]) });
    const corpo = await (await rodar(m, pedido({ modo: 'classificacao', todas: true }))).json();
    expect(corpo).toEqual({ ok: true, modo: 'classificacao', ligas: 3, linhas: 1, falhas: [9] });
    expect(m.competicoesDosClubes).toHaveBeenCalledWith([162], new Date('2025-11-15T21:00:00Z'));
    expect(m.ligasComJogoDesde).not.toHaveBeenCalled();
    // Copa fora do catálogo pega o nome na BSD.
    expect(m.bsd.nomeDaLiga).toHaveBeenCalledWith(32);
  });

  it('guarda o formato e as fases da competição', async () => {
    const libertadores: ClassificacaoBsd = {
      season: {
        id: 96,
        name: 'CONMEBOL Libertadores 2026',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        stages: [
          { stage: 'group-stage', stage_name: 'Group stage', rounds: 6, start_date: '2026-04-07', end_date: '2026-05-29' },
          { stage: 'quarterfinals', stage_name: 'Quarterfinals', rounds: 1, start_date: '2026-09-08', end_date: '2026-09-18' },
        ],
      },
      groups: { 'Group F': [{ ...linha(2, 162, 11), zone: { label: 'Playoffs', type: 'playoff' } }] },
    };
    const m = montar({ ligasRecentes: [32], tabelas: new Map([[32, libertadores]]) });
    await rodar(m, pedido({ modo: 'classificacao' }));
    expect(m.salvarCompeticao).toHaveBeenCalledWith({
      liga_id: 32,
      nome: 'Copa Libertadores',
      temporada_id: 96,
      temporada: 'CONMEBOL Libertadores 2026',
      inicio: '2026-01-01',
      fim: '2026-12-31',
      formato: 'grupos_mata_mata',
      fases: [
        { fase: 'group-stage', nome: 'Fase de grupos', rodadas: 6, inicio: '2026-04-07', fim: '2026-05-29' },
        { fase: 'quarterfinals', nome: 'Quartas de final', rodadas: 1, inicio: '2026-09-08', fim: '2026-09-18' },
      ],
      atualizado_em: AGORA.toISOString(),
    });
    expect(m.salvarClassificacao).toHaveBeenCalledWith(32, [expect.objectContaining({ grupo: 'Grupo F', zona: 'Classificação', zona_tipo: 'playoff' })]);
  });

  it('liga sem tabela não apaga a que já existe', async () => {
    const m = montar({ ligasRecentes: [9], tabelas: new Map([[9, { standings: [] }]]) });
    await rodar(m, pedido({ modo: 'classificacao' }));
    expect(m.salvarClassificacao).not.toHaveBeenCalled();
  });

  it('no Brasileirão desempata por vitórias antes do saldo e recalcula a zona pela posição nova', () => {
    // Rodada 30 de 2026: BSD pôs o Inter (7 vitórias, saldo -5) à frente do Corinthians (8 vitórias, saldo -7).
    const inter = { position: 16, team_id: 161, team_name: 'Internacional', played: 30, won: 7, drawn: 11, lost: 12, gf: 33, ga: 38, pts: 32, zone: null };
    const corinthians = { position: 17, team_id: 167, team_name: 'Corinthians', played: 30, won: 8, drawn: 8, lost: 14, gf: 31, ga: 38, pts: 32, zone: { label: 'Relegation', type: 'relegation' } };
    const mirassol = { position: 15, team_id: 151, team_name: 'Mirassol', played: 30, won: 8, drawn: 9, lost: 13, gf: 34, ga: 44, pts: 33, zone: null };
    const acima = Array.from({ length: 14 }, (_, k) => ({ position: k + 1, team_id: 1000 + k, team_name: `Time ${k + 1}`, played: 30, won: 15, drawn: 5, lost: 10, gf: 40, ga: 30, pts: 60 - k, zone: null }));
    const abaixo = [18, 19, 20].map((p) => ({ position: p, team_id: 2000 + p, team_name: `Time ${p}`, played: 30, won: 3, drawn: 5, lost: 22, gf: 20, ga: 60, pts: 40 - p, zone: { label: 'Relegation', type: 'relegation' } }));
    const tabela: ClassificacaoBsd = {
      standings: [...acima, { ...mirassol, position: 15 }, { ...inter, position: 16 }, { ...corinthians, position: 17 }, ...abaixo],
      zones: [{ label: 'Relegation', type: 'relegation', from: 17, to: 20 }],
    };
    const linhas = linhasDaClassificacao(9, tabela, AGORA).filter((l) => l.posicao >= 15 && l.posicao <= 18);
    expect(linhas.map((l) => [l.clube_nome, l.posicao, l.zona])).toEqual([
      ['Mirassol', 15, null],
      ['Corinthians', 16, null],
      ['Internacional', 17, 'Rebaixamento'],
      ['Time 18', 18, 'Rebaixamento'],
    ]);
    // Em outra liga, vale a ordem e a zona da BSD.
    const outra = linhasDaClassificacao(1, tabela, AGORA).filter((l) => l.posicao === 16 || l.posicao === 17);
    expect(outra.map((l) => [l.clube_nome, l.zona])).toEqual([
      ['Internacional', null],
      ['Corinthians', 'Rebaixamento'],
    ]);
  });

  it('ligas com grupos guardam o grupo de cada linha', () => {
    const linhas = linhasDaClassificacao(18, { groups: { 'Group A': [linha(1, 293, 50)], Oeste: [linha(1, 278, 51)] } }, AGORA);
    // Time fora do catálogo fica com o nome da BSD.
    expect(linhas.map((l) => [l.grupo, l.clube_id, l.clube_nome, l.posicao])).toEqual([
      ['Grupo A', 293, 'Time 293', 1],
      ['Oeste', 278, 'Time 278', 1],
    ]);
  });
});

describe('sincronizar-partidas · temporada e fases', () => {
  const posicao = (position: number, team_id: number) => ({ position, team_id, team_name: `Time ${team_id}`, played: 30, won: 10, drawn: 5, lost: 15, gf: 40, ga: 45, pts: 50, form: 'WDLWW' });

  it('busca a temporada de cada clube com torcedores e grava fase, grupo, ida e pênaltis', async () => {
    const volta = evento({
      id: 600964,
      status: 'finished',
      league_id: 32,
      season_id: 96,
      stage: 'quarterfinals',
      stage_name: 'Quarterfinals',
      group_name: null,
      previous_leg_event_id: 599509,
      penalty_shootout: { home: 3, away: 4 },
      home_team_id: 778,
      home_team: 'LDU',
      away_team_id: 162,
      away_team: 'Palmeiras',
      home_score: 3,
      away_score: 2,
    });
    const grupo = evento({ id: 9000, status: 'finished', league_id: 32, stage: 'group-stage', stage_name: 'Group stage', group_name: 'Group F', home_score: 0, away_score: 0 });
    const m = montar({ aoVivo: [], torcedores: [162], doTime: new Map([[162, [volta, grupo]]]) });
    const corpo = await (await rodar(m, pedido({ modo: 'temporada' }))).json();
    expect(corpo).toMatchObject({ ok: true, modo: 'temporada', clubes: 1, salvas: 2, falhas: [] });
    expect(m.bsd.eventosDoTime).toHaveBeenCalledWith(162, '2025-11-15');
    const [a, b] = m.salvasNaChamada();
    expect(a).toMatchObject({ id: 600964, temporada_id: 96, fase: 'quarterfinals', fase_nome: 'Quartas de final', grupo: null, jogo_de_ida: 599509, penaltis_mandante: 3, penaltis_visitante: 4 });
    expect(b).toMatchObject({ id: 9000, fase: 'group-stage', fase_nome: 'Fase de grupos', grupo: 'Grupo F' });
  });

  it('modo clube: temporada e tabelas de um clube só, para quem acabou de escolher ou trocar de time', async () => {
    const jogo = evento({ id: 8001, status: 'finished', league_id: 9, home_team_id: 160, home_team: 'Flamengo', away_team_id: 167, away_team: 'Corinthians' });
    const m = montar({ aoVivo: [], copas: [9], doTime: new Map([[160, [jogo]]]), tabelas: new Map([[9, { standings: [posicao(1, 160), posicao(2, 162)] }]]) });
    const corpo = await (await rodar(m, pedido({ modo: 'clube', clube: 160 }))).json();
    expect(corpo).toMatchObject({ ok: true, modo: 'clube', clube: 160, salvas: 1, ligas: 1, linhas: 2, falhas: [] });
    expect(m.bsd.eventosDoTime).toHaveBeenCalledWith(160, '2025-11-15');
    expect(m.competicoesDosClubes).toHaveBeenCalledWith([160], new Date('2025-11-15T21:00:00Z'));
    expect(m.salvarClassificacao).toHaveBeenCalledWith(9, expect.any(Array));
  });

  it('modo clube sem o id do clube é recusado', async () => {
    const resposta = await rodar(montar(), pedido({ modo: 'clube' }));
    expect(resposta.status).toBe(400);
  });

  it('a lista ao vivo, que não traz fase, mantém a fase já salva', async () => {
    const salva: PartidaSalva = {
      liga_nome: 'Copa Libertadores',
      gols_mandante: 1,
      gols_visitante: 0,
      gols: [{ jogador: 'A. Barboza', minuto: '16', mandante: true, contra: false, penalti: false }],
      temporada_id: 96,
      fase: 'semifinals',
      fase_nome: 'Semifinal',
      grupo: null,
      jogo_de_ida: 604436,
      penaltis_mandante: null,
      penaltis_visitante: null,
    };
    const m = montar({ salvas: new Map([[7290, salva]]) });
    await rodar(m);
    expect(m.salvasNaChamada()[0]).toMatchObject({ temporada_id: 96, fase: 'semifinals', fase_nome: 'Semifinal', jogo_de_ida: 604436 });
  });
});

describe('fases, zonas e formato', () => {
  it.each([
    ['round-of-16', 'Oitavas de final'],
    ['semifinals', 'Semifinal'],
    ['qualification-round-2', '2ª fase preliminar'],
    ['3rd-round', '3ª fase'],
    ['round-5', '5ª fase'],
    ['something-new', 'Nome da BSD'],
  ])('%s → %s', (fase, esperado) => expect(nomeDaFase(fase, 'Nome da BSD')).toBe(esperado));

  it('zonas conhecidas em português', () => {
    expect(nomeDaZona('Copa Sudamericana')).toBe('Sul-Americana');
    expect(nomeDaZona('Relegation')).toBe('Rebaixamento');
    expect(nomeDaZona('Something')).toBe('Something');
  });

  it('formato pelas fases', () => {
    expect(formatoDaCompeticao(['regular-season'])).toBe('pontos_corridos');
    expect(formatoDaCompeticao(['round-of-16', 'quarterfinals', 'semifinals', 'final'])).toBe('mata_mata');
    expect(formatoDaCompeticao(['qualification-round-1', 'group-stage', 'round-of-16'])).toBe('grupos_mata_mata');
    expect(formatoDaCompeticao([])).toBe('pontos_corridos');
  });

  it('sem temporada na resposta, não há competição', () => {
    expect(competicaoDe(9, 'Brasileirão Série A', { standings: [] }, AGORA)).toBeNull();
  });
});

describe('golsDe', () => {
  it('põe os gols na ordem do jogo, com acréscimos, gol contra e pênalti', () => {
    const gols = golsDe([
      { type: 'period', minute: 90 },
      gol({ minute: 90, added_time: 1, player: 'G. Henrique', is_home: false }),
      gol({ minute: 51, player: 'A. Giay', goal_type: 'penalty' }),
      gol({ minute: 46, player: 'M. Bidu', goal_type: 'ownGoal' }),
      { type: 'card', minute: 40, player: 'Raniele', is_home: false },
      gol({ minute: 45, added_time: 1, player: 'A. Giay' }),
    ]);
    expect(gols).toEqual([
      { jogador: 'A. Giay', minuto: '45+1', mandante: true, contra: false, penalti: false },
      { jogador: 'M. Bidu', minuto: '46', mandante: true, contra: true, penalti: false },
      { jogador: 'A. Giay', minuto: '51', mandante: true, contra: false, penalti: true },
      { jogador: 'G. Henrique', minuto: '90+1', mandante: false, contra: false, penalti: false },
    ]);
  });

  it('ignora pênalti perdido', () => {
    expect(golsDe([gol({ goal_type: 'missedPenalty' })])).toEqual([]);
  });
});

describe('periodoDe', () => {
  it.each([
    ['1st_half', '1T'],
    ['halftime', 'INT'],
    ['2nd_half', '2T'],
    ['extra_time_1st', 'PRO'],
    ['penalties', 'PEN'],
    ['FT', null],
    [null, null],
  ])('%s → %s', (bsd, esperado) => expect(periodoDe(bsd)).toBe(esperado));
});
