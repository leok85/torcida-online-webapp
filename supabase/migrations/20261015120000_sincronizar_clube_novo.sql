-- Quando alguém passa a torcer por um clube que ninguém tinha (onboarding ou troca de time), a temporada e as
-- tabelas dele são buscadas na hora (sincronizar-partidas, modo "clube"), sem esperar a rodada diária.
create function public.sincronizar_clube_novo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.time_id is not null
    and new.onboarding_concluido_em is not null
    and new.time_id is distinct from old.time_id
    and not exists (
      select 1 from public.perfis p
      where p.time_id = new.time_id and p.id <> new.id and p.onboarding_concluido_em is not null
    )
  then
    perform public.chamar_sincronizar_partidas_com(jsonb_build_object('modo', 'clube', 'clube', new.time_id));
  end if;
  return null;
end;
$$;

revoke execute on function public.sincronizar_clube_novo() from public, anon, authenticated;

create trigger sincronizar_clube_novo
  after update of time_id on public.perfis
  for each row execute function public.sincronizar_clube_novo();
