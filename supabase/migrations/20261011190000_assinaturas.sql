-- Assinatura do torcedor, venha de onde vier: web app (Stripe), App Store ou Google Play (RevenueCat).
-- Só o servidor grava (webhooks com a service role); o torcedor lê as próprias linhas.
-- App e web app perguntam apenas `sou_assinante()`, sem se importar com onde a pessoa pagou.
create table public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  origem text not null check (origem in ('web', 'apple', 'google')),
  -- Id da assinatura no Stripe ou da transação original no RevenueCat; o webhook usa para atualizar a mesma linha.
  id_externo text not null check (char_length(id_externo) between 1 and 200),
  plano text not null check (plano in ('mensal', 'anual')),
  -- pendente: Pix gerado e ainda não pago. ativa: paga e renovando. atrasada: renovação falhou e a cobrança
  -- ainda está sendo tentada. cancelada: não renova, mas vale até expira_em. expirada: acabou.
  status text not null check (status in ('pendente', 'ativa', 'atrasada', 'cancelada', 'expirada')),
  expira_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint assinaturas_externo_unico unique (origem, id_externo),
  constraint assinaturas_validade check (status = 'pendente' or expira_em is not null)
);

create index assinaturas_usuario on public.assinaturas (usuario_id);

alter table public.assinaturas enable row level security;

create policy "Torcedor lê as próprias assinaturas" on public.assinaturas
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

revoke all on public.assinaturas from anon, authenticated;
grant select on public.assinaturas to authenticated;

create function public.assinaturas_antes_de_atualizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger assinaturas_antes_de_atualizar
  before update on public.assinaturas
  for each row execute function public.assinaturas_antes_de_atualizar();

-- Libera o conteúdo de assinante enquanto o período pago não acabou. Atrasada e cancelada continuam valendo
-- até expira_em: a primeira porque a cobrança ainda pode passar, a segunda porque já foi paga.
create function public.sou_assinante()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.assinaturas a
    where a.usuario_id = (select auth.uid())
      and a.status in ('ativa', 'atrasada', 'cancelada')
      and a.expira_em > now()
  );
$$;

revoke execute on function public.sou_assinante() from public, anon;
grant execute on function public.sou_assinante() to authenticated;
