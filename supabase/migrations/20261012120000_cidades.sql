-- Cidades para o onboarding ("de onde vem a torcida"). Por enquanto só o Brasil, com os municípios do IBGE;
-- a tabela já guarda país e fonte para receber outras bases depois (ex.: GeoNames).
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create table public.cidades (
  id bigint generated always as identity primary key,
  pais text not null references public.paises (codigo),
  nome text not null,
  -- Estado/província: a UF no Brasil.
  regiao text,
  -- De onde veio a cidade e o código dela lá (ex.: 'ibge' e '4205407').
  fonte text not null,
  codigo text not null,
  -- Nome minúsculo e sem acentos, para a busca.
  nome_busca text not null,
  unique (fonte, codigo)
);

create index cidades_nome_busca on public.cidades using gin (nome_busca extensions.gin_trgm_ops);
create index cidades_pais on public.cidades (pais);

alter table public.cidades enable row level security;
create policy "Todos leem as cidades" on public.cidades for select to anon, authenticated using (true);
revoke all on public.cidades from anon, authenticated;
grant select on public.cidades to anon, authenticated;
grant select, insert, update, delete on public.cidades to service_role;

-- Busca para o autocompletar: ignora acentos e o que vier depois da vírgula ("florianop, sc"),
-- e põe primeiro quem começa com o termo.
create function public.buscar_cidades(termo text, pais text default 'BR', limite integer default 8)
returns table (id bigint, nome text, regiao text)
language sql
stable
set search_path = ''
as $$
  with t as (
    select translate(lower(extensions.unaccent(btrim(split_part(termo, ',', 1)))), '%_', '') as q
  )
  select c.id, c.nome, c.regiao
  from public.cidades c, t
  where c.pais = buscar_cidades.pais
    and char_length(t.q) >= 2
    and c.nome_busca like '%' || t.q || '%'
  order by (c.nome_busca like t.q || '%') desc, char_length(c.nome), c.nome
  limit least(greatest(limite, 1), 20);
$$;

revoke execute on function public.buscar_cidades(text, text, integer) from public;
grant execute on function public.buscar_cidades(text, text, integer) to anon, authenticated;

-- O perfil passa a apontar para a cidade escolhida; `cidade` continua com o nome para exibir ("Florianópolis, SC")
-- e com o texto livre de quem torce fora do Brasil.
alter table public.perfis add column cidade_id bigint references public.cidades (id);
create index perfis_cidade_id on public.perfis (cidade_id);
grant update (cidade_id) on public.perfis to authenticated;
