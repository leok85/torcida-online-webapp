-- Roteiro de teste da migration 20261029110000_fontes_sugeridas (banco local, tudo numa transação desfeita no fim):
-- supabase start && psql "$DB_URL" -q -o /dev/null -f supabase/tests/fontes_sugeridas.sql
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

create function pg_temp.sugestao(p_dominio text) returns uuid language sql as $$
  select id from public.noticias_fontes_sugeridas where dominio = p_dominio;
$$;

insert into public.clubes (id, nome, nome_curto, pais) values
  (990010, 'Grêmio Esportivo Casa', 'Grêmio Casa', 'BR'),
  (990020, 'Fora Futebol Clube', 'Fora FC', 'BR'),
  (990030, 'Sem Torcida EC', null, 'BR');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'ana@teste.com', '{"provider":"email"}', '{"apelido":"ana_x"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@teste.com', '{"provider":"email"}', '{"apelido":"bia_y"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000e', 'eli@teste.com', '{"provider":"email"}', '{"apelido":"eli_z"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'edi@torcidaonline.com.br', '{"provider":"google"}', '{"full_name":"Editora"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'mod@torcidaonline.com.br', '{"provider":"google"}', '{}', 'authenticated', 'authenticated');
update public.perfis set pais = 'BR', time_id = 990010, termos_aceitos_em = now(), onboarding_concluido_em = now()
where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e');
update public.perfis set pais = 'BR', time_id = 990020, termos_aceitos_em = now(), onboarding_concluido_em = now() where id = '00000000-0000-0000-0000-00000000000b';
insert into public.equipe (usuario_id, papel) values
  ('00000000-0000-0000-0000-00000000000c', 'editor'),
  ('00000000-0000-0000-0000-00000000000d', 'moderador');

select pg_temp.igual(public.dominio_de('https://WWW.Site.com.br:8080/rss?x=1'), 'site.com.br', 'dominio_de');

-- uma fonte já cadastrada
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select public.salvar_fonte(null, 'https://feeds.geral.com/rss', 'Portal Geral', 'https://www.geral.com/', null, 'revisar', true);

-- contexto: clubes por torcida e domínios conhecidos
select pg_temp.igual((select jsonb_path_query_array(public.contexto_da_descoberta(20), '$.clubes[*].id')), '[990010, 990020]'::jsonb, 'clubes com torcida, mais torcedores primeiro');
select pg_temp.igual((select jsonb_array_length(public.contexto_da_descoberta(1) -> 'clubes')), 1, 'limite de clubes');
select pg_temp.igual((select public.contexto_da_descoberta(20) -> 'conhecidos'), '["feeds.geral.com", "geral.com"]'::jsonb, 'domínios do feed e do site da fonte');

