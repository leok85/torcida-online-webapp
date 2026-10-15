-- Roteiro de teste da migration 20261026100000_xp_e_missoes (roda num banco local, tudo dentro de uma transação
-- desfeita no fim): supabase start && psql "$DB_URL" -q -o /dev/null -f supabase/tests/xp_e_missoes.sql
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

-- nível
select pg_temp.igual((select nivel from public.nivel_do_xp(0)), 1, 'nível 0 XP = 1');
select pg_temp.igual((select nivel from public.nivel_do_xp(199)), 1, 'nível 199 XP = 1');
select pg_temp.igual((select nivel from public.nivel_do_xp(200)), 2, 'nível 200 XP = 2');
select pg_temp.igual((select xp_do_nivel from public.nivel_do_xp(200)), 250, 'nível 2 pede 250');
select pg_temp.igual((select nivel from public.nivel_do_xp(449)), 2, '449 XP = 2');
select pg_temp.igual((select nivel from public.nivel_do_xp(450)), 3, '450 XP = 3');
select pg_temp.igual((select nivel from public.nivel_do_xp(17250)), 24, '17250 XP = 24');
select pg_temp.igual((select xp_no_nivel from public.nivel_do_xp(17249)), 1299, '17249 XP = 1299 no nível 23');

-- dados
insert into public.ligas (id, nome, pais) values (1, 'Liga', 'BR') on conflict do nothing;
insert into public.clubes (id, nome, pais) values (10, 'Casa FC', 'BR'), (20, 'Fora FC', 'BR') on conflict do nothing;
insert into public.elencos (clube_id, jogadores) values
  (10, '[{"id": 101, "nome": "Marco Reus"}, {"id": 102, "nome": "João Silva"}]'),
  (20, '[{"id": 201, "nome": "Pedro Gol"}]')
on conflict (clube_id) do update set jogadores = excluded.jogadores;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'ana@teste.com', '{"provider":"email"}', '{"apelido":"ana_x"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@teste.com', '{"provider":"email"}', '{"apelido":"bia_y"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'leo@torcidaonline.com.br', '{"provider":"google"}', '{}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'edu@torcidaonline.com.br', '{"provider":"google"}', '{}', 'authenticated', 'authenticated');
update public.perfis set pais = 'BR', time_id = 10, termos_aceitos_em = now(), onboarding_concluido_em = now()
where id in ('00000000-0000-0000-0000-00000000000a');
insert into public.equipe (usuario_id, papel) values
  ('00000000-0000-0000-0000-00000000000c', 'editor'),
  ('00000000-0000-0000-0000-00000000000d', 'analista');

insert into public.partidas (id, liga_id, liga_nome, inicio, status, mandante_id, mandante_nome, visitante_id, visitante_nome, gols_mandante, gols_visitante, gols)
values (900, 1, 'Liga', now() - interval '2 hours', 'ao_vivo', 10, 'Casa FC', 20, 'Fora FC', 2, 1,
  '[{"jogador":"M. Reus","minuto":"10","mandante":true,"contra":false},{"jogador":"M. Reus","minuto":"50","mandante":true,"contra":false},{"jogador":"Pedro Gol","minuto":"70","mandante":false,"contra":true}]');

-- permissão
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
do $$ begin
  perform public.salvar_regras_xp('{"notas": 70}');
  raise exception 'analista salvou';
exception when insufficient_privilege then raise notice 'ok  analista não salva regras';
end $$;

-- editor: regras, histórico, missões, multiplicador
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select public.salvar_regras_xp('{"notas": 70, "login_diario": 20}');
select pg_temp.igual((select xp from public.xp_regras where acao = 'notas'), 70, 'notas foi para 70');
select pg_temp.igual((select count(*) from public.historico_regras_xp()), 1::bigint, 'histórico só com a mudança real');
select public.salvar_missao(null, 'Voz da arquibancada', 'Envie 3 mensagens no chat', 'forum', 'semanal', 'mensagem_chat', 3, 120, 'ativa');
select public.salvar_missao(null, 'Rascunho', 'Teste', 'flag', 'continua', 'login_diario', 5, 100, 'rascunho');
select public.salvar_multiplicador(null, 'Clássico', 2, 'partida', 900, null, null, null, true);
select pg_temp.igual((select count(*) from public.admin_missoes()), 2::bigint, 'admin vê 2 missões');
select public.excluir_missao((select id from public.missoes where titulo = 'Rascunho'));
select pg_temp.igual((select count(*) from public.admin_missoes()), 1::bigint, 'rascunho apagado');

