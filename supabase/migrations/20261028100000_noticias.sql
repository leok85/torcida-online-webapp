-- Notícias: a equipe escreve pelo back-office (torcida-online-admin, tela Notícias) e o torcedor lê no webapp (W09).
-- Uma notícia vale para um clube ou para todas as torcidas (clube_id nulo). Estado pelo publicar_em: nulo é rascunho,
-- no futuro é agendada e no passado é publicada (o agendamento não precisa de cron). Ler rende XP (leitura_noticia);
-- o torcedor curte a notícia e comenta, e silenciado/suspenso não comenta (barrar_restrito).

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

-- ---------- tabelas ----------
create table public.noticias (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(btrim(titulo)) between 8 and 120),
  resumo text not null default '' check (char_length(resumo) <= 240),
  -- Texto corrido; parágrafos separados por linha em branco.
  corpo text not null default '' check (char_length(corpo) <= 20000),
  categoria text not null check (categoria in ('Escalação', 'Mercado', 'Base', 'Jogo', 'Clube', 'Torcida', 'Estrutura')),
  clube_id integer references public.clubes (id) on delete cascade,
  -- Caminho no bucket público noticias ("<id da notícia>/<arquivo>").
  capa text,
  publicar_em timestamptz,
  autor_id uuid references auth.users (id) on delete set null,
  leituras integer not null default 0,
  curtidas integer not null default 0,
  comentarios integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index noticias_publicadas on public.noticias (clube_id, publicar_em desc) where publicar_em is not null;

