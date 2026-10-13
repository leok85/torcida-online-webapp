-- Design da W02: o chat da torcida fecha com o apito final e as mensagens ficam só para leitura.
create or replace function public.chat_aberto(p_partida integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.partidas p where p.id = p_partida and p.status = 'ao_vivo')
$$;
