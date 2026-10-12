-- Trocar de time (W22): uma única troca por conta depois do onboarding; o perfil fica marcado como vira-casaca.
-- O time anterior e a data da troca são do servidor: o torcedor só muda time_id, e o trigger registra o resto.
alter table public.perfis
  add column time_anterior_id integer references public.clubes (id),
  add column time_trocado_em timestamptz;

create or replace function public.perfis_antes_de_atualizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.termos_aceitos_em := case
    when old.termos_aceitos_em is not null then old.termos_aceitos_em
    when new.termos_aceitos_em is not null then now()
  end;
  new.onboarding_concluido_em := case
    when old.onboarding_concluido_em is not null then old.onboarding_concluido_em
    when new.onboarding_concluido_em is not null then now()
  end;
  new.apelido_anterior := old.apelido_anterior;
  new.apelido_alterado_em := old.apelido_alterado_em;
  if new.apelido is distinct from old.apelido then
    if new.apelido is not null and public.apelido_reservado(new.apelido, old.id) then
      raise exception 'Apelido reservado por outro torcedor' using errcode = 'P0001', hint = 'apelido_reservado';
    end if;
    -- A primeira escolha (cadastro ou onboarding) não conta como troca.
    if old.apelido is not null then
      if old.apelido_alterado_em > now() - interval '30 days' then
        raise exception 'Apelido trocado há menos de 30 dias' using errcode = 'P0001', hint = 'apelido_recente';
      end if;
      new.apelido_anterior := old.apelido;
      new.apelido_alterado_em := now();
    end if;
  end if;
  new.time_anterior_id := old.time_anterior_id;
  new.time_trocado_em := old.time_trocado_em;
  -- Escolher o time no onboarding é livre; depois dele, só uma troca em toda a conta.
  if new.time_id is distinct from old.time_id and old.onboarding_concluido_em is not null then
    if old.time_trocado_em is not null then
      raise exception 'A troca de time já foi usada' using errcode = 'P0001', hint = 'troca_usada';
    end if;
    new.time_anterior_id := old.time_id;
    new.time_trocado_em := now();
    -- Jogos, campeonatos e notícias seguem o país do clube novo.
    new.pais := coalesce((select c.pais from public.clubes c where c.id = new.time_id), new.pais);
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
