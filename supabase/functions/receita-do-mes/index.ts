// Edge Function (Deno): POST /functions/v1/receita-do-mes. Chamada pelo Painel do back-office com o token de quem é
// super admin ou analista. Publicada com verify_jwt desligado: a autorização é feita em handler.ts.
import { admin, stripe } from '../_compartilhado/adaptadores.ts';
import { receitaDoMes, type Movimento } from './handler.ts';

Deno.serve((req) =>
  receitaDoMes(req, {
    async papelDoToken(jwt) {
      const { data } = await admin.auth.getUser(jwt);
      if (!data.user) return null;
      const { data: membro } = await admin.from('equipe').select('papel').eq('usuario_id', data.user.id).maybeSingle();
      return membro?.papel ?? null;
    },
    async movimentos(desde) {
      const lista: Movimento[] = [];
      for await (const t of stripe.balanceTransactions.list({ created: { gte: desde }, limit: 100 })) {
        lista.push({ tipo: t.type, valor: t.amount, moeda: t.currency });
      }
      return lista;
    },
    async assinantes() {
      const { data, error } = await admin.rpc('assinantes_pagantes');
      if (error) throw new Error(`assinantes: ${error.message}`);
      return Number(data);
    },
  }),
);
