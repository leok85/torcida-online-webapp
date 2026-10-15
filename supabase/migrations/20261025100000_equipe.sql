-- Contas separadas: a conta Google com e-mail @torcidaonline.com.br é só para o back-office
-- (torcida-online-admin); para torcer, a pessoa usa a conta pessoal. O Supabase Auth é o mesmo do webapp,
-- então a separação fica aqui no banco.
create function public.conta_corporativa(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(lower(p_email) like '%@torcidaonline.com.br', false);
$$;

-- Conta corporativa não vira torcedor: sem perfil. E só entra pelo Google; cadastro com
-- e-mail e senha usando o domínio é recusado (o webapp já avisa antes de enviar).
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
  if public.conta_corporativa(new.email) then
    if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google' then
      raise exception 'Conta corporativa só entra pelo Google.';
    end if;
    return new;
  end if;

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

-- Time interno do back-office: só quem está aqui entra no painel, com o papel que define os módulos visíveis.
-- Inclusão e troca de papel ficam com a service_role (SQL Editor ou, depois, a tela de Configurações).
create table public.equipe (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  papel text not null check (papel in ('super_admin', 'editor', 'moderador', 'analista')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.equipe enable row level security;

create policy "Membro da equipe lê o próprio papel" on public.equipe
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

revoke all on public.equipe from anon, authenticated;
grant select on public.equipe to authenticated;
grant select, insert, update, delete on public.equipe to service_role;

-- Só conta corporativa entra na equipe: a conta pessoal de torcedor nunca ganha acesso ao back-office.
create function public.equipe_antes_de_gravar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.conta_corporativa((select u.email from auth.users u where u.id = new.usuario_id)) then
    raise exception 'Só contas @torcidaonline.com.br entram na equipe.';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger equipe_antes_de_gravar
  before insert or update on public.equipe
  for each row execute function public.equipe_antes_de_gravar();
