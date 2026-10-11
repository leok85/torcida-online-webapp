export type Position = 'GOL' | 'ZAG' | 'LAT' | 'ALA' | 'VOL' | 'MEI' | 'PON' | 'ATA';

export type Player = { id: string; n: string; name: string; pos: Position };

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

export const SQUAD: Player[] = [
  { id: 'j1', n: '1', name: 'Alves', pos: 'GOL' }, { id: 'j12', n: '12', name: 'Nunes', pos: 'GOL' },
  { id: 'j3', n: '3', name: 'Bruno', pos: 'ZAG' }, { id: 'j4', n: '4', name: 'Diego', pos: 'ZAG' }, { id: 'j14', n: '14', name: 'Rocha', pos: 'ZAG' },
  { id: 'j2', n: '2', name: 'Kaio', pos: 'LAT' }, { id: 'j6', n: '6', name: 'Léo', pos: 'LAT' }, { id: 'j13', n: '13', name: 'Tiago', pos: 'LAT' },
  { id: 'j5', n: '5', name: 'Pedro', pos: 'VOL' }, { id: 'j8', n: '8', name: 'Caio', pos: 'VOL' }, { id: 'j15', n: '15', name: 'Moura', pos: 'VOL' },
  { id: 'j10', n: '10', name: 'Vitor', pos: 'MEI' }, { id: 'j20', n: '20', name: 'Enzo', pos: 'MEI' }, { id: 'j18', n: '18', name: 'Juan', pos: 'MEI' },
  { id: 'j7', n: '7', name: 'Luan', pos: 'PON' }, { id: 'j11', n: '11', name: 'Davi', pos: 'PON' }, { id: 'j17', n: '17', name: 'Ryan', pos: 'PON' },
  { id: 'j9', n: '9', name: 'Gabriel', pos: 'ATA' }, { id: 'j19', n: '19', name: 'Iago', pos: 'ATA' },
];

/** Quais posições do elenco podem ocupar cada posição da formação. */
export const ELIGIBLE: Record<Position, Position[]> = {
  GOL: ['GOL'], ZAG: ['ZAG'], LAT: ['LAT'], ALA: ['LAT', 'PON'], VOL: ['VOL'], MEI: ['MEI', 'VOL'], PON: ['PON'], ATA: ['ATA', 'PON'],
};

export const GOALKEEPER_SLOT = 'gol0';

export function slotsFor(formation: string): Slot[] {
  const conf = FORMATIONS[formation] ?? FORMATIONS['4-3-3'];
  const slots: Slot[] = [{ id: GOALKEEPER_SLOT, pos: 'GOL', line: 'gol' }];
  conf.forEach((line, li) => line.forEach((pos, pi) => slots.push({ id: `l${li}p${pi}`, pos, line: `l${li}` })));
  return slots;
}

/**
 * Resolve quem ocupa cada vaga: primeiro as escolhas do torcedor, depois
 * jogadores da posição exata e, por fim, qualquer elegível ainda no banco.
 */
export function resolveLineup(slots: Slot[], picks: Record<string, string>): Record<string, string> {
  const used = new Set<string>();
  const lineup: Record<string, string> = {};
  const fill = (match: (p: Player, s: Slot) => boolean) =>
    slots.forEach((s) => {
      if (lineup[s.id]) return;
      const p = SQUAD.find((j) => !used.has(j.id) && match(j, s));
      if (p) {
        lineup[s.id] = p.id;
        used.add(p.id);
      }
    });

  slots.forEach((s) => {
    const pick = picks[s.id];
    if (pick && !used.has(pick)) {
      lineup[s.id] = pick;
      used.add(pick);
    }
  });
  fill((p, s) => p.pos === s.pos);
  fill((p, s) => ELIGIBLE[s.pos].includes(p.pos));
  return lineup;
}

export const playerById = (id: string | undefined) => SQUAD.find((p) => p.id === id);
