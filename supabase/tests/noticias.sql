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

create function pg_temp.noticia(p_titulo text) returns uuid language sql as $$
  select id from public.noticias where titulo = p_titulo;
$$;

insert into public.clubes (id, nome, nome_curto, pais) values
  (990010, 'Grêmio Esportivo Casa', 'Grêmio Casa', 'BR'),
  (990020, 'Fora Futebol Clube', 'Fora FC', 'BR'),
  (990030, 'Sem Torcida EC', null, 'BR');
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

-- clube pelo nome
select pg_temp.igual(public.clubes_citados('Gremio Casa vence e lidera'), array[990010], 'nome curto sem acento');
select pg_temp.igual(public.clubes_citados('Grêmio Esportivo Casa e Fora FC empatam'), array[990010, 990020], 'dois clubes');
select pg_temp.igual(public.clubes_citados('Sem Torcida EC contrata'), '{}'::integer[], 'clube sem torcida não conta');
select pg_temp.igual(public.clubes_citados('Grêmios da Casa'), '{}'::integer[], 'palavra inteira');

-- permissão
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
do $$ begin
  perform public.salvar_fonte(null, 'https://x.com/feed', 'X', null, null, 'revisar', true);
  raise exception 'moderador cadastrou fonte';
exception when insufficient_privilege then raise notice 'ok  moderador não cadastra fonte';
end $$;

-- fontes
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select public.salvar_fonte(null, 'https://geral.com/feed', 'Portal Geral', 'https://geral.com', null, 'revisar', true);
select public.salvar_fonte(null, 'https://diariodacasa.com/feed', 'Diário da Casa', null, 990010, 'automatica', true);
select public.salvar_fonte(null, 'https://auto.com/feed', 'Auto Geral', null, null, 'automatica', true);
do $$ begin
  perform public.salvar_fonte(null, 'https://geral.com/feed', 'De novo', null, null, 'revisar', true);
  raise exception 'aceitou fonte repetida';
exception when raise_exception then
  if sqlerrm = 'Essa fonte já está cadastrada' then raise notice 'ok  fonte repetida'; else raise; end if;
end $$;
select pg_temp.igual((select count(*) from public.admin_fontes()), 3::bigint, 'três fontes');

