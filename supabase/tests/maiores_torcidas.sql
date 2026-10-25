-- Roteiro de teste da migration 20261025160949_maiores_torcidas (banco local, tudo numa transação desfeita no fim):
-- supabase start && psql "$DB_URL" -q -o /dev/null -f supabase/tests/maiores_torcidas.sql
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

-- Só os clubes do teste: o resto do banco não entra na conta.
delete from public.perfis where time_id is not null;

insert into public.clubes (id, nome, nome_curto, pais) values
  (990110, 'Casa FC', null, 'BR'),
  (990120, 'Vizinho EC', null, 'BR'),
  (990130, 'Gringo United', null, 'AR');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role)
select ('f0f0f0f0-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'torcedor' || i || '@teste.com', '{"provider":"email"}',
  json_build_object('apelido', 'torc_' || i), 'authenticated', 'authenticated'
from generate_series(1, 7) i;
-- Datas montadas à mão: sem os gatilhos, que carimbam o onboarding com now() e só aceitam time_trocado_em numa troca.
set local session_replication_role = replica;
-- 01 (eu) e 02: Casa FC; 03: Vizinho EC; 04, 05 e 06: Gringo United (06 chegou nesta semana); 07: sem cadastro concluído.
update public.perfis set pais = 'BR', termos_aceitos_em = now(), onboarding_concluido_em = now() - interval '30 days',
  time_id = case right(id::text, 2) when '01' then 990110 when '02' then 990110 when '03' then 990120 else 990130 end
where id::text like 'f0f0f0f0-0000-0000-0000-0000000001%' and right(id::text, 2) <> '07';
update public.perfis set time_trocado_em = now() - interval '2 days' where id = 'f0f0f0f0-0000-0000-0000-000000000106';
update public.perfis set time_id = 990120 where id = 'f0f0f0f0-0000-0000-0000-000000000107';
set local session_replication_role = origin;

select pg_temp.como('f0f0f0f0-0000-0000-0000-000000000101');
set local role authenticated;
create temp table r on commit drop as select * from public.maiores_torcidas(10);
reset role;

select pg_temp.igual((select string_agg(posicao || ' ' || nome || ' ' || torcedores, ', ' order by posicao) from r where escopo = 'mundo'),
  '1 Gringo United 3, 2 Casa FC 2, 3 Vizinho EC 1', 'mundo: mais torcedores primeiro, sem quem não concluiu o cadastro');
select pg_temp.igual((select string_agg(nome, ', ' order by posicao) from r where escopo = 'pais'), 'Casa FC, Vizinho EC', 'país: só os clubes do país do meu clube');
select pg_temp.igual((select novos_na_semana from r where escopo = 'mundo' and clube_id = 990130), 1, 'quem trocou para o clube nesta semana');
select pg_temp.igual((select bool_and(meu = (clube_id = 990110)) from r), true, 'marca o meu clube');
select pg_temp.igual((select pais_nome || '/' || bandeira from r where clube_id = 990130 limit 1), 'Argentina/ar', 'nome e bandeira do país');

-- Limite 1: o top 1 e o meu clube no fim.
set local role authenticated;
select pg_temp.igual((select string_agg(posicao || ' ' || nome, ', ' order by posicao) from public.maiores_torcidas(1) where escopo = 'mundo'),
  '1 Gringo United, 2 Casa FC', 'meu clube fora do top vem junto');
reset role;

-- Visitante sem login não chama a função.
set local role anon;
do $$
begin
  perform public.maiores_torcidas(10);
  raise exception 'FALHOU anon chamou maiores_torcidas';
exception when insufficient_privilege then raise notice 'ok  anon não chama a função';
end $$;
reset role;

rollback;
