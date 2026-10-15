// Arrecadado no mês para o Painel do back-office: soma o que entrou no saldo do Stripe desde o dia 1º (horário de
// Brasília), já descontados os reembolsos. Valores do Stripe na moeda da conta, em centavos. Apple e Google ficam
// de fora até o app entrar nas lojas. Só super admin e analista (os papéis que veem o financeiro).
import { json, jwtDe } from '../_compartilhado/http.ts';

export type Movimento = { tipo: string; valor: number; moeda: string };

export type Dependencias = {
  papelDoToken: (jwt: string) => Promise<string | null>;
  /** Movimentos do saldo do Stripe criados a partir do instante (segundos Unix). */
  movimentos: (desde: number) => Promise<Movimento[]>;
  assinantes: () => Promise<number>;
  agora?: () => Date;
};

const PAPEIS = ['super_admin', 'analista'];
const ENTRADAS = ['charge', 'payment'];
const ESTORNOS = ['refund', 'payment_refund', 'payment_failure_refund'];

/** 1º dia do mês corrente em Brasília (UTC−3, sem horário de verão desde 2019). */
export function inicioDoMes(agora: Date) {
  const brasilia = new Date(agora.getTime() - 3 * 3600_000);
  const inicio = Date.UTC(brasilia.getUTCFullYear(), brasilia.getUTCMonth(), 1, 3);
  return { segundos: Math.floor(inicio / 1000), mes: `${brasilia.getUTCFullYear()}-${String(brasilia.getUTCMonth() + 1).padStart(2, '0')}` };
}

export async function receitaDoMes(req: Request, deps: Dependencias): Promise<Response> {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { erro: 'metodo_nao_permitido' });
  const jwt = jwtDe(req);
  if (!jwt || !PAPEIS.includes((await deps.papelDoToken(jwt)) ?? '')) return json(401, { erro: 'nao_autorizado' });

  const { segundos, mes } = inicioDoMes(deps.agora?.() ?? new Date());
  const [movimentos, assinantes] = await Promise.all([deps.movimentos(segundos), deps.assinantes()]);

  let centavos = 0;
  let pagamentos = 0;
  for (const m of movimentos) {
    if (ENTRADAS.includes(m.tipo)) {
      centavos += m.valor;
      pagamentos += 1;
    } else if (ESTORNOS.includes(m.tipo)) {
      // O Stripe já manda o estorno com valor negativo.
      centavos += m.valor;
    }
  }

  return json(200, {
    mes,
    moeda: (movimentos[0]?.moeda ?? 'brl').toUpperCase(),
    arrecadado: centavos / 100,
    pagamentos,
    assinantes,
    ticket: pagamentos ? Math.round(centavos / pagamentos) / 100 : 0,
  });
}
