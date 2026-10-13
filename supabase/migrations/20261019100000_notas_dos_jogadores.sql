-- Pós-jogo e notas (W04): a torcida de cada clube dá notas de 1 a 10 aos jogadores do próprio time até 1 h depois do
-- apito final. A média da torcida sai na hora; o MVP (maior média) é revelado quando a janela fecha.

-- ---------- quando o jogo acabou ----------
-- A sincronização grava o status; o horário do apito vem daqui. Jogo que já chega encerrado (temporada, agenda)
-- fica com o fim estimado (início + 115 min), para não abrir notas de jogos antigos.
alter table public.partidas add column encerrada_em timestamptz;

update public.partidas set encerrada_em = inicio + interval '115 minutes' where status = 'encerrada';

create function public.partidas_marcar_fim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'encerrada' then
    new.encerrada_em := null;
  elsif tg_op = 'UPDATE' and old.status = 'encerrada' then
    new.encerrada_em := coalesce(old.encerrada_em, new.encerrada_em);
  elsif tg_op = 'UPDATE' then
    -- Acabou de terminar: o apito é agora.
    new.encerrada_em := now();
  else
    new.encerrada_em := least(now(), new.inicio + interval '115 minutes');
  end if;
  return new;
end;
$$;

create trigger partidas_marcar_fim
  before insert or update of status on public.partidas
  for each row execute function public.partidas_marcar_fim();

/** Janela das notas: do apito final até 1 h depois. */
create function public.notas_abertas(p_partida integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.partidas p
    where p.id = p_partida and p.status = 'encerrada' and now() < p.encerrada_em + interval '1 hour'
  )
$$;

revoke execute on function public.notas_abertas(integer) from public, anon;
grant execute on function public.notas_abertas(integer) to authenticated;

-- ---------- notas ----------
create table public.notas_jogadores (
  partida_id integer not null references public.partidas (id) on delete cascade,
  jogador_id integer not null,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  clube_id integer not null references public.clubes (id),
  nota smallint not null check (nota between 1 and 10),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (partida_id, jogador_id, usuario_id)
);

create index notas_jogadores_da_torcida on public.notas_jogadores (partida_id, clube_id);

alter table public.notas_jogadores enable row level security;

-- Leitura e escrita só pelas funções abaixo (a média é agregada; a nota de cada um não é pública).
revoke all on public.notas_jogadores from anon, authenticated;
grant select, insert, update, delete on public.notas_jogadores to service_role;

/** Ids dos jogadores do clube que entraram em campo (titulares e quem entrou), pela escalação salva da BSD. */
create function public.jogadores_que_jogaram(p_partida integer, p_mandante boolean)
returns setof integer
language sql
stable
security definer
set search_path = ''
as $$
  select (j ->> 'id')::integer
  from public.detalhes_partidas d,
    jsonb_array_elements(d.escalacoes -> (case when p_mandante then 'mandante' else 'visitante' end) -> 'titulares') j
  where d.partida_id = p_partida
  union
  select (l ->> 'entrou_id')::integer
  from public.detalhes_partidas d, jsonb_array_elements(d.lances) l
  where d.partida_id = p_partida and l ->> 'tipo' = 'substituicao' and (l ->> 'mandante')::boolean = p_mandante
    and l ->> 'entrou_id' is not null
$$;

revoke execute on function public.jogadores_que_jogaram(integer, boolean) from public, anon, authenticated;

/**
 * Grava (ou troca) as notas do torcedor: só membros, só para o próprio time, só com a janela aberta e só para quem
 * entrou em campo. p_notas: [{ "jogador": 3876, "nota": 8 }, ...]. Erros (hint): so_membros, outro_clube,
 * notas_fechadas, jogador_invalido, nota_invalida.
 */
create function public.enviar_notas(p_partida integer, p_notas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfis%rowtype;
  v_partida public.partidas%rowtype;
  v_mandante boolean;
  v_item jsonb;
  v_jogador integer;
  v_nota integer;
  v_total integer := 0;
begin
  select * into v_perfil from public.perfis where id = (select auth.uid());
  if not found or v_perfil.time_id is null then
    raise exception 'Sem perfil completo' using errcode = 'P0001', hint = 'sem_perfil';
  end if;
  if not public.sou_assinante() then
    raise exception 'Notas são para membros' using errcode = 'P0001', hint = 'so_membros';
  end if;
  select * into v_partida from public.partidas where id = p_partida;
  if not found or v_perfil.time_id not in (v_partida.mandante_id, v_partida.visitante_id) then
    raise exception 'As notas são da torcida dos times em campo' using errcode = 'P0001', hint = 'outro_clube';
  end if;
  if not public.notas_abertas(p_partida) then
    raise exception 'As notas deste jogo fecharam' using errcode = 'P0001', hint = 'notas_fechadas';
  end if;
  v_mandante := v_perfil.time_id = v_partida.mandante_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_notas, '[]'::jsonb)) loop
    v_jogador := (v_item ->> 'jogador')::integer;
    v_nota := (v_item ->> 'nota')::integer;
    if v_nota is null or v_nota < 1 or v_nota > 10 then
      raise exception 'Nota fora de 1 a 10' using errcode = 'P0001', hint = 'nota_invalida';
    end if;
    if v_jogador is null or v_jogador not in (select public.jogadores_que_jogaram(p_partida, v_mandante)) then
      raise exception 'Jogador não jogou por este time' using errcode = 'P0001', hint = 'jogador_invalido';
    end if;
    insert into public.notas_jogadores (partida_id, jogador_id, usuario_id, clube_id, nota)
    values (p_partida, v_jogador, v_perfil.id, v_perfil.time_id, v_nota)
    on conflict (partida_id, jogador_id, usuario_id)
      do update set nota = excluded.nota, atualizado_em = now();
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.enviar_notas(integer, jsonb) from public, anon;
grant execute on function public.enviar_notas(integer, jsonb) to authenticated;

/**
 * Média da torcida do meu clube no jogo, por jogador, com a minha nota e quantos torcedores votaram no jogo.
 * Só membros; vazio para quem torce para outro time.
 */
create function public.notas_da_torcida(p_partida integer)
returns table (jogador_id integer, media numeric, votos integer, minha smallint, votantes integer)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (
    select p.id, p.time_id from public.perfis p where p.id = (select auth.uid()) and public.sou_assinante()
  ),
  da_torcida as (
    select n.* from public.notas_jogadores n join eu on n.clube_id = eu.time_id where n.partida_id = p_partida
  )
  select
    t.jogador_id,
    round(avg(t.nota)::numeric, 1),
    count(*)::integer,
    max(t.nota) filter (where t.usuario_id = (select id from eu))::smallint,
    (select count(distinct usuario_id) from da_torcida)::integer
  from da_torcida t
  group by t.jogador_id
$$;

revoke execute on function public.notas_da_torcida(integer) from public, anon;
grant execute on function public.notas_da_torcida(integer) to authenticated;
