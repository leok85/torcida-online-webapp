export type NavItem = {
  path: string;
  label: string;
  icon: string;
  live?: boolean;
  badge?: string;
};

export const NAV_MAIN: NavItem[] = [
  { path: '/', label: 'Início', icon: 'home' },
  { path: '/ao-vivo', label: 'Jogo ao vivo', icon: 'sports_soccer', live: true },
  { path: '/escalacao', label: 'Escalação e palpite', icon: 'how_to_reg' },
  { path: '/pos-jogo', label: 'Pós-jogo e notas', icon: 'star_rate' },
  { path: '/missoes', label: 'Missões', icon: 'task_alt', badge: '3' },
  { path: '/ranking', label: 'Ranking', icon: 'leaderboard' },
  { path: '/fotos', label: 'Fotos', icon: 'photo_library' },
  { path: '/loja', label: 'Loja de moedas', icon: 'redeem' },
];

export const NAV_CLUB: NavItem[] = [
  { path: '/noticias', label: 'Notícias', icon: 'newspaper' },
  { path: '/campeonatos', label: 'Campeonatos', icon: 'emoji_events' },
  { path: '/clube', label: 'Página do clube', icon: 'shield' },
];
