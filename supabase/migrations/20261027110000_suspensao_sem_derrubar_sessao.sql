-- Suspensão sem apagar as sessões: apagadas, a renovação do token responde refresh_token_not_found e o app não sabe
-- o motivo. Com a sessão mantida e auth.users.banned_until preenchido, o Supabase Auth recusa a renovação com
-- user_banned, que o app trata. O token de acesso já emitido continua valendo até expirar (até 1 h), como antes, e o
-- trigger barrar_restrito segue impedindo o suspenso de gravar nesse intervalo.

/** Suspende por p_dias (1 a 365): bloqueia o login e a renovação das sessões abertas. */
create or replace function public.suspender_usuario(p_usuario uuid, p_dias integer, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ate timestamptz := now() + make_interval(days => p_dias);
begin
  perform public.exigir_moderador();
  if p_dias is null or p_dias not between 1 and 365 then
    raise exception 'Duração inválida' using errcode = 'P0001', hint = 'duracao_invalida';
  end if;
  if not exists (select 1 from public.perfis p where p.id = p_usuario) then
    raise exception 'Torcedor não encontrado' using errcode = 'P0001', hint = 'torcedor_inexistente';
  end if;
  insert into public.restricoes (usuario_id, tipo, motivo, ate, aplicada_por)
  values (p_usuario, 'suspensao', nullif(btrim(p_motivo), ''), v_ate, (select auth.uid()));
  update auth.users set banned_until = greatest(coalesce(banned_until, v_ate), v_ate) where id = p_usuario;
end;
$$;