-- torcedor: presença
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.igual(public.registrar_presenca(), 20, 'login credita 20');
select pg_temp.igual(public.registrar_presenca(), 0, 'login do mesmo dia não repete');

-- conta corporativa não ganha XP
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.igual(public.registrar_presenca(), 0, 'conta da equipe não ganha XP');

-- palpite (insert direto, a RPC exige assinatura)
insert into public.palpites (partida_id, usuario_id, clube_id, formacao, escalacao, gols_mandante, gols_visitante, autores)
values (900, '00000000-0000-0000-0000-00000000000a', 10, '4-3-3', '{}', 2, 1,
  '[{"mandante": true, "jogador": 101}, {"mandante": true, "jogador": 101}, {"mandante": true, "jogador": 102}, {"mandante": false, "jogador": 201}]');
select pg_temp.igual((select xp from public.xp_lancamentos where acao = 'palpite_enviado'), 100, 'palpite enviado 50 × 2 (clássico)');

-- chat: 3 mensagens concluem a missão semanal (multiplicador não vale para missão)
select pg_temp.igual(public.creditar_xp('00000000-0000-0000-0000-00000000000a', 'mensagem_chat', 'm1', 900), 4, 'chat 2 × 2');
select public.creditar_xp('00000000-0000-0000-0000-00000000000a', 'mensagem_chat', 'm2', 900);
select pg_temp.igual((select count(*) from public.xp_lancamentos where acao = 'missao'), 0::bigint, 'missão ainda não');
select public.creditar_xp('00000000-0000-0000-0000-00000000000a', 'mensagem_chat', 'm3', 900);
select pg_temp.igual((select xp from public.xp_lancamentos where acao = 'missao'), 120, 'missão concluída com 120');
select public.creditar_xp('00000000-0000-0000-0000-00000000000a', 'mensagem_chat', 'm4', 900);
select pg_temp.igual((select count(*) from public.xp_lancamentos where acao = 'missao'), 1::bigint, 'missão não repete na semana');

-- limite por partida
update public.xp_regras set limite = 5 where acao = 'mensagem_chat';
select public.creditar_xp('00000000-0000-0000-0000-00000000000a', 'mensagem_chat', 'm5', 900);
select pg_temp.igual(public.creditar_xp('00000000-0000-0000-0000-00000000000a', 'mensagem_chat', 'm6', 900), 0, 'limite de chat por jogo');

-- apito: placar exato e autores (Reus 2 gols conta 2×; João 0; Pedro foi gol contra)
update public.partidas set status = 'encerrada' where id = 900;
select pg_temp.igual((select xp from public.xp_lancamentos where acao = 'palpite_exato'), 480, 'placar exato 240 × 2');
select pg_temp.igual((select count(*) from public.xp_lancamentos where acao = 'palpite_vencedor'), 0::bigint, 'exato não leva vencedor junto');
select pg_temp.igual((select count(*) from public.xp_lancamentos where acao = 'palpite_autor'), 2::bigint, 'dois autores certos (Reus 2×)');
select public.apurar_xp_pendente();
select pg_temp.igual((select count(*) from public.xp_lancamentos where acao like 'palpite_%'), 4::bigint, 'reapurar não duplica');

-- leituras do torcedor
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.igual((select xp_total from public.meu_xp()), (select sum(xp) from public.xp_lancamentos where usuario_id = '00000000-0000-0000-0000-00000000000a'), 'meu_xp soma o extrato');
select pg_temp.igual((select posicao_temporada from public.meu_xp()), 1::bigint, 'primeiro na temporada');
select pg_temp.igual((select progresso from public.minhas_missoes()), 3, 'progresso limitado à meta');
select pg_temp.igual((select concluida_em is not null from public.minhas_missoes()), true, 'missão marcada concluída');
select pg_temp.igual((select count(*) from public.meu_extrato(100)), (select count(*) from public.xp_lancamentos where usuario_id = '00000000-0000-0000-0000-00000000000a'), 'extrato completo');
select pg_temp.igual((select rotulo from public.meu_extrato(100) where acao = 'missao'), 'Missão concluída', 'rótulo da missão');
select pg_temp.igual((select eu from public.ranking_xp('semana', 10, 10)), true, 'ranking do clube com o torcedor');

