-- Dados reais no topo do web app: quantos torcedores o clube tem na plataforma e a posição dele na liga principal.

-- Classificação das ligas do catálogo, copiada da BSD pela Edge Function sincronizar-partidas (modo "classificacao").
-- Ligas com grupos/conferências guardam o nome do grupo; liga de tabela única usa ''.
create table public.classificacao (
  liga_id integer not null references public.ligas (id) on delete cascade,
  grupo text not null default '',
  clube_id integer not null,
  posicao integer not null,
  pontos integer not null,
  jogos integer not null,
  vitorias integer not null,
  empates integer not null,
  derrotas integer not null,
  gols_pro integer not null,
  gols_contra integer not null,
  -- Últimos resultados como a BSD manda, do mais antigo para o mais recente: "WWDLW".
  forma text,
  atualizado_em timestamptz not null default now(),
  primary key (liga_id, grupo, clube_id)
);

create index classificacao_clube on public.classificacao (clube_id);

alter table public.classificacao enable row level security;
create policy "Torcedores leem a classificação" on public.classificacao for select to authenticated using (true);
revoke all on public.classificacao from anon, authenticated;
grant select on public.classificacao to authenticated;
grant select, insert, update, delete on public.classificacao to service_role;

-- Artigo do nome da liga, para escrever "3º no Brasileirão" e "1º na Premier League".
alter table public.ligas add column artigo text not null default 'a' check (artigo in ('o', 'a'));
update public.ligas set artigo = 'o'
where nome in ('Brasileirão Série A', 'Brasileirão Série B', 'Girabola', 'Championship', 'USL Championship', 'Campeonato de Portugal');

-- Contagem de torcedores por clube (o RLS não deixa ninguém ler os perfis dos outros).
create index if not exists perfis_time_id on public.perfis (time_id);

-- Resumo para o topo: torcedores com onboarding concluído e a posição na liga do clube no catálogo.
create function public.resumo_do_clube(clube integer)
returns table (torcedores integer, posicao integer, liga text, artigo text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from public.perfis p where p.time_id = clube and p.onboarding_concluido_em is not null),
    c.posicao,
    l.nome,
    l.artigo
  from public.clubes cl
  left join public.ligas l on l.id = cl.liga_id
  left join public.classificacao c on c.liga_id = cl.liga_id and c.clube_id = cl.id
  where cl.id = clube
  order by c.posicao
  limit 1;
$$;

revoke execute on function public.resumo_do_clube(integer) from public, anon;
grant execute on function public.resumo_do_clube(integer) to authenticated;
