-- Agenda a classificação das ligas (sincronizar-partidas, modo "classificacao").
-- A chamada passa a aceitar o corpo inteiro, para mandar { "todas": true } na rodada diária.
create or replace function public.chamar_sincronizar_partidas_com(corpo jsonb)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://rtgsbxsscwumcfpcytzq.supabase.co/functions/v1/sincronizar-partidas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'sincronizar_partidas_segredo')
    ),
    body := corpo,
    timeout_milliseconds := 120000
  );
$$;

revoke execute on function public.chamar_sincronizar_partidas_com(jsonb) from public, anon, authenticated;

-- Ligas que tiveram jogo nas últimas 6 h, de hora em hora.
select cron.schedule('classificacao-recentes', '20 * * * *', $$select public.chamar_sincronizar_partidas_com('{"modo": "classificacao"}')$$);
-- Todas as ligas do catálogo, uma vez por dia (06:40 em Brasília).
select cron.schedule('classificacao-todas', '40 9 * * *', $$select public.chamar_sincronizar_partidas_com('{"modo": "classificacao", "todas": true}')$$);
