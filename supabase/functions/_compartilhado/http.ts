// Utilidades HTTP das Edge Functions. Sem dependências do Deno: os testes do Vitest importam direto.

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const json = (status: number, corpo: object) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export const jwtDe = (req: Request) => req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || null;

/** Endereços do web app para onde o Stripe pode mandar o torcedor de volta. */
const ORIGENS = ['https://app.torcidaonline.com.br', 'http://localhost:5173', 'http://localhost:5174'];

/** A origem do pedido, se for do web app; senão a de produção. Nunca devolve um endereço de terceiros. */
export const origemDoApp = (req: Request) => {
  const origem = req.headers.get('Origin');
  return origem && ORIGENS.includes(origem) ? origem : ORIGENS[0];
};

export async function lerCorpo(req: Request): Promise<Record<string, unknown>> {
  try {
    const corpo = await req.json();
    return corpo && typeof corpo === 'object' ? corpo : {};
  } catch {
    return {};
  }
}