-- busca (service_role): registrar itens
select pg_temp.igual(public.registrar_noticias_da_fonte((select id from public.noticias_fontes where nome = 'Portal Geral'), '[
  {"titulo": "Grêmio Casa renova com o lateral", "link": "https://geral.com/1", "resumo": "Até 2028.", "imagem_url": "https://geral.com/1.jpg", "publicado_em": "2026-10-15T10:00:00Z"},
  {"titulo": "Federação divulga tabela", "link": "https://geral.com/2", "resumo": "Datas da fase final."},
  {"titulo": "Grêmio Casa renova com o lateral", "link": "https://geral.com/1"},
  {"titulo": "x", "link": "https://geral.com/3"},
  {"titulo": "Sem link", "link": "ftp://geral.com/4"}
]'), 2, 'duas novas (repetida e inválidas fora)');
select pg_temp.igual((select (classificacao, estado, clubes)::text from public.noticias where link = 'https://geral.com/1'), '(nome,recebida,{990010})', 'pelo nome, vai para a fila');
select pg_temp.igual((select (classificacao, estado)::text from public.noticias where link = 'https://geral.com/2'), '(conferir,recebida)', 'sem clube: conferir');
select public.registrar_noticias_da_fonte((select id from public.noticias_fontes where nome = 'Diário da Casa'), '[{"titulo": "Treino aberto no sábado", "link": "https://diariodacasa.com/a"}]');
select pg_temp.igual((select (classificacao, estado, clubes)::text from public.noticias where link = 'https://diariodacasa.com/a'), '(fonte,publicada,{990010})', 'fonte do clube e automática: publica');
select public.registrar_noticias_da_fonte((select id from public.noticias_fontes where nome = 'Auto Geral'), '[
  {"titulo": "Fora FC anuncia reforço", "link": "https://auto.com/a"},
  {"titulo": "Arbitragem muda regra", "link": "https://auto.com/b"}
]');
select pg_temp.igual((select estado from public.noticias where link = 'https://auto.com/a'), 'publicada', 'automática com clube publica');
select pg_temp.igual((select estado from public.noticias where link = 'https://auto.com/b'), 'recebida', 'automática sem clube fica na fila');
select pg_temp.igual((select ultimo_erro is null and ultima_busca_em is not null from public.noticias_fontes where nome = 'Auto Geral'), true, 'última busca marcada');
select public.registrar_erro_da_fonte((select id from public.noticias_fontes where nome = 'Auto Geral'), 'HTTP 500');
select pg_temp.igual((select ultimo_erro from public.admin_fontes() where nome = 'Auto Geral'), 'HTTP 500', 'erro da fonte');

-- fila e filtros
select pg_temp.igual((select (recebidas, publicadas)::text from public.admin_noticias_contagem()), '(3,2)', 'contagem');
select pg_temp.igual((select count(*) from public.admin_noticias('recebida', 990020)), 2::bigint, 'filtro de clube: as gerais entram');
select pg_temp.igual((select clubes_nomes from public.admin_noticias('recebida') where link = 'https://geral.com/1'), array['Grêmio Esportivo Casa'], 'nomes dos clubes');
select pg_temp.igual((select count(*) from public.admin_noticias('recebida', null, now() + interval '1 minute')), 0::bigint, 'filtro de período');

-- Trocar, publicar, descartar, despublicar
select public.editar_noticia(pg_temp.noticia('Federação divulga tabela'), 'Federação divulga tabela', 'Datas da fase final.', '{}');
select pg_temp.igual((select classificacao from public.noticias where link = 'https://geral.com/2'), 'conferir', 'sem mudar clubes mantém a marca');
select public.editar_noticia(pg_temp.noticia('Federação divulga tabela'), 'Federação divulga tabela', 'Datas da fase final.', array[990020]);
select pg_temp.igual((select (classificacao, clubes)::text from public.noticias where link = 'https://geral.com/2'), '(manual,{990020})', 'trocar marca como manual');
select public.publicar_noticia(pg_temp.noticia('Grêmio Casa renova com o lateral'));
select pg_temp.igual((select publicada_por from public.admin_noticias('publicada') where link = 'https://geral.com/1'), 'Editora', 'quem publicou');
select public.descartar_noticia(pg_temp.noticia('Arbitragem muda regra'));
select pg_temp.igual((select estado from public.noticias where link = 'https://auto.com/b'), 'descartada', 'descartada');
select pg_temp.igual(public.registrar_noticias_da_fonte((select id from public.noticias_fontes where nome = 'Auto Geral'), '[{"titulo": "Arbitragem muda regra", "link": "https://auto.com/b"}]'), 0, 'descartada não volta');

-- torcedores: Casa vê as do clube; Fora vê a do Fora (a geral virou do Fora)
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.igual((select count(*) from public.noticias_do_clube()), 2::bigint, 'Casa vê duas');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.igual((select count(*) from public.noticias_do_clube()), 1::bigint, 'Fora vê uma');
select pg_temp.igual((select count(*) from public.noticia(pg_temp.noticia('Treino aberto no sábado'))), 0::bigint, 'Fora não abre a da Casa');

-- leitura, clique, curtida, comentário
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.igual(public.ler_noticia(pg_temp.noticia('Treino aberto no sábado')), 10, 'ler rende 10 XP');
select pg_temp.igual(public.ler_noticia(pg_temp.noticia('Treino aberto no sábado')), 0, 'reler não rende');
select pg_temp.igual(public.abrir_original(pg_temp.noticia('Treino aberto no sábado')), 'https://diariodacasa.com/a', 'abrir original devolve o link');
select pg_temp.igual((select (leituras, cliques)::text from public.noticias where link = 'https://diariodacasa.com/a'), '(1,1)', 'leitura e clique contados');
select pg_temp.igual((select curtidas from public.curtir_noticia(pg_temp.noticia('Treino aberto no sábado'))), 1, 'curtiu');
select public.comentar_noticia(pg_temp.noticia('Treino aberto no sábado'), '  Vamos!  ');
select pg_temp.igual((select texto from public.comentarios_da_noticia(pg_temp.noticia('Treino aberto no sábado'))), 'Vamos!', 'comentou');
do $$ begin
  perform public.comentar_noticia(pg_temp.noticia('Treino aberto no sábado'), 'De novo');
  raise exception 'comentou duas vezes seguidas';
exception when raise_exception then
  if sqlerrm like 'Calma%' then raise notice 'ok  um comentário de cada vez'; else raise; end if;
end $$;
select pg_temp.igual((select curtidas from public.curtir_comentario_da_noticia((select max(id) from public.noticias_comentarios))), 1, 'curtiu o comentário');
select public.apagar_comentario_da_noticia((select max(id) from public.noticias_comentarios));
select pg_temp.igual((select comentarios from public.noticias where link = 'https://diariodacasa.com/a'), 0, 'apagou o comentário');
insert into public.restricoes (usuario_id, tipo, ate) values ('00000000-0000-0000-0000-00000000000a', 'silencio', now() + interval '1 day');
do $$ begin
  perform public.comentar_noticia((select id from public.noticias where link = 'https://diariodacasa.com/a'), 'Oi');
  raise exception 'silenciada comentou';
exception when raise_exception then
  if sqlerrm like 'Você está silenciado%' then raise notice 'ok  silenciada não comenta'; else raise; end if;
end $$;

-- despublicar tira do ar; desempenho
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select public.despublicar_noticia(pg_temp.noticia('Treino aberto no sábado'));
select pg_temp.igual((select estado from public.noticias where link = 'https://diariodacasa.com/a'), 'recebida', 'despublicada volta para a fila');
select pg_temp.igual((select (leituras_7d, cliques_7d)::text from public.admin_desempenho_noticias()), '(1,1)', 'desempenho');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.igual((select count(*) from public.noticias_do_clube()), 1::bigint, 'despublicada sumiu do app');

-- fonte: desligar e excluir mantém as notícias
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select public.ligar_fonte((select id from public.noticias_fontes where nome = 'Portal Geral'), false);
select pg_temp.igual((select ativa from public.noticias_fontes where nome = 'Portal Geral'), false, 'fonte desligada');
select public.excluir_fonte((select id from public.noticias_fontes where nome = 'Portal Geral'));
select pg_temp.igual((select fonte from public.admin_noticias('publicada') where link = 'https://geral.com/1'), 'Portal Geral', 'notícia guarda o nome da fonte');

rollback;
