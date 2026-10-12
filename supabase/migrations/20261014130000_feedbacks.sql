-- Enviar feedback (W23): problema, sugestão ou elogio, com a área do app, print opcional e dados do navegador.
-- O torcedor vê o andamento dos próprios envios; estado e resposta são da equipe (pelo painel, com service_role).
create table public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('problema', 'sugestao', 'elogio')),
  area text not null check (area in ('inicio', 'jogo', 'palpite', 'missoes', 'ranking', 'loja', 'assinatura', 'conta', 'outro')),
  texto text not null check (char_length(btrim(texto)) between 10 and 1000),
  -- Print da tela no bucket feedback, na pasta do torcedor.
  anexo text,
  -- Navegador, sistema, tamanho da tela e a última tela aberta, quando o torcedor deixa enviar.
  dados_navegador jsonb,
  pode_responder boolean not null default false,
  -- E-mail da conta no momento do envio, só quando o torcedor aceita resposta.
  email text,
  estado text not null default 'recebido' check (estado in ('recebido', 'analise', 'implementado', 'resolvido')),
  resposta text,
  -- XP que o envio rendeu: +50 nos 2 primeiros envios da semana (segunda a domingo, horário de Brasília).
  xp integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint feedbacks_anexo_na_pasta check (anexo ~ ('^' || usuario_id::text || '/[a-z0-9-]{1,60}\.(png|jpg|webp)$'))
);

create index feedbacks_usuario on public.feedbacks (usuario_id, criado_em desc);

alter table public.feedbacks enable row level security;

create policy "Torcedor vê os próprios envios" on public.feedbacks
  for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy "Torcedor envia feedback" on public.feedbacks
  for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

revoke all on public.feedbacks from anon, authenticated;
grant select on public.feedbacks to authenticated;
grant insert (tipo, area, texto, anexo, dados_navegador, pode_responder) on public.feedbacks to authenticated;
grant select, insert, update, delete on public.feedbacks to service_role;

-- Segunda-feira 00:00 em Brasília da semana atual: quando o limite de XP renova.
create function public.inicio_da_semana()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
$$;

-- Quem envia, e-mail, estado inicial e XP são do servidor; um limite de 10 envios por dia segura abusos.
create function public.feedbacks_antes_de_inserir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if (select count(*) from public.feedbacks f where f.usuario_id = v_usuario and f.criado_em > now() - interval '1 day') >= 10 then
    raise exception 'Muitos envios hoje' using errcode = 'P0001', hint = 'limite_diario';
  end if;
  new.usuario_id := v_usuario;
  new.texto := btrim(new.texto);
  new.estado := 'recebido';
  new.resposta := null;
  new.email := case when new.pode_responder then (select u.email from auth.users u where u.id = v_usuario) end;
  new.xp := case
    when (select count(*) from public.feedbacks f where f.usuario_id = v_usuario and f.xp > 0 and f.criado_em >= public.inicio_da_semana()) < 2 then 50
    else 0
  end;
  new.criado_em := now();
  new.atualizado_em := now();
  return new;
end;
$$;

revoke execute on function public.feedbacks_antes_de_inserir() from public, anon, authenticated;

create trigger feedbacks_antes_de_inserir
  before insert on public.feedbacks
  for each row execute function public.feedbacks_antes_de_inserir();

create function public.feedbacks_antes_de_atualizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger feedbacks_antes_de_atualizar
  before update on public.feedbacks
  for each row execute function public.feedbacks_antes_de_atualizar();

-- Prints dos envios: privados; o torcedor só grava e lê na própria pasta, a equipe lê pelo painel.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Torcedor vê os próprios prints" on storage.objects
  for select to authenticated
  using (bucket_id = 'feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Torcedor envia print do feedback" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);
