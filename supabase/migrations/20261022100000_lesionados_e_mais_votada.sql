-- Escalação e palpite, parte 2: lesionado não entra (nem na escalação, nem em quem marca) e a escalação mais votada
-- da torcida, revelada quando o palpite fecha.

/** Ids dos lesionados no elenco salvo do clube. */
create function public.ids_lesionados(p_clube integer)
returns setof integer
language sql
stable
security definer
set search_path = ''
as $$
  select (j ->> 'id')::integer from public.elencos e, jsonb_array_elements(e.jogadores) j
  where e.clube_id = p_clube and j ->> 'disponibilidade' = 'injured'
$$;

revoke execute on function public.ids_lesionados(integer) from public, anon, authenticated;

/**
 * Grava (ou troca) a escalação e o palpite do torcedor. Erros (hint): sem_perfil, so_membros, outro_clube,
 * palpite_fechado, palpite_nao_abriu, formacao_invalida, escalacao_invalida, jogador_lesionado, placar_invalido,
 * autor_invalido.
 */
create or replace function public.enviar_palpite(
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
  if exists (select 1 from unnest(v_ids) x where x in (select public.ids_lesionados(v_perfil.time_id))) then
    raise exception 'Jogador lesionado não pode ser escalado' using errcode = 'P0001', hint = 'jogador_lesionado';
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
      or (v_autor ->> 'jogador')::integer not in (select public.ids_do_elenco(v_clube_do_lado))
      or (v_autor ->> 'jogador')::integer in (select public.ids_lesionados(v_clube_do_lado)) then
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


/**
 * Escalação mais votada pela torcida do meu clube no jogo: a formação com mais palpites e, nela, vaga a vaga, o
 * jogador mais votado (sem repetir; quem tem mais votos escolhe primeiro). Só membros, só depois que o palpite
 * fecha e com pelo menos 3 palpites; antes disso, formacao vem null (votantes diz quantos votaram).
 */
create function public.escalacao_mais_votada(p_partida integer)
returns table (votantes integer, formacao text, jogadores jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clube integer;
  v_votantes integer;
  v_formacao text;
  v_voto record;
  v_vagas jsonb := '{}';
  v_usados integer[] := '{}';
begin
  select p.time_id into v_clube from public.perfis p where p.id = (select auth.uid());
  if v_clube is null or not public.sou_assinante() or public.situacao_do_palpite(p_partida, v_clube) is distinct from 'fechado' then
    return query select 0, null::text, '[]'::jsonb;
    return;
  end if;

  select count(*)::integer into v_votantes from public.palpites p where p.partida_id = p_partida and p.clube_id = v_clube;
  if v_votantes < 3 then
    return query select v_votantes, null::text, '[]'::jsonb;
    return;
  end if;

  select p.formacao into v_formacao from public.palpites p
  where p.partida_id = p_partida and p.clube_id = v_clube
  group by p.formacao order by count(*) desc, max(p.atualizado_em) desc limit 1;

  for v_voto in
    select e.key as vaga, (e.value #>> '{}')::integer as jogador, count(*)::integer as votos
    from public.palpites p, jsonb_each(p.escalacao) e
    where p.partida_id = p_partida and p.clube_id = v_clube and p.formacao = v_formacao
    group by 1, 2 order by 3 desc, 1, 2
  loop
    if not (v_vagas ? v_voto.vaga) and not (v_voto.jogador = any (v_usados)) then
      v_vagas := v_vagas || jsonb_build_object(v_voto.vaga, jsonb_build_object('id', v_voto.jogador, 'votos', v_voto.votos));
      v_usados := v_usados || v_voto.jogador;
    end if;
  end loop;

  return query
  select v_votantes, v_formacao, coalesce(jsonb_agg(jsonb_build_object(
      'vaga', v.key,
      'id', (v.value ->> 'id')::integer,
      'votos', (v.value ->> 'votos')::integer,
      'nome', coalesce(j ->> 'nome', ''),
      'numero', (j ->> 'numero')::integer
    ) order by v.key), '[]'::jsonb)
  from jsonb_each(v_vagas) v
  left join lateral (
    select x from public.elencos e, jsonb_array_elements(e.jogadores) x
    where e.clube_id = v_clube and (x ->> 'id')::integer = (v.value ->> 'id')::integer
    limit 1
  ) el(j) on true;
end;
$$;

revoke execute on function public.escalacao_mais_votada(integer) from public, anon;
grant execute on function public.escalacao_mais_votada(integer) to authenticated;
