-- Notícias (W09): não são escritas pela equipe. A Edge Function buscar-noticias lê as fontes (sites e feeds RSS) a
-- cada 15 min e registra cada item aqui; o banco define de qual clube a notícia fala e se ela vai direto para o app
-- ou para a fila de revisão (Recebidas) do back-office. O app mostra título, resumo, imagem e o botão para o site
-- original, nunca o texto inteiro. Ler rende XP (leitura_noticia); o torcedor curte e comenta, e silenciado/suspenso
-- não comenta (barrar_restrito).
--
-- Clube de cada notícia (sem IA por enquanto):
--   fonte de um clube só  → toda notícia é desse clube (classificacao 'fonte');
--   fonte de vários clubes → o banco procura o nome dos clubes com torcida no título e no resumo ('nome');
--                            sem nenhum nome, a notícia vai para a fila marcada para conferir ('conferir');
--   a equipe pode trocar os clubes à mão ('manual'). Lista vazia de clubes = vale para todas as torcidas.

-- ---------- equipe ----------
/** Barra quem não pode mexer em Notícias (super admin e editor). */
create function public.exigir_editor_de_noticias()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.papel_na_equipe(), '') not in ('super_admin', 'editor') then
    raise exception 'Só super admin e editor mexem em Notícias' using errcode = '42501', hint = 'sem_permissao';
  end if;
end;
$$;

revoke execute on function public.exigir_editor_de_noticias() from public, anon, authenticated;

-- ---------- fontes ----------
create table public.noticias_fontes (
  id uuid primary key default gen_random_uuid(),
  -- Endereço do feed (RSS ou Atom). Quem cadastra pode colar o site; a Edge Function acha o feed na verificação.
  url text not null unique check (url ~ '^https?://'),
  nome text not null check (char_length(btrim(nome)) between 2 and 80),
  site text,
  -- Fonte de um clube só; nulo = fonte de vários clubes (o banco identifica o clube de cada notícia).
  clube_id integer references public.clubes (id) on delete set null,
  modo text not null default 'revisar' check (modo in ('revisar', 'automatica')),
  ativa boolean not null default true,
  ultima_busca_em timestamptz,
  ultimo_erro text,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);

alter table public.noticias_fontes enable row level security;
revoke all on public.noticias_fontes from anon, authenticated;
grant select, insert, update, delete on public.noticias_fontes to service_role;

-- ---------- notícias ----------
create table public.noticias (
  id uuid primary key default gen_random_uuid(),
  fonte_id uuid references public.noticias_fontes (id) on delete set null,
  -- Guardado na notícia para continuar aparecendo se a fonte sair.
  fonte_nome text not null,
  link text not null check (link ~ '^https?://'),
  titulo text not null check (char_length(btrim(titulo)) between 3 and 200),
  resumo text not null default '' check (char_length(resumo) <= 300),
  imagem_url text check (imagem_url ~ '^https?://'),
  clubes integer[] not null default '{}',
  classificacao text not null check (classificacao in ('fonte', 'nome', 'conferir', 'manual')),
  estado text not null default 'recebida' check (estado in ('recebida', 'publicada', 'descartada')),
  -- Data de publicação no site de origem (do feed); recebida_em é quando a busca encontrou.
  publicada_na_fonte_em timestamptz,
  recebida_em timestamptz not null default now(),
  publicada_em timestamptz,
  publicada_por uuid references auth.users (id) on delete set null,
  leituras integer not null default 0,
  cliques integer not null default 0,
  curtidas integer not null default 0,
  comentarios integer not null default 0,
  constraint noticias_publicada_tem_data check (estado <> 'publicada' or publicada_em is not null)
);

create unique index noticias_link_unico on public.noticias (link);
create index noticias_publicadas on public.noticias (publicada_em desc) where estado = 'publicada';
create index noticias_recebidas on public.noticias (recebida_em desc) where estado = 'recebida';
create index noticias_por_clube on public.noticias using gin (clubes);

