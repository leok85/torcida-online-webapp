-- Jogos dos clubes do catálogo, copiados da BSD pela Edge Function sincronizar-partidas.
-- O id é o do evento na BSD. Adversários de fora do catálogo (ex.: Libertadores) também entram,
-- por isso nomes, liga e ids dos times ficam aqui sem chave estrangeira.
create table public.partidas (
  id integer primary key,
  liga_id integer,
  liga_nome text not null,
  rodada integer,
  inicio timestamptz not null,
  status text not null check (status in ('agendada', 'ao_vivo', 'encerrada', 'adiada', 'cancelada')),
  -- Durante o jogo: '1T', 'INT', '2T', 'PRO' (prorrogação) ou 'PEN' (pênaltis).
  periodo text check (periodo in ('1T', 'INT', '2T', 'PRO', 'PEN')),
  minuto integer,
  mandante_id integer not null,
  mandante_nome text not null,
  visitante_id integer not null,
  visitante_nome text not null,
  gols_mandante integer,
  gols_visitante integer,
  -- [{ "jogador": "A. Giay", "minuto": "45+1", "mandante": true, "contra": false }], na ordem do jogo.
  gols jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now()
);

create index partidas_mandante on public.partidas (mandante_id, inicio desc);
create index partidas_visitante on public.partidas (visitante_id, inicio desc);
create index partidas_ao_vivo on public.partidas (status) where status = 'ao_vivo';

alter table public.partidas enable row level security;
create policy "Torcedores leem as partidas" on public.partidas for select to authenticated using (true);
revoke all on public.partidas from anon, authenticated;
grant select on public.partidas to authenticated;
grant select, insert, update, delete on public.partidas to service_role;
