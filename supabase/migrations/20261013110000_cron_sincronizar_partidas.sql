-- Agenda a sincronização dos jogos com a BSD (Edge Function sincronizar-partidas).
-- O segredo que a função confere (SINCRONIZAR_PARTIDAS_SEGREDO) fica no Vault com o nome
-- 'sincronizar_partidas_segredo'; ele é criado à parte, fora das migrations, para não ir para o git.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.chamar_sincronizar_partidas(modo text)
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
    body := jsonb_build_object('modo', modo),
    timeout_milliseconds := 120000
  );
$$;

revoke execute on function public.chamar_sincronizar_partidas(text) from public, anon, authenticated;

-- Placar e minuto de quem está em campo, a cada 2 minutos.
select cron.schedule('partidas-ao-vivo', '*/2 * * * *', $$select public.chamar_sincronizar_partidas('ao_vivo')$$);
-- Resultados dos últimos 2 dias e jogos dos próximos 7, de hora em hora.
select cron.schedule('partidas-agenda', '7 * * * *', $$select public.chamar_sincronizar_partidas('agenda')$$);
