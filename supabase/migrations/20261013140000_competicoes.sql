-- Tela de Campeonatos: em quais competições o clube está, o formato de cada uma e o caminho até a final.

-- Fase de cada jogo (como a BSD manda), para montar o mata-mata, os grupos e o "ida e volta".
alter table public.partidas
  add column temporada_id integer,
  -- Chave da BSD: 'regular-season', 'group-stage', 'round-of-16', 'quarterfinals', 'semifinals', 'final'...
  add column fase text,
  -- Em português: 'Quartas de final', 'Fase de grupos'.
  add column fase_nome text,
  -- 'Grupo F' nas fases de grupos.
  add column grupo text,
  -- Na volta de um mata-mata, o id do jogo de ida.
  add column jogo_de_ida integer,
  add column penaltis_mandante integer,
  add column penaltis_visitante integer;

-- A classificação passa a guardar também copas (fora do catálogo de ligas) e as zonas da tabela.
alter table public.classificacao drop constraint classificacao_liga_id_fkey;
alter table public.classificacao
  -- Zona da BSD em português ('Libertadores', 'Rebaixamento') e o tipo ('qualification', 'relegation', 'playoff').
  add column zona text,
  add column zona_tipo text;

-- Cada competição da temporada atual: formato e fases, da BSD (/leagues/{id}/standings/ → season.stages).
create table public.competicoes (
  liga_id integer primary key,
  nome text not null,
  temporada_id integer,
  temporada text,
  inicio date,
  fim date,
  formato text not null check (formato in ('pontos_corridos', 'mata_mata', 'grupos_mata_mata')),
  -- [{ "fase": "quarterfinals", "nome": "Quartas de final", "rodadas": 1, "inicio": "2026-09-08", "fim": "2026-09-18" }]
  fases jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.competicoes enable row level security;
create policy "Torcedores leem as competições" on public.competicoes for select to authenticated using (true);
revoke all on public.competicoes from anon, authenticated;
grant select on public.competicoes to authenticated;
grant select, insert, update, delete on public.competicoes to service_role;

-- Nome do time em cada linha da tabela: nas copas há adversários fora do catálogo de clubes.
alter table public.classificacao add column clube_nome text;
