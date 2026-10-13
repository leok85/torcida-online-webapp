-- Página do jogo (W02 · ao vivo e chat): estatísticas, lances e escalações da BSD guardados sob demanda, e o
-- chat da torcida de cada clube em cada jogo.

-- ---------- detalhes da partida (cache da BSD) ----------
-- A Edge Function detalhes-da-partida busca na BSD só quando alguém abre o jogo e o cache passou do prazo
-- (ao vivo, 90 s); jogo encerrado há mais de 3 h fica "final" e não é buscado de novo. Só a função lê e grava.
create table public.detalhes_partidas (
  partida_id integer primary key references public.partidas (id) on delete cascade,
  estatisticas jsonb,
  lances jsonb not null default '[]'::jsonb,
  escalacoes jsonb,
  final boolean not null default false,
  atualizado_em timestamptz not null default now()
);

alter table public.detalhes_partidas enable row level security;

revoke all on public.detalhes_partidas from anon, authenticated;
grant select, insert, update, delete on public.detalhes_partidas to service_role;

/**
 * Reserva a atualização do cache: devolve true para um único pedido por prazo, mesmo com muita gente abrindo o
 * jogo ao mesmo tempo. A linha nasce vazia na primeira reserva.
 */
create function public.reservar_detalhes(p_partida integer, p_segundos integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.detalhes_partidas (partida_id, atualizado_em) values (p_partida, now())
  on conflict (partida_id) do nothing;
  if found then
    return true;
  end if;
  update public.detalhes_partidas d set atualizado_em = now()
  where d.partida_id = p_partida and not d.final and d.atualizado_em < now() - make_interval(secs => p_segundos);
  return found;
end;
$$;

revoke execute on function public.reservar_detalhes(integer, integer) from public, anon, authenticated;
grant execute on function public.reservar_detalhes(integer, integer) to service_role;

-- ---------- chat da torcida ----------
-- Cada torcida tem o seu chat no jogo: quem torce para o mandante não lê o chat do visitante. Só membros leem e
-- escrevem. Apelido e foto ficam copiados na mensagem (o perfil dos outros não é legível pela RLS).
create table public.mensagens_chat (
  id bigint generated always as identity primary key,
  partida_id integer not null references public.partidas (id) on delete cascade,
  clube_id integer not null references public.clubes (id),
  autor_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  autor_apelido text not null,
  autor_foto text,
  texto text not null check (char_length(texto) between 1 and 280),
  criado_em timestamptz not null default now()
);

create index mensagens_chat_da_torcida on public.mensagens_chat (partida_id, clube_id, id);
create index mensagens_chat_do_autor on public.mensagens_chat (autor_id, criado_em desc);

alter table public.mensagens_chat enable row level security;

create policy "Membros leem o chat da própria torcida" on public.mensagens_chat
  for select to authenticated
  using (
    clube_id = (select p.time_id from public.perfis p where p.id = (select auth.uid()))
    and (select public.sou_assinante())
  );

create policy "Membros escrevem como eles mesmos" on public.mensagens_chat
  for insert to authenticated
  with check (autor_id = (select auth.uid()));

revoke all on public.mensagens_chat from anon, authenticated;
grant select on public.mensagens_chat to authenticated;
grant insert (partida_id, texto) on public.mensagens_chat to authenticated;
grant select, insert, update, delete on public.mensagens_chat to service_role;

/** Chat aberto do início do jogo até 2 h depois do apito final estimado (115 min após o início). */
create function public.chat_aberto(p_partida integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.partidas p
    where p.id = p_partida
      and (p.status = 'ao_vivo' or (p.status = 'encerrada' and now() < p.inicio + interval '115 minutes' + interval '2 hours'))
  )
$$;

revoke execute on function public.chat_aberto(integer) from public, anon;
grant execute on function public.chat_aberto(integer) to authenticated;

-- Quem escreve, a torcida e a foto vêm do servidor; o cliente só manda o jogo e o texto.
create function public.mensagens_chat_antes_de_inserir()
returns trigger
language plpgsql
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
    raise exception 'O chat é para membros' using errcode = 'P0001', hint = 'so_membros';
  end if;
  if not exists (
    select 1 from public.partidas p
    where p.id = new.partida_id and v_perfil.time_id in (p.mandante_id, p.visitante_id)
  ) then
    raise exception 'O chat é da torcida dos times em campo' using errcode = 'P0001', hint = 'outro_clube';
  end if;
  if not public.chat_aberto(new.partida_id) then
    raise exception 'O chat deste jogo está fechado' using errcode = 'P0001', hint = 'chat_fechado';
  end if;
  if exists (
    select 1 from public.mensagens_chat m
    where m.autor_id = v_perfil.id and m.criado_em > now() - interval '2 seconds'
  ) then
    raise exception 'Calma, uma mensagem de cada vez' using errcode = 'P0001', hint = 'devagar';
  end if;
  new.autor_id := v_perfil.id;
  new.clube_id := v_perfil.time_id;
  new.autor_apelido := v_perfil.apelido;
  new.autor_foto := v_perfil.foto;
  new.texto := btrim(new.texto);
  new.criado_em := now();
  return new;
end;
$$;

revoke execute on function public.mensagens_chat_antes_de_inserir() from public, anon, authenticated;

create trigger mensagens_chat_antes_de_inserir
  before insert on public.mensagens_chat
  for each row execute function public.mensagens_chat_antes_de_inserir();

-- Mensagens novas chegam pelo Realtime (a RLS de leitura vale para quem escuta).
alter publication supabase_realtime add table public.mensagens_chat;
