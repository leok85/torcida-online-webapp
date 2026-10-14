-- Palpite encerrado sem envio (W03): os placares mais palpitados pela torcida e o "Me avise" do próximo palpite.

/**
 * Os placares mais palpitados pela torcida do meu clube no jogo (até 4), com quantos votaram em cada um e o total.
 * Mesmas regras da escalação mais votada: só membros, só depois que o palpite fecha e com pelo menos 3 palpites.
 */
create function public.palpites_da_torcida(p_partida integer)
returns table (gols_mandante smallint, gols_visitante smallint, votos integer, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (
    select p.time_id from public.perfis p
    where p.id = (select auth.uid()) and public.sou_assinante() and public.situacao_do_palpite(p_partida, p.time_id) = 'fechado'
  ),
  da_torcida as (
    select pa.gols_mandante, pa.gols_visitante from public.palpites pa join eu on pa.clube_id = eu.time_id where pa.partida_id = p_partida
  ),
  total as (select count(*)::integer as n from da_torcida)
  select d.gols_mandante, d.gols_visitante, count(*)::integer, (select n from total)
  from da_torcida d
  where (select n from total) >= 3
  group by d.gols_mandante, d.gols_visitante
  order by count(*) desc, d.gols_mandante desc, d.gols_visitante
  limit 4
$$;

revoke execute on function public.palpites_da_torcida(integer) from public, anon;
grant execute on function public.palpites_da_torcida(integer) to authenticated;

-- ---------- "Me avise" ----------
-- Quem pediu aviso quando o palpite de um jogo abrir. O envio do aviso ainda não existe; o pedido fica guardado.
create table public.lembretes_palpite (
  partida_id integer not null references public.partidas (id) on delete cascade,
  usuario_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (partida_id, usuario_id)
);

alter table public.lembretes_palpite enable row level security;

create policy "Cada um vê os próprios lembretes" on public.lembretes_palpite
  for select to authenticated using (usuario_id = (select auth.uid()));
create policy "Cada um cria os próprios lembretes" on public.lembretes_palpite
  for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy "Cada um apaga os próprios lembretes" on public.lembretes_palpite
  for delete to authenticated using (usuario_id = (select auth.uid()));

grant select, insert, delete on public.lembretes_palpite to authenticated;
grant select, insert, update, delete on public.lembretes_palpite to service_role;
