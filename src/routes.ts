export type NavItem = {
  path: string;
  label: string;
  icon: string;
  /** Mostra a bolinha vermelha quando o clube do torcedor está em campo. */
  aoVivo?: boolean;
  /** Outras rotas que deixam o item marcado (as telas de um jogo ficam dentro de Jogos). */
  ativoEm?: string[];
  badge?: string;
  /** Só para assinantes: quem não é vê o cadeado no menu e a tela de bloqueio. */
  premium?: boolean;
};

/** Telas de um jogo: não estão no menu, abrem a partir de Jogos. */
export const TELAS_DO_JOGO: NavItem[] = [
  { path: '/ao-vivo', label: 'Jogo ao vivo', icon: 'sports_soccer' },
  { path: '/escalacao', label: 'Escalação e palpite', icon: 'how_to_reg', premium: true },
  { path: '/pos-jogo', label: 'Pós-jogo e notas', icon: 'star_rate', premium: true },
  { path: '/fotos', label: 'Fotos', icon: 'photo_library', premium: true },
];

const ROTAS_DO_JOGO = TELAS_DO_JOGO.map((t) => t.path);

export const NAV_MAIN: NavItem[] = [
  { path: '/', label: 'Início', icon: 'home' },
  { path: '/jogos', label: 'Jogos', icon: 'sports_soccer', aoVivo: true, ativoEm: ROTAS_DO_JOGO },
  { path: '/missoes', label: 'Missões', icon: 'task_alt', badge: '3', premium: true },
  { path: '/ranking', label: 'Ranking', icon: 'leaderboard', premium: true },
  { path: '/loja', label: 'Loja de moedas', icon: 'redeem', premium: true },
];

export const NAV_CLUB: NavItem[] = [
  { path: '/noticias', label: 'Notícias', icon: 'newspaper' },
  { path: '/campeonatos', label: 'Campeonatos', icon: 'emoji_events' },
  { path: '/clube', label: 'Página do clube', icon: 'shield' },
];
