-- Convidar amigos: quem convidou cada torcedor, os convites mandados por e-mail e as consultas do modal.
-- O código de convite é o apelido (link /r/APELIDO). O convite conta quando o amigo conclui o onboarding
-- (escolhe o clube); o XP dos dois e a fatia do convidador ficam para o sistema de XP, que lê convite_contou_em.

alter table public.perfis
  add column convidado_por uuid references public.perfis (id) on delete set null,
  add column convite_contou_em timestamptz;

create index perfis_convidado_por on public.perfis (convidado_por) where convidado_por is not null;
-- Nenhuma das duas entra no grant update de authenticated: só aplicar_convite() e o trigger mexem nelas.

/** Dono de um código de convite: o apelido atual ou, para links antigos, o apelido anterior. */
create function public.dono_do_convite(codigo text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.perfis p
  where p.onboarding_concluido_em is not null
    and p.exclusao_agendada_para is null
    and (lower(p.apelido) = lower(btrim(codigo)) or lower(p.apelido_anterior) = lower(btrim(codigo)))
  order by (lower(p.apelido) = lower(btrim(codigo))) desc
  limit 1
$$;

revoke execute on function public.dono_do_convite(text) from public, anon, authenticated;

-- Cadastro pelo link: o apelido de quem convidou vem em raw_user_meta_data.convite.
create or replace function public.criar_perfil_do_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dados jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_nome text := left(btrim(coalesce(v_dados ->> 'nome', v_dados ->> 'full_name', v_dados ->> 'name', '')), 80);
  v_apelido text := nullif(btrim(v_dados ->> 'apelido'), '');
  v_novidades boolean := coalesce(v_dados ->> 'quer_novidades' = 'true', false);
  v_termos timestamptz := case when v_dados ->> 'aceitou_termos' = 'true' then now() end;
  v_senha timestamptz := case when coalesce(new.encrypted_password, '') <> '' then now() end;
  v_convidado_por uuid := public.dono_do_convite(left(coalesce(v_dados ->> 'convite', ''), 20));
begin
  if v_apelido !~ '^[A-Za-z0-9._]{3,20}$' or public.apelido_reservado(v_apelido, null) then
    v_apelido := null;
  end if;

  begin
    insert into public.perfis (id, nome, apelido, quer_novidades, termos_aceitos_em, senha_alterada_em, convidado_por)
    values (new.id, v_nome, v_apelido, v_novidades, v_termos, v_senha, v_convidado_por);
  exception when unique_violation then
    insert into public.perfis (id, nome, apelido, quer_novidades, termos_aceitos_em, senha_alterada_em, convidado_por)
    values (new.id, v_nome, null, v_novidades, v_termos, v_senha, v_convidado_por);
  end;

  return new;
end;
$$;

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
  -- O convite conta uma vez só, quando o convidado conclui o onboarding.
  new.convite_contou_em := old.convite_contou_em;
  if old.onboarding_concluido_em is null and new.onboarding_concluido_em is not null and new.convidado_por is not null then
    new.convite_contou_em := now();
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

-- Convites mandados por e-mail pelo modal. Só a Edge Function convidar-amigos (service_role) grava.
create table public.convites_email (
  convidador uuid not null references public.perfis (id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email = lower(email)),
  mensagem text check (char_length(mensagem) <= 280),
  enviado_em timestamptz not null default now(),
  reenviado_em timestamptz,
  primary key (convidador, email)
);

alter table public.convites_email enable row level security;

revoke all on public.convites_email from anon, authenticated;
grant select, insert, update, delete on public.convites_email to service_role;

/** Limite de e-mails de convite por dia (envios e reenvios), no fuso de Brasília. */
create function public.convites_enviados_hoje(p_convidador uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    count(*) filter (where (c.enviado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date)
    + count(*) filter (where (c.reenviado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date)
  )::integer
  from public.convites_email c
  where c.convidador = p_convidador
$$;

revoke execute on function public.convites_enviados_hoje(uuid) from public, anon, authenticated;

/** Quantos convites por e-mail o torcedor logado ainda pode mandar hoje (de 10). */
create function public.convites_restantes()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, 10 - public.convites_enviados_hoje((select auth.uid())))
$$;

revoke execute on function public.convites_restantes() from public, anon;
grant execute on function public.convites_restantes() to authenticated;

/** Dados do convite de quem chamou, para a página /r/APELIDO (antes de ter conta). */
create function public.convite_de(codigo text)
returns table (apelido text, clube text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.apelido, c.nome
  from public.perfis p
  left join public.clubes c on c.id = p.time_id
  where p.id = public.dono_do_convite(left(codigo, 20))
$$;

revoke execute on function public.convite_de(text) from public;
grant execute on function public.convite_de(text) to anon, authenticated;

/** Apelido de quem convidou o torcedor logado (null sem convite). */
create function public.meu_convidador()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.apelido
  from public.perfis p
  join public.perfis c on c.id = p.convidado_por
  where p.id = (select auth.uid())
$$;

revoke execute on function public.meu_convidador() from public, anon;
grant execute on function public.meu_convidador() to authenticated;

-- "Veio de um convite?" nas boas-vindas, e o link /r/ de quem entrou pelo Google. Só antes de escolher o clube;
-- se já houver convidador, não troca e devolve o atual.
create function public.aplicar_convite(codigo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu public.perfis%rowtype;
  v_dono uuid;
begin
  select * into v_eu from public.perfis where id = (select auth.uid());
  if not found then
    raise exception 'Sem perfil' using errcode = 'P0001', hint = 'sem_perfil';
  end if;
  if v_eu.convidado_por is not null then
    return public.meu_convidador();
  end if;
  if v_eu.onboarding_concluido_em is not null then
    raise exception 'O convite só vale antes de escolher o clube' using errcode = 'P0001', hint = 'convite_encerrado';
  end if;
  v_dono := public.dono_do_convite(left(coalesce(codigo, ''), 20));
  if v_dono is null then
    raise exception 'Convite não encontrado' using errcode = 'P0001', hint = 'convite_nao_encontrado';
  end if;
  if v_dono = v_eu.id then
    raise exception 'Não dá para usar o próprio convite' using errcode = 'P0001', hint = 'convite_proprio';
  end if;
  update public.perfis set convidado_por = v_dono where id = v_eu.id;
  return public.meu_convidador();
end;
$$;

revoke execute on function public.aplicar_convite(text) from public, anon;
grant execute on function public.aplicar_convite(text) to authenticated;

-- "Seus convidados": quem entrou pelo convite (ativo = já escolheu o clube) e os e-mails que ainda não criaram conta.
create function public.meus_convidados()
returns table (chave text, nome text, estado text, reenviado boolean, desde timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select p.id::text, coalesce(p.apelido, 'Novo torcedor'),
      case when p.onboarding_concluido_em is not null then 'ativo' else 'sem_time' end,
      false, coalesce(p.convite_contou_em, p.criado_em)
    from public.perfis p
    where p.convidado_por = (select auth.uid())
    union all
    select c.email, c.email, 'pendente', c.reenviado_em is not null, c.enviado_em
    from public.convites_email c
    where c.convidador = (select auth.uid())
      and not exists (
        select 1 from public.perfis p join auth.users u on u.id = p.id
        where p.convidado_por = c.convidador and lower(u.email) = c.email
      )
  ) t (chave, nome, estado, reenviado, desde)
  order by case t.estado when 'ativo' then 0 when 'sem_time' then 1 else 2 end, t.desde desc
$$;

revoke execute on function public.meus_convidados() from public, anon;
grant execute on function public.meus_convidados() to authenticated;

-- ---------- só a Edge Function convidar-amigos (service_role) ----------

/** Grava os convites antes do envio e devolve o que vai no e-mail. Erros: sem_apelido, ja_convidado, limite_diario. */
create function public.registrar_convites(p_convidador uuid, p_emails text[], p_mensagem text)
returns table (apelido text, clube text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_repetido text;
begin
  if not exists (select 1 from public.perfis p where p.id = p_convidador and p.apelido is not null and p.onboarding_concluido_em is not null) then
    raise exception 'Sem apelido' using errcode = 'P0001', hint = 'sem_apelido';
  end if;
  select e into v_repetido from unnest(p_emails) e
  where exists (select 1 from public.convites_email c where c.convidador = p_convidador and c.email = e)
  limit 1;
  if v_repetido is not null then
    raise exception '% já recebeu convite', v_repetido using errcode = 'P0001', hint = 'ja_convidado', detail = v_repetido;
  end if;
  if public.convites_enviados_hoje(p_convidador) + cardinality(p_emails) > 10 then
    raise exception 'Limite de convites do dia' using errcode = 'P0001', hint = 'limite_diario';
  end if;
  insert into public.convites_email (convidador, email, mensagem)
  select p_convidador, e, nullif(btrim(p_mensagem), '') from unnest(p_emails) e;
  return query
    select p.apelido, c.nome from public.perfis p left join public.clubes c on c.id = p.time_id where p.id = p_convidador;
end;
$$;

/** Marca o reenvio (uma vez por convite). Erros: nao_convidado, ja_reenviado, limite_diario. */
create function public.registrar_reenvio(p_convidador uuid, p_email text)
returns table (apelido text, clube text, mensagem text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite public.convites_email%rowtype;
begin
  select * into v_convite from public.convites_email c where c.convidador = p_convidador and c.email = p_email for update;
  if not found then
    raise exception 'Convite não encontrado' using errcode = 'P0001', hint = 'nao_convidado';
  end if;
  if v_convite.reenviado_em is not null then
    raise exception 'Convite já reenviado' using errcode = 'P0001', hint = 'ja_reenviado';
  end if;
  if public.convites_enviados_hoje(p_convidador) + 1 > 10 then
    raise exception 'Limite de convites do dia' using errcode = 'P0001', hint = 'limite_diario';
  end if;
  update public.convites_email c set reenviado_em = now() where c.convidador = p_convidador and c.email = p_email;
  return query
    select p.apelido, c.nome, v_convite.mensagem from public.perfis p left join public.clubes c on c.id = p.time_id where p.id = p_convidador;
end;
$$;

/** Desfaz o registro quando o e-mail não sai, para não gastar o limite nem marcar como enviado. */
create function public.desfazer_convites(p_convidador uuid, p_emails text[], p_reenvio boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.convites_email c set reenviado_em = null
  where p_reenvio and c.convidador = p_convidador and c.email = any (p_emails);
  delete from public.convites_email c
  where not p_reenvio and c.convidador = p_convidador and c.email = any (p_emails);
$$;

revoke execute on function public.registrar_convites(uuid, text[], text) from public, anon, authenticated;
revoke execute on function public.registrar_reenvio(uuid, text) from public, anon, authenticated;
revoke execute on function public.desfazer_convites(uuid, text[], boolean) from public, anon, authenticated;
grant execute on function public.registrar_convites(uuid, text[], text) to service_role;
grant execute on function public.registrar_reenvio(uuid, text) to service_role;
grant execute on function public.desfazer_convites(uuid, text[], boolean) to service_role;
