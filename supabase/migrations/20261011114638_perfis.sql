-- Perfil do torcedor: um por usuário do Supabase Auth, criado automaticamente no cadastro.
create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '' check (char_length(nome) <= 80),
  apelido text check (apelido ~ '^[A-Za-z0-9._]{3,20}$'),
  pais text check (pais ~ '^[A-Z]{2}$'),
  time_id text check (char_length(time_id) <= 40),
  nascimento date check (nascimento >= '1900-01-01'),
  cidade text check (char_length(cidade) <= 80),
  quer_avisos boolean not null default true,
  quer_novidades boolean not null default false,
  -- Preenchidas pelo servidor: os dois aceites obrigatórios (termos e 18+) e o fim do onboarding.
  termos_aceitos_em timestamptz,
  onboarding_concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint perfis_onboarding_completo check (
    onboarding_concluido_em is null
    or (apelido is not null and pais is not null and time_id is not null and termos_aceitos_em is not null)
  )
);

create unique index perfis_apelido_unico on public.perfis (lower(apelido));

alter table public.perfis enable row level security;

create policy "Torcedor lê o próprio perfil" on public.perfis
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "Torcedor edita o próprio perfil" on public.perfis
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;
grant update (
  nome, apelido, pais, time_id, nascimento, cidade, quer_avisos, quer_novidades,
  termos_aceitos_em, onboarding_concluido_em
) on public.perfis to authenticated;

-- O cliente só consegue marcar as datas de aceite e de onboarding uma vez, e o horário é sempre o do servidor.
create function public.perfis_antes_de_atualizar()
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
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger perfis_antes_de_atualizar
  before update on public.perfis
  for each row execute function public.perfis_antes_de_atualizar();

-- Cria o perfil a partir dos dados enviados no cadastro (options.data do signUp) ou do provedor social.
-- Apelido inválido ou já em uso não bloqueia o cadastro: fica vazio e o torcedor escolhe outro no onboarding.
create function public.criar_perfil_do_usuario()
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
begin
  if v_apelido !~ '^[A-Za-z0-9._]{3,20}$' then
    v_apelido := null;
  end if;

  begin
    insert into public.perfis (id, nome, apelido, quer_novidades, termos_aceitos_em)
    values (new.id, v_nome, v_apelido, v_novidades, v_termos);
  exception when unique_violation then
    insert into public.perfis (id, nome, apelido, quer_novidades, termos_aceitos_em)
    values (new.id, v_nome, null, v_novidades, v_termos);
  end;

  return new;
end;
$$;

revoke execute on function public.criar_perfil_do_usuario() from public, anon, authenticated;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_do_usuario();

-- Checagem de apelido em tempo real no cadastro (antes de existir sessão) e no onboarding.
-- O próprio apelido do torcedor logado conta como disponível.
create function public.apelido_disponivel(apelido text)
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
  );
$$;

revoke execute on function public.apelido_disponivel(text) from public;
grant execute on function public.apelido_disponivel(text) to anon, authenticated;
