-- A sincronização (service_role) não lê a tabela perfis; esta função entrega só a lista de clubes escolhidos.
create function public.clubes_com_torcedores()
returns setof integer
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.time_id from public.perfis p where p.time_id is not null and p.onboarding_concluido_em is not null;
$$;

revoke execute on function public.clubes_com_torcedores() from public, anon, authenticated;
grant execute on function public.clubes_com_torcedores() to service_role;
