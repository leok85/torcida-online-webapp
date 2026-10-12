-- Dados da conta (W21): foto do perfil, regra de troca do apelido, aparelhos conectados e exclusão com prazo.

-- Foto: caminho no bucket avatares, sempre dentro da pasta do próprio torcedor ("<id>/<arquivo>.webp").
-- Apelido: quando foi a última troca (a primeira escolha, no cadastro ou no onboarding, não conta).
-- Exclusão: a conta some de vez nessa data; até lá, entrar de novo permite desistir.
alter table public.perfis
  add column foto text,
  add column apelido_alterado_em timestamptz,
  add column exclusao_agendada_para timestamptz,
  add constraint perfis_foto_na_pasta_do_torcedor check (foto ~ ('^' || id::text || '/[a-z0-9-]{1,60}\.(webp|jpg)$'));

grant update (foto) on public.perfis to authenticated;

-- Uma troca de apelido a cada 30 dias. A data da troca é sempre a do servidor.
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
  if new.apelido is distinct from old.apelido and old.apelido is not null then
    if old.apelido_alterado_em > now() - interval '30 days' then
      raise exception 'Apelido trocado há menos de 30 dias' using errcode = 'P0001', hint = 'apelido_recente';
    end if;
    new.apelido_alterado_em := now();
  else
    new.apelido_alterado_em := old.apelido_alterado_em;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

-- Fotos do perfil: leitura pública; cada torcedor só grava e apaga na própria pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Torcedor vê os arquivos da própria foto" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Torcedor envia a própria foto" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Torcedor apaga a própria foto" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Aparelhos conectados: as sessões do Supabase Auth do torcedor, com a atual primeiro.
create function public.meus_aparelhos()
returns table (id uuid, user_agent text, criado_em timestamptz, usado_em timestamptz, atual boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.user_agent,
    s.created_at,
    coalesce(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at),
    s.id::text = (select auth.jwt() ->> 'session_id')
  from auth.sessions s
  where s.user_id = (select auth.uid())
    and (s.not_after is null or s.not_after > now())
  order by 5 desc, 4 desc;
$$;

-- Encerra outra sessão do torcedor. A atual sai pelo "Sair" normal.
-- O token de acesso daquele aparelho ainda vale até expirar (até 1 h), mas ele não renova mais.
create function public.encerrar_aparelho(sessao uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.sessions s
  where s.id = sessao
    and s.user_id = (select auth.uid())
    and s.id::text is distinct from (select auth.jwt() ->> 'session_id');
  return found;
end;
$$;

-- Desiste da exclusão agendada. A assinatura do web app, encerrada no pedido, não volta.
create function public.manter_minha_conta()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.perfis set exclusao_agendada_para = null where id = (select auth.uid());
$$;

revoke execute on function public.meus_aparelhos() from public, anon;
revoke execute on function public.encerrar_aparelho(uuid) from public, anon;
revoke execute on function public.manter_minha_conta() from public, anon;
grant execute on function public.meus_aparelhos() to authenticated;
grant execute on function public.encerrar_aparelho(uuid) to authenticated;
grant execute on function public.manter_minha_conta() to authenticated;

-- Se o torcedor tem senha. Quem entrou só pelo Google ou pela Apple não tem, e o botão vira "Criar senha".
-- (A identidade "email" não basta: criar a senha depois não cria essa identidade.)
create function public.tenho_senha()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.encrypted_password is not null and u.encrypted_password <> '' from auth.users u where u.id = (select auth.uid())), false);
$$;

revoke execute on function public.tenho_senha() from public, anon;
grant execute on function public.tenho_senha() to authenticated;

-- Apaga de vez as contas com o prazo vencido, uma vez por dia (06:30 em Brasília).
-- Usa o mesmo segredo do Vault das outras chamadas do pg_cron.
create function public.chamar_excluir_contas_vencidas()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://rtgsbxsscwumcfpcytzq.supabase.co/functions/v1/excluir-conta',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'sincronizar_partidas_segredo')
    ),
    body := '{"modo": "vencidas"}'::jsonb,
    timeout_milliseconds := 120000
  );
$$;

revoke execute on function public.chamar_excluir_contas_vencidas() from public, anon, authenticated;

select cron.schedule('excluir-contas-vencidas', '30 9 * * *', $$select public.chamar_excluir_contas_vencidas()$$);
