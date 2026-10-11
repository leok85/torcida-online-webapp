-- Catálogo de futebol: países, ligas e clubes, com os ids da BSD (Bzzoiro Sports Data).
-- Qualquer um lê (o onboarding mostra a lista antes de existir perfil completo); só o servidor grava.
create table public.paises (
  codigo text primary key check (codigo ~ '^[A-Z]{2}$'),
  nome text not null,
  -- Código do flag-icons (ex.: 'br', 'gb-eng').
  bandeira text not null,
  ordem smallint not null default 100
);

create table public.ligas (
  id integer primary key, -- id da liga na BSD
  nome text not null,
  pais text not null references public.paises (codigo),
  divisao smallint not null default 1,
  temporada text
);

create table public.clubes (
  id integer primary key, -- id do time na BSD
  nome text not null,
  nome_curto text,
  pais text not null references public.paises (codigo),
  liga_id integer references public.ligas (id),
  atualizado_em timestamptz not null default now()
);

create index clubes_pais on public.clubes (pais);
create index clubes_liga on public.clubes (liga_id);
create index ligas_pais on public.ligas (pais);

alter table public.paises enable row level security;
alter table public.ligas enable row level security;
alter table public.clubes enable row level security;

create policy "Todos leem os países" on public.paises for select to anon, authenticated using (true);
create policy "Todos leem as ligas" on public.ligas for select to anon, authenticated using (true);
create policy "Todos leem os clubes" on public.clubes for select to anon, authenticated using (true);

revoke all on public.paises, public.ligas, public.clubes from anon, authenticated;
grant select on public.paises, public.ligas, public.clubes to anon, authenticated;
grant select, insert, update, delete on public.paises, public.ligas, public.clubes to service_role;

-- perfis.time_id passa a ser o id do clube. Perfis com os clubes provisórios ('clube-a'...) voltam para o onboarding.
alter table public.perfis disable trigger perfis_antes_de_atualizar;
update public.perfis
set pais = null, time_id = null, onboarding_concluido_em = null
where time_id is not null and time_id !~ '^[0-9]+$';
alter table public.perfis enable trigger perfis_antes_de_atualizar;

alter table public.perfis
  drop constraint perfis_time_id_check,
  alter column time_id type integer using time_id::integer,
  add constraint perfis_time_id_fkey foreign key (time_id) references public.clubes (id),
  add constraint perfis_pais_fkey foreign key (pais) references public.paises (codigo);

create index perfis_time_id on public.perfis (time_id);
