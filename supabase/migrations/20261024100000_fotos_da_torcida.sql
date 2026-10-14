-- Fotos da torcida (W07): cada membro envia até 3 fotos por jogo, uma por janela (pré-jogo: 1 h antes do início;
-- durante: com a bola rolando; pós-jogo: até 1 h depois do apito). A torcida do clube vê as fotos dos seus, dá até
-- 20 joinhas por jogo e denuncia; com 3 denúncias a foto sai da galeria. A mais curtida é a foto campeã.

-- ---------- janela ----------
/** Janela de envio aberta agora: 'pre', 'durante', 'pos' ou null (antes de abrir ou depois de fechar). */
create function public.janela_da_foto(p_partida integer)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.status = 'ao_vivo' then 'durante'
    when p.status = 'agendada' and now() >= p.inicio then 'durante'
    when p.status = 'agendada' and now() >= p.inicio - interval '1 hour' then 'pre'
    when p.status = 'encerrada' and now() < coalesce(p.encerrada_em, p.inicio + interval '115 minutes') + interval '1 hour' then 'pos'
  end
  from public.partidas p
  where p.id = p_partida
$$;

revoke execute on function public.janela_da_foto(integer) from public, anon;
grant execute on function public.janela_da_foto(integer) to authenticated;

/** Joinhas valem até a última janela fechar (1 h depois do apito). */
create function public.joinhas_abertos(p_partida integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.partidas p
    where p.id = p_partida
      and (p.status <> 'encerrada' or now() < coalesce(p.encerrada_em, p.inicio + interval '115 minutes') + interval '1 hour')
  )
$$;

revoke execute on function public.joinhas_abertos(integer) from public, anon;
grant execute on function public.joinhas_abertos(integer) to authenticated;

-- ---------- tabelas ----------
create table public.fotos_torcida (
  id uuid primary key default gen_random_uuid(),
  partida_id integer not null references public.partidas (id) on delete cascade,
  clube_id integer not null references public.clubes (id),
  autor_id uuid not null references public.perfis (id) on delete cascade,
  autor_apelido text not null,
  momento text not null check (momento in ('pre', 'durante', 'pos')),
  -- Caminho no bucket fotos-torcida: "<partida>/<clube>/<autor>/<arquivo>".
  caminho text not null unique,
  legenda text not null default '' check (char_length(legenda) <= 80),
  curtidas integer not null default 0,
  denuncias integer not null default 0,
  oculta boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (partida_id, autor_id, momento)
);

create index fotos_torcida_da_galeria on public.fotos_torcida (partida_id, clube_id);

create table public.fotos_joinhas (
  foto_id uuid not null references public.fotos_torcida (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  partida_id integer not null,
  criado_em timestamptz not null default now(),
  primary key (foto_id, usuario_id)
);

create index fotos_joinhas_do_torcedor on public.fotos_joinhas (usuario_id, partida_id);

create table public.fotos_denuncias (
  foto_id uuid not null references public.fotos_torcida (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (foto_id, usuario_id)
);

alter table public.fotos_torcida enable row level security;
alter table public.fotos_joinhas enable row level security;
alter table public.fotos_denuncias enable row level security;

-- Leitura e escrita só pelas funções abaixo.
revoke all on public.fotos_torcida, public.fotos_joinhas, public.fotos_denuncias from anon, authenticated;
grant select, insert, update, delete on public.fotos_torcida, public.fotos_joinhas, public.fotos_denuncias to service_role;

-- ---------- bucket ----------
-- Privado: a torcida vê as fotos dos seus por URL assinada; cada um grava e apaga só na própria pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-torcida', 'fotos-torcida', false, 3145728, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Membros veem as fotos da própria torcida" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fotos-torcida'
    and (storage.foldername(name))[2] = (select p.time_id::text from public.perfis p where p.id = (select auth.uid()))
    and (select public.sou_assinante())
  );

create policy "Membros enviam fotos na própria pasta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos-torcida'
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and (storage.foldername(name))[2] = (select p.time_id::text from public.perfis p where p.id = (select auth.uid()))
    and (select public.sou_assinante())
  );