-- presença: hoje + 2 dias seguidos antes (datas ajustadas no próprio extrato)
insert into public.xp_lancamentos (usuario_id, acao, referencia, xp, xp_base, criado_em) values
  ('00000000-0000-0000-0000-00000000000a', 'login_diario', 'ontem', 20, 20, now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000000a', 'login_diario', 'anteontem', 20, 20, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000000a', 'login_diario', 'antigo', 20, 20, now() - interval '5 days');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.igual((select sequencia from public.minha_presenca()), 3, 'sequência de 3 dias');
select pg_temp.igual((select (now() at time zone 'America/Sao_Paulo')::date = any(dias) from public.minha_presenca()), true, 'hoje na semana');
select pg_temp.igual((select coalesce(bool_and(d >= (public.inicio_da_semana() at time zone 'America/Sao_Paulo')::date), true) from public.minha_presenca(), unnest(dias) d), true, 'só dias desta semana');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.igual((select sequencia from public.minha_presenca()), 0, 'sem login, sequência 0');

-- convite
update public.perfis set pais = 'BR', time_id = 20, termos_aceitos_em = now(), convidado_por = '00000000-0000-0000-0000-00000000000a'
where id = '00000000-0000-0000-0000-00000000000b';
update public.perfis set onboarding_concluido_em = now() where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.igual((select count(*) from public.xp_lancamentos where acao = 'convite_aceito'), 2::bigint, 'convite credita os dois');

-- feedback
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into public.feedbacks (tipo, area, texto) values ('sugestao', 'missoes', 'Mais missões por favor'), ('elogio', 'inicio', 'App muito bom mesmo'), ('elogio', 'inicio', 'Terceiro envio aqui');
select pg_temp.igual((select array_agg(xp order by xp desc) from public.feedbacks), array[50, 50, 0], 'feedback: 2 com XP na semana');
select pg_temp.igual((select count(*) from public.xp_lancamentos where acao = 'feedback'), 2::bigint, 'feedback no extrato');

-- fora de casa
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select public.salvar_multiplicador(null, 'Fora de casa', 1.5, 'fora_de_casa', null, null, null, null, true);
insert into public.partidas (id, liga_id, liga_nome, inicio, status, mandante_id, mandante_nome, visitante_id, visitante_nome)
values (901, 1, 'Liga', now(), 'ao_vivo', 10, 'Casa FC', 20, 'Fora FC');
select pg_temp.igual(public.creditar_xp('00000000-0000-0000-0000-00000000000b', 'notas', '901', 901), 105, 'visitante 70 × 1,5');
select pg_temp.igual(public.creditar_xp('00000000-0000-0000-0000-00000000000a', 'notas', '901', 901), 70, 'mandante sem fator');

-- foto campeã
insert into public.fotos_torcida (partida_id, clube_id, autor_id, autor_apelido, momento, caminho, curtidas, etiqueta)
values (900, 10, '00000000-0000-0000-0000-00000000000a', 'ana_x', 'pos', '900/10/a/1.jpg', 7, 'Comemoração');
select pg_temp.igual((select xp from public.xp_lancamentos where acao = 'foto_enviada'), 80, 'foto 40 × 2');
update public.partidas set encerrada_em = now() - interval '2 hours' where id = 900;
select public.apurar_xp_pendente();
select pg_temp.igual((select xp from public.xp_lancamentos where acao = 'foto_campea'), 1000, 'foto campeã 500 × 2');

-- economia
select pg_temp.igual((select xp_7d > 0 from public.economia_xp()), true, 'economia soma XP');
select pg_temp.igual((select jsonb_array_length(por_acao) > 3 from public.economia_xp()), true, 'economia por ação');
select pg_temp.igual((select count(*) from public.admin_multiplicadores()), 2::bigint, 'dois multiplicadores');

-- mesmo_jogador
select pg_temp.igual(public.mesmo_jogador('M. Reus', 'Marco Reus'), true, 'M. Reus = Marco Reus');
select pg_temp.igual(public.mesmo_jogador('J. Reus', 'Marco Reus'), false, 'J. Reus ≠ Marco Reus');
select pg_temp.igual(public.mesmo_jogador('Neymar', 'Neymar'), true, 'nome único');

rollback;
