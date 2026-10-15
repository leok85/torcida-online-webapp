-- Roteiro de teste da migration 20261029100000_painel (banco local, tudo numa transação desfeita no fim):
-- supabase start && psql "$DB_URL" -q -o /dev/null -f supabase/tests/painel.sql
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

create function pg_temp.dia(p_dias integer) returns text language sql as $$
  select to_char((now() at time zone 'America/Sao_Paulo')::date - p_dias, 'YYYY-MM-DD');
$$;

insert into public.clubes (id, nome, nome_curto, pais) values
  (990010, 'Grêmio Esportivo Casa', 'Grêmio Casa', 'BR'),
  (990020, 'Fora Futebol Clube', 'Fora FC', 'BR'),
  (990030, 'Sem Torcida EC', null, 'BR'),
  (990040, 'Outro Sem Torcida', null, 'BR');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'ana@teste.com', '{"provider":"email"}', '{"apelido":"ana_x"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@teste.com', '{"provider":"email"}', '{"apelido":"bia_y"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000e', 'caio@teste.com', '{"provider":"email"}', '{"apelido":"caio_z"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'edi@torcidaonline.com.br', '{"provider":"google"}', '{"full_name":"Editora"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'mod@torcidaonline.com.br', '{"provider":"google"}', '{"full_name":"Moderadora"}', 'authenticated', 'authenticated');
update public.perfis set apelido = 'ana_x', pais = 'BR', time_id = 990010, termos_aceitos_em = now(), onboarding_concluido_em = now() where id = '00000000-0000-0000-0000-00000000000a';
update public.perfis set apelido = 'bia_y', pais = 'BR', time_id = 990020, termos_aceitos_em = now(), onboarding_concluido_em = now() where id = '00000000-0000-0000-0000-00000000000b';
-- caio: cadastrado há 10 dias (semana anterior).
update public.perfis set apelido = 'caio_z', pais = 'BR', time_id = 990010, termos_aceitos_em = now(), onboarding_concluido_em = now(),
  criado_em = now() - interval '10 days' where id = '00000000-0000-0000-0000-00000000000e';
insert into public.equipe (usuario_id, papel) values
  ('00000000-0000-0000-0000-00000000000c', 'editor'),
  ('00000000-0000-0000-0000-00000000000d', 'moderador');

-- ---------- permissão ----------
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
do $$ begin
  perform public.admin_painel();
  raise exception 'FALHOU torcedor leu o painel';
exception when insufficient_privilege then raise notice 'ok  torcedor não lê o painel';
end $$;
do $$ begin
  perform public.assinantes_pagantes();
  raise exception 'FALHOU torcedor contou assinantes';
exception when insufficient_privilege then raise notice 'ok  assinantes_pagantes só para a service_role';
end $$;
reset role;

