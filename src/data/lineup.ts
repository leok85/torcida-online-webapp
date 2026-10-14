// Formações e vagas da escalação ideal (W03). O elenco vem da BSD, com as posições G, D, M e F.
import type { JogadorDoElenco } from './tiposDoPalpite';

export type Position = 'GOL' | 'ZAG' | 'LAT' | 'ALA' | 'VOL' | 'MEI' | 'PON' | 'ATA';

export type Slot = { id: string; pos: Position; line: string };

export const FORMATIONS: Record<string, Position[][]> = {
  '4-3-3': [['LAT', 'ZAG', 'ZAG', 'LAT'], ['VOL', 'MEI', 'MEI'], ['PON', 'ATA', 'PON']],
  '4-4-2': [['LAT', 'ZAG', 'ZAG', 'LAT'], ['MEI', 'VOL', 'VOL', 'MEI'], ['ATA', 'ATA']],
  '4-2-3-1': [['LAT', 'ZAG', 'ZAG', 'LAT'], ['VOL', 'VOL'], ['PON', 'MEI', 'PON'], ['ATA']],
  '3-5-2': [['ZAG', 'ZAG', 'ZAG'], ['ALA', 'VOL', 'MEI', 'VOL', 'ALA'], ['ATA', 'ATA']],
  '3-4-3': [['ZAG', 'ZAG', 'ZAG'], ['ALA', 'VOL', 'VOL', 'ALA'], ['PON', 'ATA', 'PON']],
  '5-3-2': [['ALA', 'ZAG', 'ZAG', 'ZAG', 'ALA'], ['VOL', 'MEI', 'MEI'], ['ATA', 'ATA']],
  '4-1-4-1': [['LAT', 'ZAG', 'ZAG', 'LAT'], ['VOL'], ['PON', 'MEI', 'MEI', 'PON'], ['ATA']],
};

export const FORMACAO_PADRAO = '4-3-3';

/** Posições do elenco (BSD) que cabem em cada vaga; a primeira é a natural, usada no preenchimento automático. */
export const ELIGIBLE: Record<Position, JogadorDoElenco['posicao'][]> = {
  GOL: ['G'],
  ZAG: ['D'],
  LAT: ['D'],
  ALA: ['D', 'M'],
  VOL: ['M'],
  MEI: ['M'],
  PON: ['F', 'M'],
  ATA: ['F'],
};

export const GOALKEEPER_SLOT = 'gol0';

export function slotsFor(formation: string): Slot[] {
  const conf = FORMATIONS[formation] ?? FORMATIONS[FORMACAO_PADRAO];
  const slots: Slot[] = [{ id: GOALKEEPER_SLOT, pos: 'GOL', line: 'gol' }];
  conf.forEach((line, li) => line.forEach((pos, pi) => slots.push({ id: `l${li}p${pi}`, pos, line: `l${li}` })));
  return slots;
}

/** As vagas em linhas, de cima (ataque) para baixo (goleiro), como o campo desenha. */
export function linhasDaFormacao(slots: Slot[]): Slot[][] {
  const linhas = [...new Set(slots.filter((s) => s.line !== 'gol').map((s) => s.line))].reverse();
  return [...linhas, 'gol'].map((l) => slots.filter((s) => s.line === l));
}

export type Escalacao = Record<string, number>;

/** Quem está disponível para o jogo (lesionado e suspenso ficam fora do preenchimento automático). */
export const disponivel = (j: JogadorDoElenco) => j.disponibilidade !== 'injured' && j.disponibilidade !== 'suspended';

/**
 * Quem ocupa cada vaga: primeiro as escolhas do torcedor (só jogadores do elenco, sem repetir e sem lesionado), depois quem está
 * disponível na posição natural da vaga e, por fim, qualquer disponível que caiba nela.
 */
export function resolveLineup(slots: Slot[], escolhas: Escalacao, elenco: JogadorDoElenco[]): Escalacao {
  // Lesionado não pode ser escalado: se a escolha salva ficou lesionada, a vaga é preenchida de novo.
  const ids = new Set(elenco.filter((j) => j.disponibilidade !== 'injured').map((j) => j.id));
  const usados = new Set<number>();
  const lineup: Escalacao = {};
  for (const s of slots) {
    const id = escolhas[s.id];
    if (id != null && ids.has(id) && !usados.has(id)) {
      lineup[s.id] = id;
      usados.add(id);
    }
  }
  const preencher = (cabe: (j: JogadorDoElenco, s: Slot) => boolean) =>
    slots.forEach((s) => {
      if (lineup[s.id] != null) return;
      const j = elenco.find((x) => !usados.has(x.id) && disponivel(x) && cabe(x, s));
      if (j) {
        lineup[s.id] = j.id;
        usados.add(j.id);
      }
    });
  preencher((j, s) => j.posicao === ELIGIBLE[s.pos][0]);
  preencher((j, s) => ELIGIBLE[s.pos].includes(j.posicao));
  return lineup;
}

/** Põe o jogador na vaga; se ele já estava em outra, troca de lugar com quem estava nesta. */
export function escalar(lineup: Escalacao, vaga: string, jogador: number): Escalacao {
  const novo = { ...lineup };
  const deOnde = Object.keys(novo).find((v) => novo[v] === jogador);
  const quemEstava = novo[vaga];
  novo[vaga] = jogador;
  if (deOnde && deOnde !== vaga) {
    if (quemEstava != null) novo[deOnde] = quemEstava;
    else delete novo[deOnde];
  }
  return novo;
}