create table public.noticias_leituras (
  noticia_id uuid not null references public.noticias (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  lida_em timestamptz not null default now(),
  primary key (noticia_id, usuario_id)
);

create index noticias_leituras_recentes on public.noticias_leituras (lida_em);

create table public.noticias_cliques (
  noticia_id uuid not null references public.noticias (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  clicado_em timestamptz not null default now()
);

create index noticias_cliques_recentes on public.noticias_cliques (clicado_em);

create table public.noticias_curtidas (
  noticia_id uuid not null references public.noticias (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (noticia_id, usuario_id)
);

create index noticias_curtidas_recentes on public.noticias_curtidas (criado_em);

create table public.noticias_comentarios (
  id bigint generated always as identity primary key,
  noticia_id uuid not null references public.noticias (id) on delete cascade,
  autor_id uuid not null references public.perfis (id) on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 1 and 500),
  curtidas integer not null default 0,
  oculto boolean not null default false,
  criado_em timestamptz not null default now()
);

create index noticias_comentarios_da_noticia on public.noticias_comentarios (noticia_id, criado_em desc);
create index noticias_comentarios_do_autor on public.noticias_comentarios (autor_id, criado_em desc);

create table public.noticias_comentarios_curtidas (
  comentario_id bigint not null references public.noticias_comentarios (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  primary key (comentario_id, usuario_id)
);

alter table public.noticias enable row level security;
alter table public.noticias_leituras enable row level security;
alter table public.noticias_cliques enable row level security;
alter table public.noticias_curtidas enable row level security;
alter table public.noticias_comentarios enable row level security;
alter table public.noticias_comentarios_curtidas enable row level security;
revoke all on public.noticias, public.noticias_leituras, public.noticias_cliques, public.noticias_curtidas,
  public.noticias_comentarios, public.noticias_comentarios_curtidas from anon, authenticated;
grant select, insert, update, delete on public.noticias, public.noticias_leituras, public.noticias_cliques,
  public.noticias_curtidas, public.noticias_comentarios, public.noticias_comentarios_curtidas to service_role;

-- Silenciado não comenta; suspenso não curte nem comenta.
create trigger barrar_restrito
  before insert on public.noticias_comentarios
  for each row execute function public.barrar_restrito('silencio');

create trigger barrar_restrito
  before insert on public.noticias_curtidas
  for each row execute function public.barrar_restrito();

create trigger barrar_restrito
  before insert on public.noticias_comentarios_curtidas
  for each row execute function public.barrar_restrito();

-- Ler notícia rende XP: até 3 por dia, uma vez por notícia.
insert into public.xp_regras (acao, rotulo, xp, limite, limite_por, observacao, icone, ordem)
values ('leitura_noticia', 'Notícia lida', 10, 3, 'dia', null, 'newspaper', 12);

-- ---------- clube pelo nome ----------
/** Texto em minúsculas e sem acento, para casar nomes de clubes. */
create function public.sem_acento(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(lower(coalesce(p_texto, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
$$;

/**
 * Clubes com torcida citados no texto: o nome ou o nome curto (4 letras ou mais) como palavra inteira, sem acento.
 * Só os clubes que têm torcedores entram, porque notícia de clube sem torcida não aparece para ninguém.
 */
create function public.clubes_citados(p_texto text)
returns integer[]
language sql
stable
security definer
set search_path = ''
as $$
  with texto as (select public.sem_acento(p_texto) as t),
  candidatos as (
    select c.id, public.sem_acento(n.nome) as nome
    from public.clubes c
    cross join lateral (values (c.nome), (c.nome_curto)) n(nome)
    where c.id in (select p.time_id from public.perfis p where p.time_id is not null and p.onboarding_concluido_em is not null)
      and char_length(btrim(coalesce(n.nome, ''))) >= 4
  )
  select coalesce(array_agg(distinct ca.id order by ca.id), '{}')
  from candidatos ca, texto
  where texto.t ~ ('\m' || regexp_replace(ca.nome, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M');
$$;

revoke execute on function public.clubes_citados(text) from public, anon, authenticated;

-- ---------- busca (Edge Function, service_role) ----------
/**
 * Registra os itens lidos de uma fonte. Cada item: {titulo, link, resumo, imagem_url, publicado_em}. Link já
 * registrado é ignorado. Define os clubes e o estado (automática publica o que tem clube; o resto vai para a fila).
 * Devolve quantas notícias novas entraram.
 */
create function public.registrar_noticias_da_fonte(p_fonte uuid, p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fonte public.noticias_fontes;
  v_item jsonb;
  v_clubes integer[];
  v_classificacao text;
  v_publicar boolean;
  v_novas integer := 0;
  v_titulo text;
  v_resumo text;
begin
  select * into v_fonte from public.noticias_fontes f where f.id = p_fonte;
  if not found then
    raise exception 'Fonte não encontrada' using errcode = 'P0001', hint = 'fonte_inexistente';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_titulo := left(btrim(coalesce(v_item ->> 'titulo', '')), 200);
    v_resumo := left(btrim(coalesce(v_item ->> 'resumo', '')), 300);
    continue when char_length(v_titulo) < 3 or coalesce(v_item ->> 'link', '') !~ '^https?://';
    continue when exists (select 1 from public.noticias n where n.link = v_item ->> 'link');

    if v_fonte.clube_id is not null then
      v_clubes := array[v_fonte.clube_id];
      v_classificacao := 'fonte';
    else
      v_clubes := public.clubes_citados(v_titulo || ' ' || v_resumo);
      v_classificacao := case when cardinality(v_clubes) > 0 then 'nome' else 'conferir' end;
    end if;
    v_publicar := v_fonte.modo = 'automatica' and v_classificacao <> 'conferir';

    insert into public.noticias (fonte_id, fonte_nome, link, titulo, resumo, imagem_url, clubes, classificacao, estado,
      publicada_na_fonte_em, publicada_em)
    values (v_fonte.id, v_fonte.nome, v_item ->> 'link', v_titulo, v_resumo,
      case when coalesce(v_item ->> 'imagem_url', '') ~ '^https?://' then v_item ->> 'imagem_url' end,
      v_clubes, v_classificacao, case when v_publicar then 'publicada' else 'recebida' end,
      least((v_item ->> 'publicado_em')::timestamptz, now()),
      case when v_publicar then now() end)
    on conflict (link) do nothing;
    if found then
      v_novas := v_novas + 1;
    end if;
  end loop;

  update public.noticias_fontes set ultima_busca_em = now(), ultimo_erro = null where id = p_fonte;
  return v_novas;
end;
$$;

revoke execute on function public.registrar_noticias_da_fonte(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_noticias_da_fonte(uuid, jsonb) to service_role;

/** Marca a falha da última busca de uma fonte (o back-office mostra "falhou há 2 h"). */
create function public.registrar_erro_da_fonte(p_fonte uuid, p_erro text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.noticias_fontes set ultima_busca_em = now(), ultimo_erro = left(coalesce(p_erro, 'erro'), 300) where id = p_fonte;
$$;

revoke execute on function public.registrar_erro_da_fonte(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_erro_da_fonte(uuid, text) to service_role;

-- A cada 15 min, a Edge Function lê as fontes ativas. O segredo que ela confere (BUSCAR_NOTICIAS_SEGREDO) fica no
-- Vault com o nome 'buscar_noticias_segredo', criado fora das migrations.
create function public.chamar_buscar_noticias()
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
    body := jsonb_build_object('modo', 'todas'),
    timeout_milliseconds := 120000
  );
$$;

revoke execute on function public.chamar_buscar_noticias() from public, anon, authenticated;

select cron.schedule('buscar-noticias', '*/15 * * * *', $$select public.chamar_buscar_noticias()$$);

-- ---------- torcedor ----------
/** A notícia aparece para este torcedor? Publicada e do clube dele (ou de todas as torcidas). */
create function public.noticia_para_mim(p_noticia uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.noticias n
    where n.id = p_noticia and n.estado = 'publicada'
      and (n.clubes = '{}' or (select p.time_id from public.perfis p where p.id = (select auth.uid())) = any(n.clubes))
  );
$$;

revoke execute on function public.noticia_para_mim(uuid) from public, anon, authenticated;

/**
 * Notícias publicadas para o clube do torcedor logado (e as de todas as torcidas), da mais recente para a mais antiga.
 * p_antes pagina pela data de publicação.
 */
create function public.noticias_do_clube(p_limite integer default 20, p_antes timestamptz default null)
returns table (
  id uuid, titulo text, resumo text, imagem_url text, link text, fonte text, publicada_em timestamptz,
  leituras integer, curtidas integer, comentarios integer, curti boolean, li boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select p.id, p.time_id from public.perfis p where p.id = (select auth.uid()))
  select n.id, n.titulo, n.resumo, n.imagem_url, n.link, n.fonte_nome, n.publicada_em, n.leituras, n.curtidas, n.comentarios,
    exists (select 1 from public.noticias_curtidas c where c.noticia_id = n.id and c.usuario_id = eu.id),
    exists (select 1 from public.noticias_leituras l where l.noticia_id = n.id and l.usuario_id = eu.id)
  from public.noticias n, eu
  where n.estado = 'publicada'
    and (n.clubes = '{}' or eu.time_id = any(n.clubes))
    and (p_antes is null or n.publicada_em < p_antes)
  order by n.publicada_em desc
  limit least(greatest(coalesce(p_limite, 20), 1), 50);
$$;

revoke execute on function public.noticias_do_clube(integer, timestamptz) from public, anon;
grant execute on function public.noticias_do_clube(integer, timestamptz) to authenticated;

/** Uma notícia, se ela aparece para o torcedor logado (senão, nenhuma linha). */
create function public.noticia(p_id uuid)
returns table (
  id uuid, titulo text, resumo text, imagem_url text, link text, fonte text, publicada_em timestamptz,
  leituras integer, curtidas integer, comentarios integer, curti boolean, li boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.titulo, n.resumo, n.imagem_url, n.link, n.fonte_nome, n.publicada_em, n.leituras, n.curtidas, n.comentarios,
    exists (select 1 from public.noticias_curtidas c where c.noticia_id = n.id and c.usuario_id = (select auth.uid())),
    exists (select 1 from public.noticias_leituras l where l.noticia_id = n.id and l.usuario_id = (select auth.uid()))
  from public.noticias n
  where n.id = p_id and public.noticia_para_mim(p_id);
$$;

revoke execute on function public.noticia(uuid) from public, anon;
grant execute on function public.noticia(uuid) to authenticated;

/** Marca a notícia como lida (uma vez por torcedor) e credita o XP de leitura. Devolve o XP creditado. */
create function public.ler_noticia(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if not exists (select 1 from public.perfis p where p.id = v_usuario) or not public.noticia_para_mim(p_id) then
    raise exception 'Notícia não encontrada' using errcode = 'P0001', hint = 'noticia_inexistente';
  end if;
  insert into public.noticias_leituras (noticia_id, usuario_id) values (p_id, v_usuario) on conflict do nothing;
  if not found then
    return 0;
  end if;
  update public.noticias set leituras = leituras + 1 where id = p_id;
  return public.creditar_xp(v_usuario, 'leitura_noticia', p_id::text, null, (select n.titulo from public.noticias n where n.id = p_id));
end;
$$;

revoke execute on function public.ler_noticia(uuid) from public, anon;
grant execute on function public.ler_noticia(uuid) to authenticated;

/** Registra o clique em "Ler no site" e devolve o link de origem. */
create function public.abrir_original(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if not exists (select 1 from public.perfis p where p.id = v_usuario) or not public.noticia_para_mim(p_id) then
    raise exception 'Notícia não encontrada' using errcode = 'P0001', hint = 'noticia_inexistente';
  end if;
  insert into public.noticias_cliques (noticia_id, usuario_id) values (p_id, v_usuario);
  update public.noticias set cliques = cliques + 1 where id = p_id;
  return (select n.link from public.noticias n where n.id = p_id);
end;
$$;

revoke execute on function public.abrir_original(uuid) from public, anon;
grant execute on function public.abrir_original(uuid) to authenticated;

/** Liga ou desliga a curtida do torcedor logado. Devolve o estado novo e o total. */
create function public.curtir_noticia(p_id uuid)
returns table (curti boolean, curtidas integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if not exists (select 1 from public.perfis p where p.id = v_usuario) or not public.noticia_para_mim(p_id) then
    raise exception 'Notícia não encontrada' using errcode = 'P0001', hint = 'noticia_inexistente';
  end if;
  delete from public.noticias_curtidas c where c.noticia_id = p_id and c.usuario_id = v_usuario;
  if found then
    update public.noticias n set curtidas = greatest(n.curtidas - 1, 0) where n.id = p_id;
    return query select false, n.curtidas from public.noticias n where n.id = p_id;
  else
    insert into public.noticias_curtidas (noticia_id, usuario_id) values (p_id, v_usuario);
    update public.noticias n set curtidas = n.curtidas + 1 where n.id = p_id;
    return query select true, n.curtidas from public.noticias n where n.id = p_id;
  end if;
end;
$$;

revoke execute on function public.curtir_noticia(uuid) from public, anon;
grant execute on function public.curtir_noticia(uuid) to authenticated;

/**
 * Comentários de uma notícia. 'relevantes' ordena por curtidas e depois pelos mais novos; 'recentes', só pelos mais
 * novos. Oculto pela moderação só aparece para o próprio autor.
 */
create function public.comentarios_da_noticia(p_id uuid, p_ordem text default 'relevantes', p_limite integer default 50)
returns table (id bigint, autor_id uuid, apelido text, nivel integer, texto text, curtidas integer, curti boolean, meu boolean, oculto boolean, criado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.autor_id, p.apelido,
    (select n.nivel from public.nivel_do_xp((select coalesce(sum(l.xp), 0) from public.xp_lancamentos l where l.usuario_id = c.autor_id)) n),
    c.texto, c.curtidas,
    exists (select 1 from public.noticias_comentarios_curtidas cc where cc.comentario_id = c.id and cc.usuario_id = (select auth.uid())),
    c.autor_id = (select auth.uid()),
    c.oculto,
    c.criado_em
  from public.noticias_comentarios c
  join public.perfis p on p.id = c.autor_id
  where c.noticia_id = p_id and public.noticia_para_mim(p_id)
    and (not c.oculto or c.autor_id = (select auth.uid()))
  order by case when p_ordem = 'recentes' then 0 else c.curtidas end desc, c.criado_em desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;

revoke execute on function public.comentarios_da_noticia(uuid, text, integer) from public, anon;
grant execute on function public.comentarios_da_noticia(uuid, text, integer) to authenticated;

/** Publica um comentário. Erros (hint): noticia_inexistente, sem_perfil, devagar, silenciado, suspenso. */
create function public.comentar_noticia(p_id uuid, p_texto text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_id bigint;
begin
  if not exists (select 1 from public.perfis p where p.id = v_usuario and p.onboarding_concluido_em is not null and p.apelido is not null) then
    raise exception 'Sem perfil completo' using errcode = 'P0001', hint = 'sem_perfil';
  end if;
  if not public.noticia_para_mim(p_id) then
    raise exception 'Notícia não encontrada' using errcode = 'P0001', hint = 'noticia_inexistente';
  end if;
  if exists (select 1 from public.noticias_comentarios c where c.autor_id = v_usuario and c.criado_em > now() - interval '10 seconds') then
    raise exception 'Calma, um comentário de cada vez' using errcode = 'P0001', hint = 'devagar';
  end if;
  insert into public.noticias_comentarios (noticia_id, autor_id, texto) values (p_id, v_usuario, btrim(p_texto)) returning id into v_id;
  update public.noticias n set comentarios = n.comentarios + 1 where n.id = p_id;
  return v_id;
end;
$$;

revoke execute on function public.comentar_noticia(uuid, text) from public, anon;
grant execute on function public.comentar_noticia(uuid, text) to authenticated;

/** Apaga um comentário do próprio torcedor. */
create function public.apagar_comentario_da_noticia(p_comentario bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_noticia uuid;
  v_oculto boolean;
begin
  delete from public.noticias_comentarios c where c.id = p_comentario and c.autor_id = (select auth.uid())
  returning c.noticia_id, c.oculto into v_noticia, v_oculto;
  if v_noticia is not null and not v_oculto then
    update public.noticias n set comentarios = greatest(n.comentarios - 1, 0) where n.id = v_noticia;
  end if;
end;
$$;

revoke execute on function public.apagar_comentario_da_noticia(bigint) from public, anon;
grant execute on function public.apagar_comentario_da_noticia(bigint) to authenticated;

/** Liga ou desliga a curtida num comentário. Devolve o estado novo e o total. */
create function public.curtir_comentario_da_noticia(p_comentario bigint)
returns table (curti boolean, curtidas integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_noticia uuid := (select c.noticia_id from public.noticias_comentarios c where c.id = p_comentario and not c.oculto);
begin
  if v_noticia is null or not exists (select 1 from public.perfis p where p.id = v_usuario) or not public.noticia_para_mim(v_noticia) then
    raise exception 'Comentário não encontrado' using errcode = 'P0001', hint = 'comentario_inexistente';
  end if;
  delete from public.noticias_comentarios_curtidas cc where cc.comentario_id = p_comentario and cc.usuario_id = v_usuario;
  if found then
    update public.noticias_comentarios c set curtidas = greatest(c.curtidas - 1, 0) where c.id = p_comentario;
    return query select false, c.curtidas from public.noticias_comentarios c where c.id = p_comentario;
  else
    insert into public.noticias_comentarios_curtidas (comentario_id, usuario_id) values (p_comentario, v_usuario);
    update public.noticias_comentarios c set curtidas = c.curtidas + 1 where c.id = p_comentario;
    return query select true, c.curtidas from public.noticias_comentarios c where c.id = p_comentario;
  end if;
end;
$$;

revoke execute on function public.curtir_comentario_da_noticia(bigint) from public, anon;
grant execute on function public.curtir_comentario_da_noticia(bigint) to authenticated;

-- ---------- back-office ----------
/**
 * Notícias de um estado ('recebida' ou 'publicada'), filtradas por clube (as de todas as torcidas entram em qualquer
 * clube) e por data (recebida_em na fila, publicada_em nas publicadas). Traz os nomes dos clubes.
 */
create function public.admin_noticias(p_estado text default 'recebida', p_clube integer default null, p_desde timestamptz default null)
returns table (
  id uuid, titulo text, resumo text, link text, imagem_url text, fonte_id uuid, fonte text, clubes integer[],
  clubes_nomes text[], classificacao text, estado text, recebida_em timestamptz, publicada_na_fonte_em timestamptz,
  publicada_em timestamptz, publicada_por text, leituras integer, cliques integer, curtidas integer, comentarios integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  return query
    select n.id, n.titulo, n.resumo, n.link, n.imagem_url, n.fonte_id, n.fonte_nome, n.clubes,
      coalesce((select array_agg(c.nome order by array_position(n.clubes, c.id)) from public.clubes c where c.id = any(n.clubes)), '{}'),
      n.classificacao, n.estado, n.recebida_em, n.publicada_na_fonte_em, n.publicada_em,
      coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email)::text,
      n.leituras, n.cliques, n.curtidas, n.comentarios
    from public.noticias n
    left join auth.users u on u.id = n.publicada_por
    where n.estado = coalesce(p_estado, 'recebida')
      and (p_clube is null or n.clubes = '{}' or p_clube = any(n.clubes))
      and (p_desde is null or (case when n.estado = 'publicada' then n.publicada_em else n.recebida_em end) >= p_desde)
    order by case when n.estado = 'publicada' then n.publicada_em else n.recebida_em end desc
    limit 300;
end;
$$;

revoke execute on function public.admin_noticias(text, integer, timestamptz) from public, anon;
grant execute on function public.admin_noticias(text, integer, timestamptz) to authenticated;

/** Quantas recebidas (na fila) e publicadas no filtro, para as abas, e quantas fontes. */
create function public.admin_noticias_contagem(p_clube integer default null, p_desde timestamptz default null)
returns table (recebidas bigint, publicadas bigint, fontes bigint, fontes_ativas bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  return query
    select
      count(*) filter (where n.estado = 'recebida' and (p_desde is null or n.recebida_em >= p_desde)),
      count(*) filter (where n.estado = 'publicada' and (p_desde is null or n.publicada_em >= p_desde)),
      (select count(*) from public.noticias_fontes),
      (select count(*) from public.noticias_fontes f where f.ativa)
    from public.noticias n
    where p_clube is null or n.clubes = '{}' or p_clube = any(n.clubes);
end;
$$;

revoke execute on function public.admin_noticias_contagem(integer, timestamptz) from public, anon;
grant execute on function public.admin_noticias_contagem(integer, timestamptz) to authenticated;

/** Publica uma notícia da fila (ou republica uma despublicada). */
create function public.publicar_noticia(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  update public.noticias set estado = 'publicada', publicada_em = now(), publicada_por = (select auth.uid())
  where id = p_id and estado <> 'publicada';
  if not found then
    raise exception 'Notícia não encontrada ou já publicada' using errcode = 'P0001', hint = 'noticia_inexistente';
  end if;
end;
$$;

revoke execute on function public.publicar_noticia(uuid) from public, anon;
grant execute on function public.publicar_noticia(uuid) to authenticated;

/** Descarta da fila. Fica guardada (o link não volta para a fila na próxima busca). */
create function public.descartar_noticia(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  update public.noticias set estado = 'descartada', publicada_em = null where id = p_id;
end;
$$;

revoke execute on function public.descartar_noticia(uuid) from public, anon;
grant execute on function public.descartar_noticia(uuid) to authenticated;

/** Tira do ar: volta para a fila de Recebidas. Leituras, curtidas e comentários continuam guardados. */
create function public.despublicar_noticia(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  update public.noticias set estado = 'recebida', publicada_em = null where id = p_id and estado = 'publicada';
end;
$$;

revoke execute on function public.despublicar_noticia(uuid) from public, anon;
grant execute on function public.despublicar_noticia(uuid) to authenticated;

/**
 * Edita título, resumo e clubes (Trocar ou Editar). Lista vazia de clubes = todas as torcidas. Mexer nos clubes marca
 * a notícia como definida pela equipe.
 */
create function public.editar_noticia(p_id uuid, p_titulo text, p_resumo text, p_clubes integer[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  update public.noticias n set
    titulo = btrim(p_titulo),
    resumo = btrim(coalesce(p_resumo, '')),
    clubes = coalesce(p_clubes, '{}'),
    classificacao = case when coalesce(p_clubes, '{}') is distinct from n.clubes then 'manual' else n.classificacao end
  where n.id = p_id;
  if not found then
    raise exception 'Notícia não encontrada' using errcode = 'P0001', hint = 'noticia_inexistente';
  end if;
end;
$$;

revoke execute on function public.editar_noticia(uuid, text, text, integer[]) from public, anon;
grant execute on function public.editar_noticia(uuid, text, text, integer[]) to authenticated;

/** Fontes com o clube, quantas notícias entraram nos últimos 7 dias e a situação da última busca. */
create function public.admin_fontes()
returns table (
  id uuid, url text, nome text, site text, clube_id integer, clube text, modo text, ativa boolean,
  ultima_busca_em timestamptz, ultimo_erro text, noticias_7d bigint, criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  return query
    select f.id, f.url, f.nome, f.site, f.clube_id, c.nome, f.modo, f.ativa, f.ultima_busca_em, f.ultimo_erro,
      (select count(*) from public.noticias n where n.fonte_id = f.id and n.recebida_em >= now() - interval '7 days'),
      f.criado_em
    from public.noticias_fontes f
    left join public.clubes c on c.id = f.clube_id
    order by f.ativa desc, f.criado_em;
end;
$$;

revoke execute on function public.admin_fontes() from public, anon;
grant execute on function public.admin_fontes() to authenticated;

/** Cria (p_id nulo) ou altera uma fonte. Devolve o id. */
create function public.salvar_fonte(p_id uuid, p_url text, p_nome text, p_site text, p_clube integer, p_modo text, p_ativa boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.exigir_editor_de_noticias();
  if p_id is null then
    if exists (select 1 from public.noticias_fontes f where f.url = btrim(p_url)) then
      raise exception 'Essa fonte já está cadastrada' using errcode = 'P0001', hint = 'fonte_repetida';
    end if;
    insert into public.noticias_fontes (url, nome, site, clube_id, modo, ativa, criado_por)
    values (btrim(p_url), btrim(p_nome), nullif(btrim(p_site), ''), p_clube, p_modo, coalesce(p_ativa, true), (select auth.uid()))
    returning id into v_id;
  else
    update public.noticias_fontes set
      url = btrim(p_url), nome = btrim(p_nome), site = nullif(btrim(p_site), ''), clube_id = p_clube, modo = p_modo,
      ativa = coalesce(p_ativa, true)
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Fonte não encontrada' using errcode = 'P0001', hint = 'fonte_inexistente';
    end if;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.salvar_fonte(uuid, text, text, text, integer, text, boolean) from public, anon;
grant execute on function public.salvar_fonte(uuid, text, text, text, integer, text, boolean) to authenticated;

/** Liga ou desliga a busca de uma fonte. */
create function public.ligar_fonte(p_id uuid, p_ativa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  update public.noticias_fontes set ativa = p_ativa where id = p_id;
end;
$$;

revoke execute on function public.ligar_fonte(uuid, boolean) from public, anon;
grant execute on function public.ligar_fonte(uuid, boolean) to authenticated;

/** Apaga a fonte. As notícias que vieram dela continuam (com o nome da fonte guardado). */
create function public.excluir_fonte(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  delete from public.noticias_fontes where id = p_id;
end;
$$;

revoke execute on function public.excluir_fonte(uuid) from public, anon;
grant execute on function public.excluir_fonte(uuid) to authenticated;

/** Leituras, cliques no original e comentários dos últimos 7 dias contra os 7 anteriores. */
create function public.admin_desempenho_noticias()
returns table (leituras_7d bigint, leituras_anterior bigint, cliques_7d bigint, cliques_anterior bigint, comentarios_7d bigint, comentarios_anterior bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  return query
    select
      (select count(*) from public.noticias_leituras l where l.lida_em >= now() - interval '7 days'),
      (select count(*) from public.noticias_leituras l where l.lida_em >= now() - interval '14 days' and l.lida_em < now() - interval '7 days'),
      (select count(*) from public.noticias_cliques c where c.clicado_em >= now() - interval '7 days'),
      (select count(*) from public.noticias_cliques c where c.clicado_em >= now() - interval '14 days' and c.clicado_em < now() - interval '7 days'),
      (select count(*) from public.noticias_comentarios c where c.criado_em >= now() - interval '7 days'),
      (select count(*) from public.noticias_comentarios c where c.criado_em >= now() - interval '14 days' and c.criado_em < now() - interval '7 days');
end;
$$;

revoke execute on function public.admin_desempenho_noticias() from public, anon;
grant execute on function public.admin_desempenho_noticias() to authenticated;

/** Clubes que têm torcedores (filtro de clube, Trocar e fonte de um clube). */
create function public.admin_clubes_com_torcedores()
returns table (id integer, nome text, pais text, torcedores bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.papel_na_equipe() is null then
    raise exception 'Só a equipe' using errcode = '42501', hint = 'sem_permissao';
  end if;
  return query
    select c.id, c.nome, c.pais, count(*)
    from public.perfis p join public.clubes c on c.id = p.time_id
    where p.onboarding_concluido_em is not null
    group by c.id, c.nome, c.pais
    order by count(*) desc, c.nome;
end;
$$;

revoke execute on function public.admin_clubes_com_torcedores() from public, anon;
grant execute on function public.admin_clubes_com_torcedores() to authenticated;