-- ---------- dados ----------
-- Login diário: hoje ana e bia; há 7 dias só ana; há 3 dias ana, bia e caio.
insert into public.xp_lancamentos (usuario_id, acao, referencia, xp, xp_base, criado_em) values
  ('00000000-0000-0000-0000-00000000000a', 'login_diario', pg_temp.dia(0), 20, 20, now()),
  ('00000000-0000-0000-0000-00000000000b', 'login_diario', pg_temp.dia(0), 20, 20, now()),
  ('00000000-0000-0000-0000-00000000000a', 'login_diario', pg_temp.dia(7), 20, 20, now() - interval '7 days'),
  ('00000000-0000-0000-0000-00000000000a', 'login_diario', pg_temp.dia(3), 20, 20, now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000000b', 'login_diario', pg_temp.dia(3), 20, 20, now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000000e', 'login_diario', pg_temp.dia(3), 20, 20, now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000000a', 'palpite_enviado', 'p1', 50, 50, now()),
  ('00000000-0000-0000-0000-00000000000a', 'notas', 'p1', 50, 50, now()),
  ('00000000-0000-0000-0000-00000000000b', 'foto_enviada', 'f1', 40, 40, now()),
  ('00000000-0000-0000-0000-00000000000b', 'convite_aceito', 'c1', 100, 100, now()),
  ('00000000-0000-0000-0000-00000000000e', 'palpite_exato', 'p0', 240, 240, now() - interval '10 days');

-- Partidas: ao vivo (clube com torcida), agendada daqui a 2 h, encerrada há 30 min, uma sem torcida e uma de 3 dias atrás.
insert into public.partidas (id, liga_nome, inicio, status, mandante_id, mandante_nome, visitante_id, visitante_nome, gols_mandante, gols_visitante) values
  (99001, 'Liga Teste', now() - interval '50 minutes', 'ao_vivo', 990010, 'Grêmio Casa', 990030, 'Sem Torcida', 1, 0),
  (99002, 'Copa Teste', now() + interval '2 hours', 'agendada', 990040, 'Outro', 990020, 'Fora FC', null, null),
  (99004, 'Liga Teste', now() + interval '1 hour', 'agendada', 990030, 'Sem Torcida', 990040, 'Outro', null, null),
  (99005, 'Liga Teste', now() - interval '3 days', 'encerrada', 990020, 'Fora FC', 990010, 'Grêmio Casa', 2, 2);
-- A encerrada de hoje entra já como encerrada para o gatilho preencher encerrada_em.
insert into public.partidas (id, liga_nome, inicio, status, mandante_id, mandante_nome, visitante_id, visitante_nome, gols_mandante, gols_visitante)
values (99003, 'Liga Teste', now() - interval '3 hours', 'agendada', 990020, 'Fora FC', 990030, 'Sem Torcida', null, null);
update public.partidas set status = 'encerrada', gols_mandante = 2, gols_visitante = 2, encerrada_em = now() - interval '30 minutes' where id = 99003;
-- Ajuste para o dia de hoje em Brasília: se agora for perto da meia-noite, os horários acima podem cair em outro dia.
update public.partidas set inicio = (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '12 hours') at time zone 'America/Sao_Paulo'
where id in (99002, 99003, 99004) and (inicio at time zone 'America/Sao_Paulo')::date <> (now() at time zone 'America/Sao_Paulo')::date;

-- Os gatilhos do chat (só membros, janela do jogo) não interessam aqui.
alter table public.mensagens_chat disable trigger user;
insert into public.mensagens_chat (partida_id, clube_id, autor_id, autor_apelido, texto, criado_em) values
  (99001, 990010, '00000000-0000-0000-0000-00000000000a', 'ana_x', 'vamos', now()),
  (99001, 990010, '00000000-0000-0000-0000-00000000000a', 'ana_x', 'gol!', now()),
  (99001, 990010, '00000000-0000-0000-0000-00000000000e', 'caio_z', 'boa', now()),
  (99005, 990010, '00000000-0000-0000-0000-00000000000e', 'caio_z', 'antiga', now() - interval '10 days');

-- Ações da equipe com autoria.
insert into public.restricoes (usuario_id, tipo, motivo, ate, aplicada_por, aplicada_em)
values ('00000000-0000-0000-0000-00000000000b', 'silencio', 'teste', now() + interval '1 hour', '00000000-0000-0000-0000-00000000000d', now() - interval '5 minutes');
insert into public.missoes (titulo, regra, tipo, acao, meta, xp, criado_por, criado_em)
values ('Missão do painel', 'Envie 3 palpites', 'semanal', 'palpite_enviado', 3, 100, '00000000-0000-0000-0000-00000000000c', now() - interval '1 minute');

-- ---------- leitura ----------
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
set local role authenticated;
create temp table painel on commit drop as select public.admin_painel() as p;
reset role;

select pg_temp.igual((select (p -> 'indicadores' ->> 'ativos_hoje')::int from painel), 2, 'ativos hoje');
select pg_temp.igual((select (p -> 'indicadores' ->> 'ativos_semana_passada')::int from painel), 1, 'ativos no mesmo dia da semana passada');
select pg_temp.igual((select (p -> 'indicadores' ->> 'cadastros_7d')::int >= 2 from painel), true, 'cadastros da semana contam torcedores novos');
select pg_temp.igual((select (p -> 'indicadores' ->> 'cadastros_anterior')::int >= 1 from painel), true, 'cadastro de 10 dias entra na semana anterior');
select pg_temp.igual(
  (select (p -> 'indicadores' ->> 'xp_7d')::int from painel),
  (select sum(xp)::int from public.xp_lancamentos where criado_em >= now() - interval '7 days'),
  'XP dos últimos 7 dias');
select pg_temp.igual((select (p -> 'indicadores' ->> 'xp_anterior')::int >= 240 from painel), true, 'XP da semana anterior');
select pg_temp.igual((select (p -> 'indicadores' ->> 'mensagens_7d')::int >= 3 from painel), true, 'mensagens da semana');

select pg_temp.igual((select jsonb_array_length(p -> 'engajamento') from painel), 14, '14 dias de engajamento');
select pg_temp.igual((select (p -> 'engajamento' -> 13 ->> 'dia') from painel), pg_temp.dia(0), 'último dia é hoje');
select pg_temp.igual((select (p -> 'engajamento' -> 13 ->> 'ativos')::int from painel), 2, 'ativos de hoje no gráfico');
select pg_temp.igual((select (p -> 'engajamento' -> 10 ->> 'ativos')::int from painel), 3, 'ativos de 3 dias atrás');
select pg_temp.igual((select (p -> 'engajamento' -> 13 ->> 'jogo')::boolean from painel), true, 'hoje é dia de jogo');
select pg_temp.igual((select (p -> 'engajamento' -> 10 ->> 'jogo')::boolean from painel), true, 'há 3 dias foi dia de jogo');

select pg_temp.igual(
  (select string_agg(j ->> 'id', ',' order by n) from painel, jsonb_array_elements(p -> 'jogos_hoje') with ordinality as e(j, n)),
  '99001,99002,99003', 'jogos de hoje: ao vivo, próximo, encerrado; sem o jogo sem torcida');
select pg_temp.igual((select (p -> 'jogos_hoje' -> 0 ->> 'no_chat')::int from painel), 2, 'torcedores no chat do jogo ao vivo');
select pg_temp.igual((select (p -> 'jogos_hoje' -> 2 ->> 'notas_abertas')::boolean from painel), true, 'notas abertas logo após o apito');

select pg_temp.igual(
  (select (p -> 'economia_xp' ->> 'palpites_notas')::int >= 100 and (p -> 'economia_xp' ->> 'convites')::int >= 100 from painel),
  true, 'economia de XP por grupo');
select pg_temp.igual(
  (select (p -> 'economia_xp' ->> 'chat_fotos')::int >= 40 and (p -> 'economia_xp' ->> 'login')::int >= 40 from painel),
  true, 'chat e fotos e login diário');

select pg_temp.igual((select p -> 'log' -> 0 ->> 'acao' from painel), 'Missão “Missão do painel” criada', 'log começa pela ação mais recente');
select pg_temp.igual((select p -> 'log' -> 0 ->> 'quem' from painel), 'Editora', 'log mostra o nome de quem fez');
select pg_temp.igual((select p -> 'log' -> 1 ->> 'acao' like 'Conta @bia_y silenciada até %' from painel), true, 'restrição aparece no log');
select pg_temp.igual((select p -> 'log' -> 1 ->> 'origem' from painel), 'usuarios', 'origem da restrição');

-- ---------- assinantes ----------
insert into public.assinaturas (usuario_id, origem, id_externo, plano, status, expira_em) values
  ('00000000-0000-0000-0000-00000000000a', 'web', 'sub_a', 'mensal', 'ativa', now() + interval '20 days'),
  ('00000000-0000-0000-0000-00000000000b', 'web', 'sub_b', 'anual', 'cancelada', now() + interval '5 days'),
  ('00000000-0000-0000-0000-00000000000e', 'web', 'sub_c', 'mensal', 'expirada', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000000e', 'web', 'sub_d', 'mensal', 'pendente', null);
select pg_temp.igual(
  public.assinantes_pagantes() - (select count(distinct usuario_id) from public.assinaturas
    where usuario_id not in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000e')
      and status in ('ativa', 'atrasada', 'cancelada') and expira_em > now()),
  2::bigint, 'assinantes: ativa e cancelada no prazo; expirada e pendente não');

rollback;