create table public.noticias_leituras (
  noticia_id uuid not null references public.noticias (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  lida_em timestamptz not null default now(),
  primary key (noticia_id, usuario_id)
);

create index noticias_leituras_recentes on public.noticias_leituras (lida_em);

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
alter table public.noticias_curtidas enable row level security;
alter table public.noticias_comentarios enable row level security;
alter table public.noticias_comentarios_curtidas enable row level security;
revoke all on public.noticias, public.noticias_leituras, public.noticias_curtidas, public.noticias_comentarios,
  public.noticias_comentarios_curtidas from anon, authenticated;
grant select, insert, update, delete on public.noticias, public.noticias_leituras, public.noticias_curtidas,
  public.noticias_comentarios, public.noticias_comentarios_curtidas to service_role;

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

-- ---------- capas ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('noticias', 'noticias', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Editores enviam capas de notícias" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'noticias' and public.papel_na_equipe() in ('super_admin', 'editor'));

create policy "Editores trocam capas de notícias" on storage.objects
  for update to authenticated
  using (bucket_id = 'noticias' and public.papel_na_equipe() in ('super_admin', 'editor'));

create policy "Editores apagam capas de notícias" on storage.objects
  for delete to authenticated
  using (bucket_id = 'noticias' and public.papel_na_equipe() in ('super_admin', 'editor'));

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
    where n.id = p_noticia and n.publicar_em <= now()
      and (n.clube_id is null or n.clube_id = (select p.time_id from public.perfis p where p.id = (select auth.uid())))
  );
$$;

revoke execute on function public.noticia_para_mim(uuid) from public, anon, authenticated;

/**
 * Notícias publicadas para o clube do torcedor logado (e as de todas as torcidas), da mais recente para a mais antiga.
 * Filtra pela categoria quando informada; p_antes pagina pela data de publicação.
 */
create function public.noticias_do_clube(p_categoria text default null, p_limite integer default 20, p_antes timestamptz default null)
returns table (
  id uuid, titulo text, resumo text, categoria text, capa text, publicada_em timestamptz,
  leituras integer, curtidas integer, comentarios integer, curti boolean, li boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select p.id, p.time_id from public.perfis p where p.id = (select auth.uid()))
  select n.id, n.titulo, n.resumo, n.categoria, n.capa, n.publicar_em, n.leituras, n.curtidas, n.comentarios,
    exists (select 1 from public.noticias_curtidas c where c.noticia_id = n.id and c.usuario_id = eu.id),
    exists (select 1 from public.noticias_leituras l where l.noticia_id = n.id and l.usuario_id = eu.id)
  from public.noticias n, eu
  where n.publicar_em <= now()
    and (n.clube_id is null or n.clube_id = eu.time_id)
    and (p_categoria is null or n.categoria = p_categoria)
    and (p_antes is null or n.publicar_em < p_antes)
  order by n.publicar_em desc
  limit least(greatest(coalesce(p_limite, 20), 1), 50);
$$;

revoke execute on function public.noticias_do_clube(text, integer, timestamptz) from public, anon;
grant execute on function public.noticias_do_clube(text, integer, timestamptz) to authenticated;

/** Uma notícia completa, se ela aparece para o torcedor logado (senão, nenhuma linha). */
create function public.noticia(p_id uuid)
returns table (
  id uuid, titulo text, resumo text, corpo text, categoria text, capa text, publicada_em timestamptz, autor text,
  leituras integer, curtidas integer, comentarios integer, curti boolean, li boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.titulo, n.resumo, n.corpo, n.categoria, n.capa, n.publicar_em,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', 'Redação Torcida Online'),
    n.leituras, n.curtidas, n.comentarios,
    exists (select 1 from public.noticias_curtidas c where c.noticia_id = n.id and c.usuario_id = (select auth.uid())),
    exists (select 1 from public.noticias_leituras l where l.noticia_id = n.id and l.usuario_id = (select auth.uid()))
  from public.noticias n
  left join auth.users u on u.id = n.autor_id
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
/** Estado da notícia no back-office. */
create function public.estado_da_noticia(p_publicar_em timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_publicar_em is null then 'rascunho' when p_publicar_em > now() then 'agendada' else 'publicada' end;
$$;

/** Notícias de um estado ('publicada', 'agendada', 'rascunho'), com o clube e quem escreveu. */
create function public.admin_noticias(p_estado text default 'publicada')
returns table (
  id uuid, titulo text, resumo text, corpo text, categoria text, clube_id integer, clube text, capa text,
  publicar_em timestamptz, estado text, autor text, leituras integer, curtidas integer, comentarios integer,
  criado_em timestamptz, atualizado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  return query
    select n.id, n.titulo, n.resumo, n.corpo, n.categoria, n.clube_id, c.nome, n.capa, n.publicar_em,
      public.estado_da_noticia(n.publicar_em),
      coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email)::text,
      n.leituras, n.curtidas, n.comentarios, n.criado_em, n.atualizado_em
    from public.noticias n
    left join public.clubes c on c.id = n.clube_id
    left join auth.users u on u.id = n.autor_id
    where public.estado_da_noticia(n.publicar_em) = coalesce(p_estado, 'publicada')
    order by
      case when p_estado = 'agendada' then n.publicar_em end asc,
      case when p_estado = 'rascunho' then n.atualizado_em end desc,
      n.publicar_em desc nulls last;
end;
$$;

revoke execute on function public.admin_noticias(text) from public, anon;
grant execute on function public.admin_noticias(text) to authenticated;

/** Quantas notícias em cada estado (para as abas). */
create function public.admin_noticias_contagem()
returns table (publicadas bigint, agendadas bigint, rascunhos bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  return query
    select
      count(*) filter (where public.estado_da_noticia(n.publicar_em) = 'publicada'),
      count(*) filter (where public.estado_da_noticia(n.publicar_em) = 'agendada'),
      count(*) filter (where public.estado_da_noticia(n.publicar_em) = 'rascunho')
    from public.noticias n;
end;
$$;

revoke execute on function public.admin_noticias_contagem() from public, anon;
grant execute on function public.admin_noticias_contagem() to authenticated;

/**
 * Cria (p_id nulo) ou altera uma notícia. p_publicar_em nulo deixa como rascunho; no passado ou agora publica; no
 * futuro agenda. Devolve o id.
 */
create function public.salvar_noticia(
  p_id uuid,
  p_titulo text,
  p_resumo text,
  p_corpo text,
  p_categoria text,
  p_clube integer,
  p_capa text,
  p_publicar_em timestamptz
)
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
    insert into public.noticias (titulo, resumo, corpo, categoria, clube_id, capa, publicar_em, autor_id)
    values (btrim(p_titulo), btrim(coalesce(p_resumo, '')), btrim(coalesce(p_corpo, '')), p_categoria, p_clube,
      nullif(p_capa, ''), p_publicar_em, (select auth.uid()))
    returning id into v_id;
  else
    update public.noticias set
      titulo = btrim(p_titulo), resumo = btrim(coalesce(p_resumo, '')), corpo = btrim(coalesce(p_corpo, '')),
      categoria = p_categoria, clube_id = p_clube, capa = nullif(p_capa, ''), publicar_em = p_publicar_em,
      atualizado_em = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Notícia não encontrada' using errcode = 'P0001', hint = 'noticia_inexistente';
    end if;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.salvar_noticia(uuid, text, text, text, text, integer, text, timestamptz) from public, anon;
grant execute on function public.salvar_noticia(uuid, text, text, text, text, integer, text, timestamptz) to authenticated;

/** Tira do ar (volta a rascunho) ou publica/agenda sem mexer no texto. */
create function public.publicar_noticia(p_id uuid, p_publicar_em timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  update public.noticias set publicar_em = p_publicar_em, atualizado_em = now() where id = p_id;
  if not found then
    raise exception 'Notícia não encontrada' using errcode = 'P0001', hint = 'noticia_inexistente';
  end if;
end;
$$;

revoke execute on function public.publicar_noticia(uuid, timestamptz) from public, anon;
grant execute on function public.publicar_noticia(uuid, timestamptz) to authenticated;

/** Apaga a notícia com leituras, curtidas e comentários. A capa no storage é apagada pelo back-office. */
create function public.excluir_noticia(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_noticias();
  delete from public.noticias where id = p_id;
end;
$$;

revoke execute on function public.excluir_noticia(uuid) from public, anon;
grant execute on function public.excluir_noticia(uuid) to authenticated;

/** Leituras, curtidas e comentários dos últimos 7 dias contra os 7 anteriores. */
create function public.admin_desempenho_noticias()
returns table (leituras_7d bigint, leituras_anterior bigint, curtidas_7d bigint, curtidas_anterior bigint, comentarios_7d bigint, comentarios_anterior bigint)
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
      (select count(*) from public.noticias_curtidas c where c.criado_em >= now() - interval '7 days'),
      (select count(*) from public.noticias_curtidas c where c.criado_em >= now() - interval '14 days' and c.criado_em < now() - interval '7 days'),
      (select count(*) from public.noticias_comentarios c where c.criado_em >= now() - interval '7 days'),
      (select count(*) from public.noticias_comentarios c where c.criado_em >= now() - interval '14 days' and c.criado_em < now() - interval '7 days');
end;
$$;

revoke execute on function public.admin_desempenho_noticias() from public, anon;
grant execute on function public.admin_desempenho_noticias() to authenticated;

/** Clubes que têm torcedores, para escolher o destino da notícia. */
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
