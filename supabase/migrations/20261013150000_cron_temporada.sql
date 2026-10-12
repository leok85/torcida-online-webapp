-- Temporada inteira dos clubes com torcedores (fases já disputadas de copas e estaduais), uma vez por dia,
-- antes da classificação diária (06:40 em Brasília), que usa esses jogos para achar as copas.
select cron.schedule('partidas-temporada', '10 9 * * *', $$select public.chamar_sincronizar_partidas_com('{"modo": "temporada"}')$$);
