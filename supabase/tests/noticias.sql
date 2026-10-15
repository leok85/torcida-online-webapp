-- Roteiro de teste da migration 20261028100000_noticias (banco local, tudo numa transação desfeita no fim):
-- supabase start && psql "$DB_URL" -q -o /dev/null -f supabase/tests/noticias.sql
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

insert into public.clubes (id, nome, pais) values (990010, 'Casa FC', 'BR'), (990020, 'Fora FC', 'BR');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'ana@teste.com', '{"provider":"email"}', '{"apelido":"ana_x"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@teste.com', '{"provider":"email"}', '{"apelido":"bia_y"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'edi@torcidaonline.com.br', '{"provider":"google"}', '{"full_name":"Editora"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'mod@torcidaonline.com.br', '{"provider":"google"}', '{}', 'authenticated', 'authenticated');
update public.perfis set pais = 'BR', time_id = 990010, termos_aceitos_em = now(), onboarding_concluido_em = now() where id = '00000000-0000-0000-0000-00000000000a';
update public.perfis set pais = 'BR', time_id = 990020, termos_aceitos_em = now(), onboarding_concluido_em = now() where id = '00000000-0000-0000-0000-00000000000b';
insert into public.equipe (usuario_id, papel) values
  ('00000000-0000-0000-0000-00000000000c', 'editor'),
  ('00000000-0000-0000-0000-00000000000d', 'moderador');

-- permissão
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
do $$ begin
  perform public.salvar_noticia(null, 'Notícia do moderador', '', '', 'Clube', null, null, null);
  raise exception 'moderador escreveu';
exception when insufficient_privilege then raise notice 'ok  moderador não escreve notícia';
end $$;

-- editora: rascunho, agendada, publicada (uma do clube, outra para todos)
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select public.salvar_noticia(null, 'Rascunho da prévia', 'resumo', 'corpo', 'Jogo', 990010, null, null);
select public.salvar_noticia(null, 'Agendada para amanhã', 'resumo', 'corpo', 'Jogo', 990010, null, now() + interval '1 day');
select public.salvar_noticia(null, 'Meia volta de suspensão', 'Volta no clássico', 'Primeiro parágrafo.

Segundo parágrafo.', 'Escalação', 990010, '00000000/capa.jpg', now() - interval '1 hour');
select public.salvar_noticia(null, 'Novas regras do chat ao vivo', 'Para todos', 'corpo', 'Torcida', null, null, now() - interval '2 hours');
select pg_temp.igual((select (publicadas, agendadas, rascunhos)::text from public.admin_noticias_contagem()), '(2,1,1)', 'contagem por estado');
select pg_temp.igual((select count(*) from public.admin_noticias('agendada')), 1::bigint, 'aba agendadas');
select pg_temp.igual((select autor from public.admin_noticias('publicada') limit 1), 'Editora', 'autor na lista');
select pg_temp.igual((select count(*) from public.admin_clubes_com_torcedores() where id in (990010, 990020)), 2::bigint, 'clubes com torcedores');

-- torcedora do Casa FC vê as duas publicadas; do Fora FC só a geral
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.igual((select count(*) from public.noticias_do_clube()), 2::bigint, 'Casa vê do clube e a geral');
select pg_temp.igual((select count(*) from public.noticias_do_clube('Escalação')), 1::bigint, 'filtro por categoria');
select pg_temp.igual((select titulo from public.noticias_do_clube() limit 1), 'Meia volta de suspensão', 'mais recente primeiro');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.igual((select count(*) from public.noticias_do_clube()), 1::bigint, 'Fora vê só a geral');
select pg_temp.igual((select count(*) from public.noticia((select id from public.noticias where titulo = 'Meia volta de suspensão'))), 0::bigint, 'Fora não abre a do outro clube');

-- leitura, XP, curtida, comentário
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.igual(public.ler_noticia((select id from public.noticias where titulo = 'Meia volta de suspensão')), 10, 'ler rende 10 XP');
select pg_temp.igual(public.ler_noticia((select id from public.noticias where titulo = 'Meia volta de suspensão')), 0, 'reler não rende');
select pg_temp.igual((select leituras from public.noticias where titulo = 'Meia volta de suspensão'), 1, 'uma leitura contada');
select pg_temp.igual((select li from public.noticia((select id from public.noticias where titulo = 'Meia volta de suspensão'))), true, 'marcada como lida');
select pg_temp.igual((select curtidas from public.curtir_noticia((select id from public.noticias where titulo = 'Meia volta de suspensão'))), 1, 'curtiu');
select pg_temp.igual((select curti from public.curtir_noticia((select id from public.noticias where titulo = 'Meia volta de suspensão'))), false, 'descurtiu');
select public.comentar_noticia((select id from public.noticias where titulo = 'Meia volta de suspensão'), '  Boa notícia!  ');
select pg_temp.igual((select texto from public.comentarios_da_noticia((select id from public.noticias where titulo = 'Meia volta de suspensão'))), 'Boa notícia!', 'comentário publicado');
select pg_temp.igual((select comentarios from public.noticias where titulo = 'Meia volta de suspensão'), 1, 'contador de comentários');
do $$ begin
  perform public.comentar_noticia((select id from public.noticias where titulo = 'Meia volta de suspensão'), 'De novo');
  raise exception 'comentou duas vezes seguidas';
exception when raise_exception then
  if sqlerrm like 'Calma%' then raise notice 'ok  um comentário de cada vez'; else raise; end if;
end $$;
select pg_temp.igual((select curtidas from public.curtir_comentario_da_noticia((select max(id) from public.noticias_comentarios))), 1, 'curtiu o comentário');
select pg_temp.igual((select meu from public.comentarios_da_noticia((select id from public.noticias where titulo = 'Meia volta de suspensão'))), true, 'comentário é meu');
select public.apagar_comentario_da_noticia((select max(id) from public.noticias_comentarios));
select pg_temp.igual((select comentarios from public.noticias where titulo = 'Meia volta de suspensão'), 0, 'apagou o comentário');

-- silenciada não comenta
insert into public.restricoes (usuario_id, tipo, ate) values ('00000000-0000-0000-0000-00000000000a', 'silencio', now() + interval '1 day');
do $$ begin
  perform public.comentar_noticia((select id from public.noticias where titulo = 'Novas regras do chat ao vivo'), 'Oi');
  raise exception 'silenciada comentou';
exception when raise_exception then
  if sqlerrm like 'Você está silenciado%' then raise notice 'ok  silenciada não comenta'; else raise; end if;
end $$;

-- rascunho e agendada não aparecem; despublicar tira do ar
select pg_temp.igual((select count(*) from public.noticia((select id from public.noticias where titulo = 'Agendada para amanhã'))), 0::bigint, 'agendada escondida');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select public.publicar_noticia((select id from public.noticias where titulo = 'Novas regras do chat ao vivo'), null);
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.igual((select count(*) from public.noticias_do_clube()), 0::bigint, 'despublicada sumiu');

-- desempenho e exclusão
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.igual((select (leituras_7d, curtidas_7d)::text from public.admin_desempenho_noticias()), '(1,0)', 'desempenho na semana');
select public.excluir_noticia((select id from public.noticias where titulo = 'Meia volta de suspensão'));
select pg_temp.igual((select count(*) from public.noticias_leituras), 0::bigint, 'excluir leva as leituras');

rollback;
