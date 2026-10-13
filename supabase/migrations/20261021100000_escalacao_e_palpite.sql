-- Escalação ideal e palpite (W03): antes do jogo, cada membro monta a escalação do próprio time e palpita o placar
-- (e, se quiser, quem marca). Abre quando o jogo anterior do clube termina e fecha 15 min antes do início; depois
-- disso fica só para leitura.

-- ---------- elenco (cache da BSD) ----------
-- A Edge Function elenco-da-partida busca /api/v2/teams/{id}/squad/ e guarda aqui; vale por 12 h.
create table public.elencos (
  clube_id integer primary key references public.clubes (id) on delete cascade,
  -- [{ "id": 33, "nome": "V. Roque", "numero": 9, "posicao": "F", "disponibilidade": "available", "motivo": "", "volta": null }]
  jogadores jsonb not null default '[]',
  atualizado_em timestamptz not null default now()
);

alter table public.elencos enable row level security;

create policy "Elencos são públicos para quem entrou" on public.elencos for select to authenticated using (true);
grant select on public.elencos to authenticated;
grant select, insert, update, delete on public.elencos to service_role;

/** Um pedido à BSD por prazo, mesmo com muita gente abrindo a escalação ao mesmo tempo. */
create function public.reservar_elenco(p_clube integer, p_segundos integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.elencos (clube_id, atualizado_em) values (p_clube, now())
  on conflict (clube_id) do nothing;
  if found then
    return true;
  end if;
  update public.elencos e set atualizado_em = now()
  where e.clube_id = p_clube and e.atualizado_em < now() - make_interval(secs => p_segundos);
  return found;
end;
$$;

revoke execute on function public.reservar_elenco(integer, integer) from public, anon, authenticated;
grant execute on function public.reservar_elenco(integer, integer) to service_role;

-- ---------- janela do palpite ----------
/**
 * Situação do palpite do jogo para a torcida de p_clube: 'aberto', 'nao_abriu' (o jogo anterior do clube ainda não
 * terminou) ou 'fechado' (faltam 15 min ou menos, ou o jogo já começou). Um jogo marcado que passou 3 h do
 * horário sem virar ao vivo não segura o próximo.
 */
create function public.situacao_do_palpite(p_partida integer, p_clube integer)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.status <> 'agendada' or now() >= p.inicio - interval '15 minutes' then 'fechado'
    when exists (
      select 1 from public.partidas a
      where p_clube in (a.mandante_id, a.visitante_id) and a.id <> p.id and a.inicio < p.inicio
        and (a.status = 'ao_vivo' or (a.status = 'agendada' and a.inicio + interval '3 hours' > now()))
    ) then 'nao_abriu'
    else 'aberto'
  end
  from public.partidas p
  where p.id = p_partida
$$;

revoke execute on function public.situacao_do_palpite(integer, integer) from public, anon;
grant execute on function public.situacao_do_palpite(integer, integer) to authenticated;

-- ---------- palpites ----------
create table public.palpites (
  partida_id integer not null references public.partidas (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  clube_id integer not null references public.clubes (id),
  formacao text not null,
  -- { "gol0": 24, "l0p0": 3876, ... }: vaga da formação → jogador do elenco.
  escalacao jsonb not null,
  gols_mandante smallint not null check (gols_mandante between 0 and 9),
  gols_visitante smallint not null check (gols_visitante between 0 and 9),
  -- [{ "mandante": true, "jogador": 33 }, ...]: na ordem dos gols de cada lado.
  autores jsonb not null default '[]',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (partida_id, usuario_id)
);

create index palpites_da_torcida on public.palpites (partida_id, clube_id);

alter table public.palpites enable row level security;

-- Escrita só por enviar_palpite(); leitura pelo meu_palpite().
revoke all on public.palpites from anon, authenticated;
grant select, insert, update, delete on public.palpites to service_role;

/** Ids dos jogadores no elenco salvo do clube. */
create function public.ids_do_elenco(p_clube integer)
returns setof integer
language sql
stable
security definer
set search_path = ''
as $$
  select (j ->> 'id')::integer from public.elencos e, jsonb_array_elements(e.jogadores) j where e.clube_id = p_clube
$$;

revoke execute on function public.ids_do_elenco(integer) from public, anon, authenticated;

/**
 * Grava (ou troca) a escalação e o palpite do torcedor. Erros (hint): sem_perfil, so_membros, outro_clube,
 * palpite_fechado, palpite_nao_abriu, formacao_invalida, escalacao_invalida, placar_invalido, autor_invalido.
 */
create function public.enviar_palpite(
  p_partida integer,
  p_formacao text,
  p_escalacao jsonb,
  p_gols_mandante integer,
  p_gols_visitante integer,
  p_autores jsonb default '[]'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfis%rowtype;
  v_partida public.partidas%rowtype;
  v_situacao text;
  v_ids integer[];
  v_autor jsonb;
  v_lado boolean;
  v_clube_do_lado integer;
begin
  select * into v_perfil from public.perfis where id = (select auth.uid());
  if not found or v_perfil.time_id is null then
    raise exception 'Sem perfil completo' using errcode = 'P0001', hint = 'sem_perfil';
  end if;
  if not public.sou_assinante() then
    raise exception 'Escalação e palpite são para membros' using errcode = 'P0001', hint = 'so_membros';
  end if;
  select * into v_partida from public.partidas where id = p_partida;
  if not found or v_perfil.time_id not in (v_partida.mandante_id, v_partida.visitante_id) then
    raise exception 'O palpite é da torcida dos times em campo' using errcode = 'P0001', hint = 'outro_clube';
  end if;
  v_situacao := public.situacao_do_palpite(p_partida, v_perfil.time_id);
  if v_situacao = 'fechado' then
    raise exception 'O palpite deste jogo fechou' using errcode = 'P0001', hint = 'palpite_fechado';
  elsif v_situacao = 'nao_abriu' then
    raise exception 'O palpite abre quando o jogo anterior terminar' using errcode = 'P0001', hint = 'palpite_nao_abriu';
  end if;

  if p_formacao is null or p_formacao not in ('4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '3-4-3', '5-3-2', '4-1-4-1') then
    raise exception 'Formação inválida' using errcode = 'P0001', hint = 'formacao_invalida';
  end if;

  -- Escalação: 11 vagas (o goleiro em gol0), 11 jogadores diferentes, todos do elenco do clube.
  if jsonb_typeof(p_escalacao) is distinct from 'object' or not (p_escalacao ? 'gol0') then
    raise exception 'Escalação inválida' using errcode = 'P0001', hint = 'escalacao_invalida';
  end if;
  select array_agg(case when jsonb_typeof(v) = 'number' then (v #>> '{}')::integer end) into v_ids
  from jsonb_each(p_escalacao) as e(k, v);
  if coalesce(array_length(v_ids, 1), 0) <> 11
    or array_position(v_ids, null) is not null
    or (select count(distinct x) from unnest(v_ids) x) <> 11
    or exists (select 1 from unnest(v_ids) x where x not in (select public.ids_do_elenco(v_perfil.time_id))) then
    raise exception 'Escalação inválida' using errcode = 'P0001', hint = 'escalacao_invalida';
  end if;

  if p_gols_mandante is null or p_gols_visitante is null
    or p_gols_mandante not between 0 and 9 or p_gols_visitante not between 0 and 9 then
    raise exception 'Placar inválido' using errcode = 'P0001', hint = 'placar_invalido';
  end if;

  -- Quem marca (opcional): no máximo um autor por gol do palpite de cada lado, do elenco daquele lado.
  if jsonb_typeof(coalesce(p_autores, '[]'::jsonb)) <> 'array' then
    raise exception 'Autor inválido' using errcode = 'P0001', hint = 'autor_invalido';
  end if;
  for v_autor in select * from jsonb_array_elements(coalesce(p_autores, '[]'::jsonb)) loop
    v_lado := (v_autor ->> 'mandante')::boolean;
    v_clube_do_lado := case when v_lado then v_partida.mandante_id else v_partida.visitante_id end;
    if v_lado is null or (v_autor ->> 'jogador') is null
      or (v_autor ->> 'jogador')::integer not in (select public.ids_do_elenco(v_clube_do_lado)) then
      raise exception 'Autor inválido' using errcode = 'P0001', hint = 'autor_invalido';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(coalesce(p_autores, '[]'::jsonb)) a where (a ->> 'mandante')::boolean) > p_gols_mandante
    or (select count(*) from jsonb_array_elements(coalesce(p_autores, '[]'::jsonb)) a where not (a ->> 'mandante')::boolean) > p_gols_visitante then
    raise exception 'Autor inválido' using errcode = 'P0001', hint = 'autor_invalido';
  end if;

  insert into public.palpites (partida_id, usuario_id, clube_id, formacao, escalacao, gols_mandante, gols_visitante, autores)
  values (p_partida, v_perfil.id, v_perfil.time_id, p_formacao, p_escalacao, p_gols_mandante, p_gols_visitante, coalesce(p_autores, '[]'::jsonb))
  on conflict (partida_id, usuario_id) do update set
    formacao = excluded.formacao,
    escalacao = excluded.escalacao,
    gols_mandante = excluded.gols_mandante,
    gols_visitante = excluded.gols_visitante,
    autores = excluded.autores,
    atualizado_em = now();
end;
$$;

revoke execute on function public.enviar_palpite(integer, text, jsonb, integer, integer, jsonb) from public, anon;
grant execute on function public.enviar_palpite(integer, text, jsonb, integer, integer, jsonb) to authenticated;

/** O meu palpite do jogo (ou nenhum). */
create function public.meu_palpite(p_partida integer)
returns table (formacao text, escalacao jsonb, gols_mandante smallint, gols_visitante smallint, autores jsonb, atualizado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.formacao, p.escalacao, p.gols_mandante, p.gols_visitante, p.autores, p.atualizado_em
  from public.palpites p
  where p.partida_id = p_partida and p.usuario_id = (select auth.uid())
$$;

revoke execute on function public.meu_palpite(integer) from public, anon;
grant execute on function public.meu_palpite(integer) to authenticated;
