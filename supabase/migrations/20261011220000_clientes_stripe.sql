-- Liga o torcedor ao Customer do Stripe. O webhook resolve o dono de cada assinatura por aqui
-- (subscription.customer → usuario_id), sem depender de metadata. Só as Edge Functions (service role) usam.
create table public.clientes_stripe (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  customer_id text not null unique check (customer_id like 'cus\_%'),
  criado_em timestamptz not null default now()
);

alter table public.clientes_stripe enable row level security;
revoke all on public.clientes_stripe from anon, authenticated;
