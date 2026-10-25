/**
 * Maiores torcidas do app: torcedores com cadastro concluído por clube, no mundo e no país do clube de quem pergunta.
 * `novos_na_semana` conta quem escolheu (ou trocou para) o clube nos últimos 7 dias. Traz o top `p_limite` de cada
 * escopo e, se o clube do torcedor logado ficou de fora, a linha dele no fim.
 */
create function public.maiores_torcidas(p_limite integer default 10)
returns table (
  escopo text,
  posicao bigint,
  clube_id integer,
  nome text,
  pais text,
  pais_nome text,
  bandeira text,
  torcedores integer,
  novos_na_semana integer,
  meu boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with meu as (
    select p.time_id, c.pais from public.perfis p join public.clubes c on c.id = p.time_id where p.id = (select auth.uid())
  ),
  torcidas as (
    select p.time_id as clube_id, count(*)::integer as torcedores,
      (count(*) filter (where coalesce(p.time_trocado_em, p.onboarding_concluido_em) > now() - interval '7 days'))::integer as novos
    from public.perfis p
    where p.time_id is not null and p.onboarding_concluido_em is not null
    group by p.time_id
  ),
  clubes as (
    select t.clube_id, c.nome, c.pais, pa.nome as pais_nome, pa.bandeira, t.torcedores, t.novos,
      t.clube_id = (select time_id from meu) as meu
    from torcidas t
    join public.clubes c on c.id = t.clube_id
    join public.paises pa on pa.codigo = c.pais
  ),
  classificados as (
    select 'mundo'::text as escopo, row_number() over (order by c.torcedores desc, c.novos desc, c.nome) as posicao, c.*
    from clubes c
    union all
    select 'pais', row_number() over (order by c.torcedores desc, c.novos desc, c.nome), c.*
    from clubes c
    where c.pais = (select pais from meu)
  )
  select c.escopo, c.posicao, c.clube_id, c.nome, c.pais, c.pais_nome, c.bandeira, c.torcedores, c.novos, c.meu
  from classificados c
  where c.posicao <= least(greatest(coalesce(p_limite, 10), 1), 50) or c.meu
  order by c.escopo, c.posicao;
$$;

revoke execute on function public.maiores_torcidas(integer) from public, anon;
grant execute on function public.maiores_torcidas(integer) to authenticated;
