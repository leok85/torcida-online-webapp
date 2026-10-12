-- Ajustes de Dados da conta (W21) para seguir o Claude Design:
-- 1. O apelido anterior fica reservado por 30 dias depois de uma troca: ninguém mais pode usá-lo nesse período.
-- 2. A linha da senha mostra quando ela foi alterada ("Alterada há 4 meses").

alter table public.perfis
  add column apelido_anterior text,
  add column senha_alterada_em timestamptz;

-- Reservado = apelido que outro torcedor deixou há menos de 30 dias.
create function public.apelido_reservado(apelido text, exceto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfis p
    where lower(p.apelido_anterior) = lower(btrim(apelido_reservado.apelido))
      and p.apelido_alterado_em > now() - interval '30 days'
      and p.id is distinct from exceto
  );
$$;

revoke execute on function public.apelido_reservado(text, uuid) from public, anon, authenticated;

create or replace function public.apelido_disponivel(apelido text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.perfis p
    where lower(p.apelido) = lower(btrim(apelido_disponivel.apelido))
      and p.id is distinct from (select auth.uid())
  )
  and not public.apelido_reservado(apelido_disponivel.apelido, (select auth.uid()));
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
  new.atualizado_em := now();
  return new;
end;
$$;

-- Cadastro: além do que já fazia, não deixa usar um apelido reservado e marca a data da senha.
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
begin
  if v_apelido !~ '^[A-Za-z0-9._]{3,20}$' or public.apelido_reservado(v_apelido, null) then
    v_apelido := null;
  end if;

  begin
    insert into public.perfis (id, nome, apelido, quer_novidades, termos_aceitos_em, senha_alterada_em)
    values (new.id, v_nome, v_apelido, v_novidades, v_termos, v_senha);
  exception when unique_violation then
    insert into public.perfis (id, nome, apelido, quer_novidades, termos_aceitos_em, senha_alterada_em)
    values (new.id, v_nome, null, v_novidades, v_termos, v_senha);
  end;

  return new;
end;
$$;

-- Troca ou criação de senha (inclusive pela recuperação): grava a data no perfil.
create function public.registrar_troca_de_senha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.encrypted_password, '') <> '' and new.encrypted_password is distinct from old.encrypted_password then
    -- O torcedor não tem permissão de update nessa coluna: só este trigger grava.
    update public.perfis set senha_alterada_em = now() where id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.registrar_troca_de_senha() from public, anon, authenticated;

create trigger ao_trocar_senha
  after update of encrypted_password on auth.users
  for each row execute function public.registrar_troca_de_senha();

-- Contas que já têm senha: sem histórico, vale a data do cadastro.
update public.perfis p
set senha_alterada_em = u.created_at
from auth.users u
where u.id = p.id and coalesce(u.encrypted_password, '') <> '' and p.senha_alterada_em is null;

-- A tela usa a data no perfil; "tem senha" vira senha_alterada_em preenchida.
drop function public.tenho_senha();
