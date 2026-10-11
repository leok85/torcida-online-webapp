-- As Edge Functions (service role) gravam assinaturas e o vínculo com o Stripe. Neste projeto a service role
-- não recebe essas permissões sozinha nas tabelas novas, então elas vão explícitas.
grant select, insert, update, delete on public.assinaturas to service_role;
grant select, insert, update, delete on public.clientes_stripe to service_role;