-- registrar o que a busca achou
select pg_temp.igual(public.registrar_fontes_sugeridas('[
  {"dominio": "diariodacasa.com", "achada_para": [990010], "aparicoes": 6, "ok": true, "feed": "https://diariodacasa.com/feed",
   "nome": "Diário da Casa", "site": "https://diariodacasa.com/", "itens": 5, "por_dia": 3.5, "exemplos": ["a", "b", "c", "d"],
   "textos": ["Grêmio Casa treina", "Gremio Casa vence", "Grêmio Casa e Fora FC empatam", "Grêmio Casa contrata", "Vestiário do Grêmio Casa"]},
  {"dominio": "cobertura.com", "achada_para": [990020, 990010], "aparicoes": 9, "ok": true, "feed": "https://cobertura.com/rss",
   "nome": "Cobertura", "itens": 5, "por_dia": 10,
   "textos": ["Grêmio Casa treina", "Fora FC vence", "Arbitragem", "Mercado", "Fora FC contrata"]},
  {"dominio": "semfeed.com", "achada_para": [990010], "aparicoes": 1, "ok": false, "erro": "Nenhum feed RSS encontrado"},
  {"dominio": "geral.com", "achada_para": [990010], "aparicoes": 3, "ok": true, "feed": "https://geral.com/outro-feed", "nome": "Geral"},
  {"dominio": "não é domínio", "ok": true, "feed": "https://x.com/rss", "nome": "X"},
  {"dominio": "redireciona.com", "ok": true, "feed": "https://feeds.geral.com/rss", "nome": "Redireciona"},
  {"dominio": "itensruins.com", "ok": true, "feed": "https://itensruins.com/rss", "nome": "Ruim", "itens": "muitos"},
  {"dominio": "nomecurto.com", "ok": true, "feed": "https://nomecurto.com/rss", "nome": "X", "itens": 3}
]'), 3, 'três sugestões novas');
select pg_temp.igual((select nome from public.noticias_fontes_sugeridas where dominio = 'nomecurto.com'), 'nomecurto.com', 'nome curto demais vira o domínio');
select pg_temp.igual((select count(*) from public.noticias_fontes_sugeridas where dominio in ('redireciona.com', 'itensruins.com')), 0::bigint, 'feed já cadastrado e item malformado ficam de fora sem derrubar o lote');
select public.ignorar_fonte_sugerida(pg_temp.sugestao('nomecurto.com'));

select pg_temp.igual((select estado from public.noticias_fontes_sugeridas where dominio = 'semfeed.com'), 'sem_feed', 'site sem feed');
select pg_temp.igual((select count(*) from public.noticias_fontes_sugeridas where dominio in ('geral.com', 'não é domínio')), 0::bigint, 'fonte cadastrada e domínio inválido não entram');
select pg_temp.igual((select clube_id from public.noticias_fontes_sugeridas where dominio = 'diariodacasa.com'), 990010, 'site dedicado sugere o clube');
select pg_temp.igual((select clube_id from public.noticias_fontes_sugeridas where dominio = 'cobertura.com'), null::integer, 'cobertura geral fica sem clube');
select pg_temp.igual((select exemplos from public.noticias_fontes_sugeridas where dominio = 'diariodacasa.com'), array['a', 'b', 'c'], 'até 3 exemplos');

-- o que já foi registrado não volta, exceto o sem feed, que é conferido de novo depois de 30 dias
select pg_temp.igual(public.registrar_fontes_sugeridas('[{"dominio": "cobertura.com", "aparicoes": 1, "ok": true, "feed": "https://cobertura.com/rss", "nome": "Outro nome"}]'), 0, 'pendente não é regravada');
select pg_temp.igual((select nome from public.noticias_fontes_sugeridas where dominio = 'cobertura.com'), 'Cobertura', 'nome mantido');
select pg_temp.igual((select public.contexto_da_descoberta(20) -> 'conhecidos' ? 'semfeed.com'), true, 'sem feed recente é conhecido');
update public.noticias_fontes_sugeridas set verificada_em = now() - interval '31 days' where dominio = 'semfeed.com';
select pg_temp.igual((select public.contexto_da_descoberta(20) -> 'conhecidos' ? 'semfeed.com'), false, 'sem feed antigo volta a ser conferido');
select pg_temp.igual(public.registrar_fontes_sugeridas('[{"dominio": "semfeed.com", "achada_para": [990020], "aparicoes": 2, "ok": true, "feed": "https://semfeed.com/feed", "nome": "Agora Tem Feed"}]'), 1, 'sem feed que ganhou feed vira sugestão');

-- intervalo entre descobertas
select pg_temp.igual(public.iniciar_descoberta(false), true, 'primeira descoberta da equipe');
select pg_temp.igual(public.iniciar_descoberta(false), false, 'segunda em menos de 10 min é recusada');
select pg_temp.igual(public.iniciar_descoberta(true), true, 'o cron sempre passa');
update public.noticias_descobertas set iniciada_em = now() - interval '11 minutes';
select pg_temp.igual(public.iniciar_descoberta(false), true, 'depois de 10 min a equipe pode de novo');

-- back-office: permissão
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
do $$ begin
  perform public.admin_fontes_sugeridas();
  raise exception 'moderador viu as sugestões';
exception when insufficient_privilege then raise notice 'ok  moderador não vê sugestões';
end $$;
do $$ begin
  perform public.aceitar_fonte_sugerida(pg_temp.sugestao('cobertura.com'), null, 'revisar');
  raise exception 'moderador aceitou sugestão';
exception when insufficient_privilege then raise notice 'ok  moderador não aceita sugestão';
end $$;

-- back-office: listar, aceitar e ignorar
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.igual((select array_agg(dominio order by ordem) from (select dominio, row_number() over () as ordem from public.admin_fontes_sugeridas()) s),
  array['cobertura.com', 'diariodacasa.com', 'semfeed.com'], 'pendentes, das que mais apareceram primeiro');
select pg_temp.igual((select achada_para from public.admin_fontes_sugeridas() where dominio = 'cobertura.com'), array['Fora Futebol Clube', 'Grêmio Esportivo Casa'], 'clubes da busca pelo nome, na ordem');
select pg_temp.igual((select clube from public.admin_fontes_sugeridas() where dominio = 'diariodacasa.com'), 'Grêmio Esportivo Casa', 'nome do clube sugerido');

select public.aceitar_fonte_sugerida(pg_temp.sugestao('diariodacasa.com'), 990010, 'automatica');
select pg_temp.igual((select (nome, clube_id, modo, ativa)::text from public.noticias_fontes where url = 'https://diariodacasa.com/feed'), '("Diário da Casa",990010,automatica,t)', 'aceitar cadastra a fonte');
select pg_temp.igual((select (estado, fonte_id is not null, decidida_por)::text from public.noticias_fontes_sugeridas where dominio = 'diariodacasa.com'),
  '(aceita,t,00000000-0000-0000-0000-00000000000c)', 'sugestão aceita');
do $$ begin
  perform public.aceitar_fonte_sugerida(pg_temp.sugestao('diariodacasa.com'), null, 'revisar');
  raise exception 'aceitou duas vezes';
exception when sqlstate 'P0001' then raise notice 'ok  não aceita duas vezes';
end $$;

-- feed cadastrado à mão depois da sugestão: aceitar liga à fonte existente
select public.salvar_fonte(null, 'https://semfeed.com/feed', 'Cadastrada à mão', null, null, 'revisar', true);
select pg_temp.igual(public.aceitar_fonte_sugerida(pg_temp.sugestao('semfeed.com'), null, 'revisar'),
  (select id from public.noticias_fontes where url = 'https://semfeed.com/feed'), 'aceitar feed já cadastrado devolve a fonte existente');
select pg_temp.igual((select count(*) from public.noticias_fontes where url = 'https://semfeed.com/feed'), 1::bigint, 'sem fonte duplicada');

select public.ignorar_fonte_sugerida(pg_temp.sugestao('cobertura.com'));
select pg_temp.igual((select estado from public.noticias_fontes_sugeridas where dominio = 'cobertura.com'), 'ignorada', 'sugestão ignorada');
select pg_temp.igual((select count(*) from public.admin_fontes_sugeridas()), 0::bigint, 'aceitas e ignoradas saem da lista');
select pg_temp.igual((select public.contexto_da_descoberta(20) -> 'conhecidos' @> '["cobertura.com", "diariodacasa.com"]'), true, 'aceita e ignorada não voltam na busca');

-- torcedor não chega às funções da descoberta
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
do $$ begin
  perform public.registrar_fontes_sugeridas('[]');
  raise exception 'torcedor registrou sugestão';
exception when insufficient_privilege then raise notice 'ok  torcedor não registra sugestão';
end $$;
do $$ begin
  perform 1 from public.noticias_fontes_sugeridas;
  raise exception 'torcedor leu a tabela';
exception when insufficient_privilege then raise notice 'ok  torcedor não lê a tabela';
end $$;
reset role;

rollback;