create policy "Torcedor apaga as próprias fotos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos-torcida' and (storage.foldername(name))[3] = (select auth.uid())::text);

-- ---------- funções ----------
/** Confere o torcedor para as funções de fotos: membro, com perfil, torcendo por um dos times do jogo. */
create function public.torcedor_das_fotos(p_partida integer)
returns public.perfis
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfis%rowtype;
begin
  select * into v_perfil from public.perfis where id = (select auth.uid());
  if not found or v_perfil.apelido is null or v_perfil.time_id is null then
    raise exception 'Sem perfil completo' using errcode = 'P0001', hint = 'sem_perfil';
  end if;
  if not public.sou_assinante() then
    raise exception 'Fotos são para membros' using errcode = 'P0001', hint = 'so_membros';
  end if;
  if not exists (select 1 from public.partidas p where p.id = p_partida and v_perfil.time_id in (p.mandante_id, p.visitante_id)) then
    raise exception 'As fotos são da torcida dos times em campo' using errcode = 'P0001', hint = 'outro_clube';
  end if;
  return v_perfil;
end;
$$;

revoke execute on function public.torcedor_das_fotos(integer) from public, anon, authenticated;

/**
 * Registra a foto já enviada ao bucket, na janela aberta agora. Erros (hint): sem_perfil, so_membros, outro_clube,
 * fora_da_janela, ja_enviou, caminho_invalido, legenda_longa.
 */
