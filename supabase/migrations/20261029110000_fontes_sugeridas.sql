-- Fontes sugeridas: a Edge Function buscar-noticias (modo 'descobrir') procura no Google News as notícias de cada
-- clube com torcida, junta os sites de onde elas vieram e confere se cada site novo tem feed RSS. Os que têm viram
-- sugestão no back-office (Notícias › Fontes › Sugeridas); a equipe aceita (vira fonte) ou ignora. Nada é cadastrado
-- sozinho: a busca traz agregadores, sites de aposta e cópias, e quem decide é o editor.
--
-- Um domínio aparece uma vez só: pendente, aceito e ignorado não voltam. Site sem feed fica 'sem_feed' e é conferido
-- de novo depois de 30 dias (o site pode passar a ter feed).

create table public.noticias_fontes_sugeridas (
  id uuid primary key default gen_random_uuid(),
  -- Domínio sem "www.", a chave da descoberta (o mesmo site achado por clubes diferentes é uma sugestão só).
  dominio text not null unique check (dominio ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  estado text not null default 'pendente' check (estado in ('pendente', 'aceita', 'ignorada', 'sem_feed')),
  -- Feed achado na verificação; nulo quando o site não tem feed.
  url text check (url ~ '^https?://'),
  nome text not null check (char_length(btrim(nome)) between 2 and 80),
  site text,
  itens integer not null default 0,
  por_dia numeric,
  exemplos text[] not null default '{}',
  -- Clube sugerido quando quase todo o feed fala de um clube só (site dedicado); nulo = cobertura geral.
  clube_id integer references public.clubes (id) on delete set null,
  -- Clubes em cuja busca o site apareceu e quantas notícias dele vieram nessas buscas (ordem da lista).
  achada_para integer[] not null default '{}',
  aparicoes integer not null default 0,
  erro text,
  encontrada_em timestamptz not null default now(),
  verificada_em timestamptz not null default now(),
  decidida_em timestamptz,
  decidida_por uuid references auth.users (id) on delete set null,
  fonte_id uuid references public.noticias_fontes (id) on delete set null,
  check (estado = 'sem_feed' or url is not null)
);

create index noticias_fontes_sugeridas_pendentes on public.noticias_fontes_sugeridas (aparicoes desc) where estado = 'pendente';

alter table public.noticias_fontes_sugeridas enable row level security;
revoke all on public.noticias_fontes_sugeridas from anon, authenticated;
grant select, insert, update, delete on public.noticias_fontes_sugeridas to service_role;

-- ---------- descoberta (Edge Function, service_role) ----------
-- Quando cada descoberta começou: a equipe só pode pedir uma nova 10 min depois da anterior.
create table public.noticias_descobertas (
  id bigint generated always as identity primary key,
  do_cron boolean not null,
  iniciada_em timestamptz not null default now()
);

alter table public.noticias_descobertas enable row level security;
revoke all on public.noticias_descobertas from anon, authenticated;
grant select, insert on public.noticias_descobertas to service_role;

/** Registra o início de uma descoberta. Pedido da equipe até 10 min depois da última é recusado (devolve false). */
create function public.iniciar_descoberta(p_do_cron boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Trava para dois pedidos ao mesmo tempo não passarem juntos.
  perform pg_advisory_xact_lock(hashtext('iniciar_descoberta'));
  if not coalesce(p_do_cron, false)
    and exists (select 1 from public.noticias_descobertas d where d.iniciada_em >= now() - interval '10 minutes') then
    return false;
  end if;
  insert into public.noticias_descobertas (do_cron) values (coalesce(p_do_cron, false));
  return true;
end;
$$;

revoke execute on function public.iniciar_descoberta(boolean) from public, anon, authenticated;
grant execute on function public.iniciar_descoberta(boolean) to service_role;

/** Domínio de um endereço, em minúsculas e sem "www."; nulo se não for http(s). */
create function public.dominio_de(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(lower(substring(p_url from '^https?://([^/:?#]+)')), '^www\.', ''), '');
$$;

/**
 * O que a descoberta precisa saber antes de buscar: os clubes com torcida (mais torcedores primeiro, até p_limite) e
 * os domínios que não devem ser conferidos de novo (já são fonte, já foram sugeridos ou ficaram sem feed há pouco).
 */
create function public.contexto_da_descoberta(p_limite integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'clubes', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'pais', t.pais) order by t.torcedores desc, t.nome)
      from (
        select c.id, c.nome, c.pais, count(*) as torcedores
        from public.perfis p join public.clubes c on c.id = p.time_id
        where p.onboarding_concluido_em is not null
        group by c.id, c.nome, c.pais
        order by count(*) desc, c.nome
        limit greatest(coalesce(p_limite, 20), 1)
      ) t
    ), '[]'::jsonb),
    'conhecidos', coalesce((
      select jsonb_agg(distinct d.dominio)
      from (
        select public.dominio_de(f.url) as dominio from public.noticias_fontes f
        union select public.dominio_de(f.site) from public.noticias_fontes f
        union select s.dominio from public.noticias_fontes_sugeridas s
        where s.estado <> 'sem_feed' or s.verificada_em >= now() - interval '30 days'
      ) d
      where d.dominio is not null
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.contexto_da_descoberta(integer) from public, anon, authenticated;
grant execute on function public.contexto_da_descoberta(integer) to service_role;

/**
 * Registra o resultado da descoberta. Cada item: {dominio, achada_para[], aparicoes, ok, feed, nome, site, itens,
 * por_dia, exemplos[], textos[], erro}. O clube sugerido sai dos textos do feed (título e resumo): se 60% citam o mesmo
 * clube com torcida (e só ele), o site é dedicado a esse clube. Domínio já decidido não muda; o 'sem_feed' é
 * conferido de novo. Devolve quantas sugestões novas ficaram pendentes.
 */
create function public.registrar_fontes_sugeridas(p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_dominio text;
  v_ok boolean;
  v_clube integer;
  v_textos integer;
  v_novas integer := 0;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_dominio := lower(btrim(coalesce(v_item ->> 'dominio', '')));
    continue when v_dominio !~ '^[a-z0-9.-]+\.[a-z]{2,}$';
    -- Já é fonte (pelo feed ou pelo site): não sugere.
    continue when exists (
      select 1 from public.noticias_fontes f where v_dominio in (public.dominio_de(f.url), public.dominio_de(f.site))
    );
    -- Um item malformado não derruba o lote: só ele é pulado.
    begin
    v_ok := coalesce((v_item ->> 'ok')::boolean, false) and coalesce(v_item ->> 'feed', '') ~ '^https?://';
    -- O feed (depois dos redirecionamentos) já é de uma fonte cadastrada com outro domínio.
    continue when v_ok and exists (select 1 from public.noticias_fontes f where f.url = v_item ->> 'feed');

    v_clube := null;
    if v_ok then
      select count(*) into v_textos from jsonb_array_elements_text(coalesce(v_item -> 'textos', '[]'::jsonb));
      if v_textos >= 5 then
        select c.clube into v_clube
        from (
          select unnest(public.clubes_citados(t)) as clube, cardinality(public.clubes_citados(t)) as quantos
          from jsonb_array_elements_text(v_item -> 'textos') t
        ) c
        where c.quantos = 1
        group by c.clube
        having count(*) >= ceil(v_textos * 0.6)
        order by count(*) desc
        limit 1;
      end if;
    end if;

    insert into public.noticias_fontes_sugeridas as s (dominio, estado, url, nome, site, itens, por_dia, exemplos,
      clube_id, achada_para, aparicoes, erro)
    values (
      v_dominio,
      case when v_ok then 'pendente' else 'sem_feed' end,
      case when v_ok then v_item ->> 'feed' end,
      case when char_length(btrim(coalesce(v_item ->> 'nome', ''))) >= 2 then left(btrim(v_item ->> 'nome'), 80) else v_dominio end,
      nullif(btrim(coalesce(v_item ->> 'site', '')), ''),
      coalesce((v_item ->> 'itens')::integer, 0),
      (v_item ->> 'por_dia')::numeric,
      coalesce(array(select left(e, 200) from jsonb_array_elements_text(coalesce(v_item -> 'exemplos', '[]'::jsonb)) e limit 3), '{}'),
      v_clube,
      coalesce(array(select (x)::integer from jsonb_array_elements_text(coalesce(v_item -> 'achada_para', '[]'::jsonb)) x), '{}'),
      coalesce((v_item ->> 'aparicoes')::integer, 0),
      case when not v_ok then left(coalesce(v_item ->> 'erro', 'Sem feed RSS'), 300) end
    )
    on conflict (dominio) do update set
      estado = excluded.estado, url = excluded.url, nome = excluded.nome, site = excluded.site, itens = excluded.itens,
      por_dia = excluded.por_dia, exemplos = excluded.exemplos, clube_id = excluded.clube_id,
      achada_para = excluded.achada_para, aparicoes = excluded.aparicoes, erro = excluded.erro, verificada_em = now()
    where s.estado = 'sem_feed';

    if found and v_ok then
      v_novas := v_novas + 1;
    end if;
    exception when others then
      raise warning 'registrar_fontes_sugeridas: % ignorado (%)', v_dominio, sqlerrm;
    end;
  end loop;
  return v_novas;
end;
$$;

revoke execute on function public.registrar_fontes_sugeridas(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_fontes_sugeridas(jsonb) to service_role;

-- Toda segunda às 6h (horário de Brasília), a Edge Function procura fontes novas. Usa o mesmo segredo da busca.
create function public.chamar_descobrir_fontes()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://rtgsbxsscwumcfpcytzq.supabase.co/functions/v1/buscar-noticias',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'buscar_noticias_segredo')
    ),
    body := jsonb_build_object('modo', 'descobrir'),
    timeout_milliseconds := 150000
  );
$$;

revoke execute on function public.chamar_descobrir_fontes() from public, anon, authenticated;

select cron.schedule('descobrir-fontes', '0 9 * * 1', $$select public.chamar_descobrir_fontes()$$);

-- ---------- back-office ----------
/** Sugestões pendentes, das que mais apareceram nas buscas para as que menos apareceram. */
create function public.admin_fontes_sugeridas()
returns table (
  id uuid, dominio text, url text, nome text, site text, itens integer, por_dia numeric, exemplos text[],
  clube_id integer, clube text, achada_para text[], aparicoes integer, encontrada_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  return query
    select s.id, s.dominio, s.url, s.nome, s.site, s.itens, s.por_dia, s.exemplos, s.clube_id, c.nome,
      coalesce(array(select cl.nome from unnest(s.achada_para) with ordinality a(id, ordem) join public.clubes cl on cl.id = a.id order by a.ordem), '{}'),
      s.aparicoes, s.encontrada_em
    from public.noticias_fontes_sugeridas s
    left join public.clubes c on c.id = s.clube_id
    where s.estado = 'pendente'
    order by s.aparicoes desc, s.por_dia desc nulls last, s.encontrada_em;
end;
$$;

revoke execute on function public.admin_fontes_sugeridas() from public, anon;
grant execute on function public.admin_fontes_sugeridas() to authenticated;

/** Aceita a sugestão: cadastra a fonte (com o clube e o modo escolhidos) e devolve o id dela. */
create function public.aceitar_fonte_sugerida(p_id uuid, p_clube integer, p_modo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sugestao public.noticias_fontes_sugeridas;
  v_fonte uuid;
begin
  perform public.exigir_editor_de_noticias();
  select * into v_sugestao from public.noticias_fontes_sugeridas s where s.id = p_id and s.estado = 'pendente' for update;
  if not found then
    raise exception 'Sugestão não encontrada' using errcode = 'P0001', hint = 'sugestao_inexistente';
  end if;
  -- O mesmo feed pode ter sido cadastrado à mão depois da sugestão: liga a sugestão à fonte que já existe.
  select f.id into v_fonte from public.noticias_fontes f where f.url = v_sugestao.url;
  if v_fonte is null then
    v_fonte := public.salvar_fonte(null, v_sugestao.url, v_sugestao.nome, v_sugestao.site, p_clube, p_modo, true);
  end if;
  update public.noticias_fontes_sugeridas set
    estado = 'aceita', clube_id = p_clube, decidida_em = now(), decidida_por = (select auth.uid()), fonte_id = v_fonte
  where id = p_id;
  return v_fonte;
end;
$$;

revoke execute on function public.aceitar_fonte_sugerida(uuid, integer, text) from public, anon;
grant execute on function public.aceitar_fonte_sugerida(uuid, integer, text) to authenticated;

/** Ignora a sugestão: o domínio não volta nas próximas buscas. */
create function public.ignorar_fonte_sugerida(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  update public.noticias_fontes_sugeridas set estado = 'ignorada', decidida_em = now(), decidida_por = (select auth.uid())
  where id = p_id and estado = 'pendente';
end;
$$;

revoke execute on function public.ignorar_fonte_sugerida(uuid) from public, anon;
grant execute on function public.ignorar_fonte_sugerida(uuid) to authenticated;
