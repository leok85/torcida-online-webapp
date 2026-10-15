-- Roteiro de teste da migration 20261027100000_usuarios_no_admin (banco local, tudo numa transação desfeita no fim):
-- supabase start && psql "$DB_URL" -q -o /dev/null -f supabase/tests/usuarios_no_admin.sql
-- Cada verificação imprime "ok ..."; a primeira que falhar interrompe com "FALHOU ...".
\set ON_ERROR_STOP on
begin;

create function pg_temp.igual(p_obtido anyelement, p_esperado anyelement, p_rotulo text) returns void language plpgsql as $$
begin
  if p_obtido is distinct from p_esperado then
    raise exception 'FALHOU %: obtido %, esperado %', p_rotulo, p_obtido, p_esperado;
  end if;
  raise notice 'ok  %', p_rotulo;
end $$;

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
end $$;

insert into public.ligas (id, nome, pais) values (1, 'Liga', 'BR') on conflict do nothing;
insert into public.clubes (id, nome, pais) values (10, 'Casa FC', 'BR'), (20, 'Fora FC', 'BR') on conflict do nothing;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'ana@teste.com', '{"provider":"email"}', '{"apelido":"ana_x","nome":"Ana Souza"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@teste.com', '{"provider":"email"}', '{"apelido":"bia_y"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'mod@torcidaonline.com.br', '{"provider":"google"}', '{"full_name":"Moderadora"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'edi@torcidaonline.com.br', '{"provider":"google"}', '{}', 'authenticated', 'authenticated');
update public.perfis set pais = 'BR', time_id = 10, termos_aceitos_em = now(), onboarding_concluido_em = now();
update public.perfis set criado_em = now() - interval '30 days' where id = '00000000-0000-0000-0000-00000000000a';
insert into public.equipe (usuario_id, papel) values
  ('00000000-0000-0000-0000-00000000000c', 'moderador'),
  ('00000000-0000-0000-0000-00000000000d', 'editor');
insert into auth.sessions (id, user_id, created_at, updated_at) values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', now(), now());
insert into public.partidas (id, liga_id, liga_nome, inicio, status, mandante_id, mandante_nome, visitante_id, visitante_nome)
values (900, 1, 'Liga', now() - interval '1 hour', 'ao_vivo', 10, 'Casa FC', 20, 'Fora FC');
select public.creditar_xp('00000000-0000-0000-0000-00000000000a', 'login_diario', 'd1');

-- permissão
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
do $$ begin
  perform public.admin_usuarios();
  raise exception 'editor listou';
exception when insufficient_privilege then raise notice 'ok  editor não vê usuários';
end $$;

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.igual((select total from public.admin_usuarios_resumo()), 2::bigint, 'duas contas (equipe fora)');
select pg_temp.igual((select novas_semana from public.admin_usuarios_resumo()), 1::bigint, 'uma nova na semana');
select pg_temp.igual((select ativas_7d from public.admin_usuarios_resumo()), 1::bigint, 'uma ativa (sessão)');
select pg_temp.igual((select count(*) from public.admin_usuarios()), 2::bigint, 'lista todos');
select pg_temp.igual((select max(total) from public.admin_usuarios()), 2::bigint, 'total na linha');
select pg_temp.igual((select apelido from public.admin_usuarios('todos', 'SOUZA')), 'ana_x', 'busca pelo nome');
select pg_temp.igual((select apelido from public.admin_usuarios('todos', 'bia@')), 'bia_y', 'busca pelo e-mail');
select pg_temp.igual((select apelido from public.admin_usuarios('novos')), 'bia_y', 'aba novos');
select pg_temp.igual((select xp from public.admin_usuarios('ativos')), 20::bigint, 'XP na lista');
select pg_temp.igual((select clube from public.admin_usuarios('ativos')), (select nome from public.clubes where id = 10), 'clube na lista');
select pg_temp.igual((select count(*) from public.admin_usuarios('todos', null, 1, 1)), 1::bigint, 'paginação');

-- silenciar
select public.silenciar_usuario('00000000-0000-0000-0000-00000000000a', 24, 'ofensa no chat');
select pg_temp.igual((select status from public.admin_usuarios('restritos')), 'silenciado', 'status silenciado');
select pg_temp.igual((select com_restricao from public.admin_usuarios_resumo()), 1::bigint, 'uma com restrição');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
do $$ begin
  insert into public.fotos_torcida (partida_id, clube_id, autor_id, autor_apelido, momento, caminho)
  values (900, 10, '00000000-0000-0000-0000-00000000000a', 'ana_x', 'durante', '900/10/a/x.jpg');
  raise exception 'silenciado mandou foto';
exception when raise_exception then
  if sqlerrm like 'Você está silenciado%' then raise notice 'ok  silenciado não manda foto'; else raise; end if;
end $$;
select pg_temp.igual((select tipo from public.minhas_restricoes()), 'silencio', 'torcedor vê o próprio silêncio');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select public.encerrar_restricao('00000000-0000-0000-0000-00000000000a', 'silencio');
select pg_temp.igual((select status from public.admin_usuarios('todos', 'ana')), 'ativo', 'silêncio removido');

-- suspender
select public.suspender_usuario('00000000-0000-0000-0000-00000000000b', 7, 'spam');
select pg_temp.igual((select banned_until > now() + interval '6 days' from auth.users where id = '00000000-0000-0000-0000-00000000000b'), true, 'login bloqueado');
select pg_temp.igual((select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-00000000000b'), 0::bigint, 'sessões derrubadas');
select pg_temp.igual((select status from public.admin_usuarios('todos', 'bia')), 'suspenso', 'status suspenso');
select pg_temp.igual((select (public.admin_usuario('00000000-0000-0000-0000-00000000000b') -> 'restricoes' -> 0 ->> 'aplicada_por')), 'Moderadora', 'quem aplicou');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin
  insert into public.feedbacks (tipo, area, texto) values ('elogio', 'inicio', 'Tentando mesmo suspensa');
  raise exception 'suspensa enviou feedback';
exception when raise_exception then
  if sqlerrm = 'Conta suspensa' then raise notice 'ok  suspensa não grava nada'; else raise; end if;
end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select public.encerrar_restricao('00000000-0000-0000-0000-00000000000b', 'suspensao');
select pg_temp.igual((select banned_until from auth.users where id = '00000000-0000-0000-0000-00000000000b'), null::timestamptz, 'login liberado');

-- perfil
select pg_temp.igual((public.admin_usuario('00000000-0000-0000-0000-00000000000a') ->> 'xp')::integer, 20, 'perfil com XP');
select pg_temp.igual(jsonb_array_length(public.admin_usuario('00000000-0000-0000-0000-00000000000a') -> 'extrato'), 1, 'perfil com extrato');
select pg_temp.igual((public.admin_usuario('00000000-0000-0000-0000-00000000000a') -> 'metricas' ->> 'palpites')::integer, 0, 'métricas');
do $$ begin
  perform public.silenciar_usuario('00000000-0000-0000-0000-00000000000a', 0);
  raise exception 'aceitou 0 h';
exception when raise_exception then
  if sqlerrm = 'Duração inválida' then raise notice 'ok  duração validada'; else raise; end if;
end $$;

rollback;
