// Preços do web app. São os mesmos que o site mostra (torcida-online-site, PRECOS em components/Site/content.ts),
// que manda para /assinar?plano=…&moeda=…. O app nativo vende pelas lojas com preço próprio, mais alto.
export type Plano = 'anual' | 'mensal';
export type Moeda = 'BRL' | 'USD' | 'EUR';

export const PRECOS: Record<Moeda, Record<Plano, number>> = {
  BRL: { mensal: 14.9, anual: 149 },
  USD: { mensal: 5.9, anual: 59 },
  EUR: { mensal: 5.49, anual: 54.9 },
};

export const lerPlano = (valor: string | null): Plano => (valor === 'mensal' ? 'mensal' : 'anual');
export const lerMoeda = (valor: string | null): Moeda => (valor === 'USD' || valor === 'EUR' ? valor : 'BRL');

export const formatarPreco = (valor: number, moeda: Moeda) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(valor).replace(/ /g, ' ');

/** Preço do anual dividido por 12, arredondado no centavo (R$ 149 → R$ 12,42, como no design). */
export const anualPorMes = (moeda: Moeda) => Math.round((PRECOS[moeda].anual / 12) * 100) / 100;

/** O que a assinatura libera, igual nos dois planos (tela Planos e bloqueios). */
export const BENEFICIOS = [
  { icone: 'bolt', titulo: 'XP e nível', texto: 'Palpites, missões e presença contam a cada rodada.' },
  { icone: 'monetization_on', titulo: 'Moedas que viram dinheiro', texto: '100 moedas = R$ 1,00, via Pix, a partir de 500.' },
  { icone: 'emoji_events', titulo: 'Prêmios reais', texto: 'Pacotes semanais, sorteios e itens da loja da torcida.' },
  { icone: 'forum', titulo: 'Chat e fotos ao vivo', texto: 'A torcida reunida durante os 90 minutos.' },
  { icone: 'how_to_reg', titulo: 'Palpites e MVP', texto: 'Placar antes do apito e notas para cada jogador.' },
  { icone: 'leaderboard', titulo: 'Ranking e conquistas', texto: 'Sua posição na torcida e as medalhas da temporada.' },
];