create function public.registrar_foto(p_partida integer, p_caminho text, p_legenda text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfis%rowtype;
  v_janela text;
  v_id uuid;
begin
  v_perfil := public.torcedor_das_fotos(p_partida);
  v_janela := public.janela_da_foto(p_partida);
  if v_janela is null then
    raise exception 'O envio de fotos deste jogo está fechado' using errcode = 'P0001', hint = 'fora_da_janela';
  end if;
  if p_caminho is null or p_caminho not like p_partida || '/' || v_perfil.time_id || '/' || v_perfil.id || '/%' then
    raise exception 'Caminho inválido' using errcode = 'P0001', hint = 'caminho_invalido';
  end if;
  if char_length(btrim(coalesce(p_legenda, ''))) > 80 then
    raise exception 'Legenda longa' using errcode = 'P0001', hint = 'legenda_longa';
  end if;
  if exists (select 1 from public.fotos_torcida f where f.partida_id = p_partida and f.autor_id = v_perfil.id and f.momento = v_janela) then
    raise exception 'Você já enviou a foto desta janela' using errcode = 'P0001', hint = 'ja_enviou';
  end if;
  insert into public.fotos_torcida (partida_id, clube_id, autor_id, autor_apelido, momento, caminho, legenda)
  values (p_partida, v_perfil.time_id, v_perfil.id, v_perfil.apelido, v_janela, p_caminho, btrim(coalesce(p_legenda, '')))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.registrar_foto(integer, text, text) from public, anon;
grant execute on function public.registrar_foto(integer, text, text) to authenticated;

/**
 * A galeria do jogo para a minha torcida: fotos não ocultas (e as minhas, mesmo ocultas), menos as que eu denunciei,
 * da mais curtida para a menos, com o meu joinha. Só membros; vazia para quem torce para outro time.
 */
create function public.fotos_do_jogo(p_partida integer)
returns table (
  id uuid,
  autor_apelido text,
  momento text,
  caminho text,
  legenda text,
  curtidas integer,
  eu_curti boolean,
  minha boolean,
  criado_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (
    select p.id, p.time_id from public.perfis p where p.id = (select auth.uid()) and public.sou_assinante()
  )
  select f.id, f.autor_apelido, f.momento, f.caminho, f.legenda, f.curtidas,
    exists (select 1 from public.fotos_joinhas j where j.foto_id = f.id and j.usuario_id = eu.id),
    f.autor_id = eu.id,
    f.criado_em
  from public.fotos_torcida f
  join eu on f.clube_id = eu.time_id
  where f.partida_id = p_partida
    and (not f.oculta or f.autor_id = eu.id)
    and not exists (select 1 from public.fotos_denuncias d where d.foto_id = f.id and d.usuario_id = eu.id)
  order by f.curtidas desc, f.criado_em
$$;

revoke execute on function public.fotos_do_jogo(integer) from public, anon;
grant execute on function public.fotos_do_jogo(integer) to authenticated;

/**
 * Dá ou tira o joinha (até 20 por jogo, nunca na própria foto, até a última janela fechar). Devolve se ficou curtida.
 * Erros (hint): so_membros, outro_clube, foto_invalida, propria_foto, joinhas_fechados, limite_de_joinhas.
 */
create function public.curtir_foto(p_foto uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foto public.fotos_torcida%rowtype;
  v_perfil public.perfis%rowtype;
begin
  select * into v_foto from public.fotos_torcida where id = p_foto;
  if not found then
    raise exception 'Foto não encontrada' using errcode = 'P0001', hint = 'foto_invalida';
  end if;
  v_perfil := public.torcedor_das_fotos(v_foto.partida_id);
  if v_foto.clube_id <> v_perfil.time_id or v_foto.oculta then
    raise exception 'Foto não encontrada' using errcode = 'P0001', hint = 'foto_invalida';
  end if;
  if v_foto.autor_id = v_perfil.id then
    raise exception 'Não vale joinha na própria foto' using errcode = 'P0001', hint = 'propria_foto';
  end if;
  if not public.joinhas_abertos(v_foto.partida_id) then
    raise exception 'Os joinhas deste jogo fecharam' using errcode = 'P0001', hint = 'joinhas_fechados';
  end if;

  delete from public.fotos_joinhas where foto_id = p_foto and usuario_id = v_perfil.id;
  if found then
    update public.fotos_torcida set curtidas = greatest(0, curtidas - 1) where id = p_foto;
    return false;
  end if;
  if (select count(*) from public.fotos_joinhas j where j.usuario_id = v_perfil.id and j.partida_id = v_foto.partida_id) >= 20 then
    raise exception 'Você já deu os 20 joinhas deste jogo' using errcode = 'P0001', hint = 'limite_de_joinhas';
  end if;
  insert into public.fotos_joinhas (foto_id, usuario_id, partida_id) values (p_foto, v_perfil.id, v_foto.partida_id);
  update public.fotos_torcida set curtidas = curtidas + 1 where id = p_foto;
  return true;
end;
$$;

revoke execute on function public.curtir_foto(uuid) from public, anon;
grant execute on function public.curtir_foto(uuid) to authenticated;

/**
 * Denuncia a foto: some para quem denunciou e, com 3 denúncias, sai da galeria. Erros (hint): so_membros,
 * outro_clube, foto_invalida, propria_foto.
 */
create function public.denunciar_foto(p_foto uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foto public.fotos_torcida%rowtype;
  v_perfil public.perfis%rowtype;
begin
  select * into v_foto from public.fotos_torcida where id = p_foto;
  if not found then
    raise exception 'Foto não encontrada' using errcode = 'P0001', hint = 'foto_invalida';
  end if;
  v_perfil := public.torcedor_das_fotos(v_foto.partida_id);
  if v_foto.clube_id <> v_perfil.time_id then
    raise exception 'Foto não encontrada' using errcode = 'P0001', hint = 'foto_invalida';
  end if;
  if v_foto.autor_id = v_perfil.id then
    raise exception 'Não dá para denunciar a própria foto' using errcode = 'P0001', hint = 'propria_foto';
  end if;
  insert into public.fotos_denuncias (foto_id, usuario_id) values (p_foto, v_perfil.id) on conflict do nothing;
  if found then
    update public.fotos_torcida set denuncias = denuncias + 1, oculta = oculta or denuncias + 1 >= 3 where id = p_foto;
  end if;
end;
$$;

revoke execute on function public.denunciar_foto(uuid) from public, anon;
grant execute on function public.denunciar_foto(uuid) to authenticated;
