-- Fotos da torcida, parte 2 (modal de envio da W07): o torcedor escolhe o momento do jogo da foto (a etiqueta), e
-- continua valendo uma foto por janela, três por jogo.

alter table public.fotos_torcida add column etiqueta text not null default 'Antes do jogo'
  check (etiqueta in ('Antes do jogo', '1º tempo', 'Intervalo', '2º tempo', 'Comemoração'));
alter table public.fotos_torcida alter column etiqueta drop default;

drop function public.registrar_foto(integer, text, text);
drop function public.fotos_do_jogo(integer);

/**
 * Registra a foto já enviada ao bucket, na janela aberta agora. Erros (hint): sem_perfil, so_membros, outro_clube,
 * fora_da_janela, ja_enviou, caminho_invalido, legenda_longa, etiqueta_invalida.
 */
create function public.registrar_foto(p_partida integer, p_caminho text, p_etiqueta text, p_legenda text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfis%rowtype;
  v_janela text;
  v_id uuid;
begin
  v_perfil := public.torcedor_das_fotos(p_partida);
  v_janela := public.janela_da_foto(p_partida);
  if v_janela is null then
    raise exception 'O envio de fotos deste jogo está fechado' using errcode = 'P0001', hint = 'fora_da_janela';
  end if;
  if p_caminho is null or p_caminho not like p_partida || '/' || v_perfil.time_id || '/' || v_perfil.id || '/%' then
    raise exception 'Caminho inválido' using errcode = 'P0001', hint = 'caminho_invalido';
  end if;
  if p_etiqueta is null or p_etiqueta not in ('Antes do jogo', '1º tempo', 'Intervalo', '2º tempo', 'Comemoração') then
    raise exception 'Escolha o momento do jogo' using errcode = 'P0001', hint = 'etiqueta_invalida';
  end if;
  if char_length(btrim(coalesce(p_legenda, ''))) > 80 then
    raise exception 'Legenda longa' using errcode = 'P0001', hint = 'legenda_longa';
  end if;
  if exists (select 1 from public.fotos_torcida f where f.partida_id = p_partida and f.autor_id = v_perfil.id and f.momento = v_janela) then
    raise exception 'Você já enviou a foto desta janela' using errcode = 'P0001', hint = 'ja_enviou';
  end if;
  insert into public.fotos_torcida (partida_id, clube_id, autor_id, autor_apelido, momento, etiqueta, caminho, legenda)
  values (p_partida, v_perfil.time_id, v_perfil.id, v_perfil.apelido, v_janela, p_etiqueta, p_caminho, btrim(coalesce(p_legenda, '')))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.registrar_foto(integer, text, text, text) from public, anon;
grant execute on function public.registrar_foto(integer, text, text, text) to authenticated;

/**
 * A galeria do jogo para a minha torcida: fotos não ocultas (e as minhas, mesmo ocultas), menos as que eu denunciei,
 * da mais curtida para a menos, com o meu joinha. Só membros; vazia para quem torce para outro time.
 */
create function public.fotos_do_jogo(p_partida integer)
returns table (
  id uuid,
  autor_apelido text,
  momento text,
  etiqueta text,
  caminho text,
  legenda text,
  curtidas integer,
  eu_curti boolean,
  minha boolean,
  criado_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (
    select p.id, p.time_id from public.perfis p where p.id = (select auth.uid()) and public.sou_assinante()
  )
  select f.id, f.autor_apelido, f.momento, f.etiqueta, f.caminho, f.legenda, f.curtidas,
    exists (select 1 from public.fotos_joinhas j where j.foto_id = f.id and j.usuario_id = eu.id),
    f.autor_id = eu.id,
    f.criado_em
  from public.fotos_torcida f
  join eu on f.clube_id = eu.time_id
  where f.partida_id = p_partida
    and (not f.oculta or f.autor_id = eu.id)
    and not exists (select 1 from public.fotos_denuncias d where d.foto_id = f.id and d.usuario_id = eu.id)
  order by f.curtidas desc, f.criado_em
$$;

revoke execute on function public.fotos_do_jogo(integer) from public, anon;
grant execute on function public.fotos_do_jogo(integer) to authenticated;
