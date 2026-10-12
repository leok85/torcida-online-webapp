-- E-mail de cobrança (W18): o código de 6 dígitos que confirma um e-mail diferente do da conta.
-- Só a Edge Function gerenciar-assinatura (service_role) lê e grava; o código fica só como hash.
create table public.codigos_email_cobranca (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  codigo_hash text not null,
  tentativas smallint not null default 0,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);

alter table public.codigos_email_cobranca enable row level security;

revoke all on public.codigos_email_cobranca from anon, authenticated;
grant select, insert, update, delete on public.codigos_email_cobranca to service_role;
