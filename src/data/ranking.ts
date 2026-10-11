export type RankEntry = { pos: string; name: string; xp: string; level: string; me?: boolean };

export const RANK_BASE: RankEntry[] = [
  { pos: '1º', name: 'Bia.T', xp: '18.240', level: '47' },
  { pos: '2º', name: 'Rafa_9 não', xp: '16.980', level: '44' },
  { pos: '3º', name: 'JP.Souza', xp: '15.320', level: '41' },
  { pos: '4º', name: 'Léo.Mansur', xp: '8.905', level: '23' },
  { pos: '5º', name: 'torcida_fiel', xp: '8.410', level: '22' },
  { pos: '6º', name: 'Vini', xp: '7.980', level: '21' },
  { pos: '7º', name: 'Marcela_10', xp: '7.640', level: '21' },
  { pos: '8º', name: 'gustavo.b', xp: '7.120', level: '20' },
  { pos: '9º', name: 'sempre.junto', xp: '6.870', level: '19' },
  { pos: '10º', name: 'Kaio', xp: '6.450', level: '18' },
  { pos: '11º', name: 'Duda.S', xp: '6.190', level: '18' },
];

export const ME: RankEntry = { pos: '12º', name: 'Você · Rafa_9', xp: '5.910', level: '24', me: true };
