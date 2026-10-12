// Semana do XP (segunda a domingo, horário de Brasília). Sem dependências: o Supabase falso dos testes também usa.
const FUSO = 'America/Sao_Paulo';
const DIA_MS = 86_400_000;

/** Segunda-feira 00:00 em Brasília (UTC-3, sem horário de verão) da semana de `agora`, como inicio_da_semana(). */
export function inicioDaSemana(agora = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
      .formatToParts(agora)
      .map((p) => [p.type, p.value]),
  );
  const desdeSegunda = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(partes.weekday);
  const meiaNoite = Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day), 3);
  return new Date(meiaNoite - desdeSegunda * DIA_MS);
}

