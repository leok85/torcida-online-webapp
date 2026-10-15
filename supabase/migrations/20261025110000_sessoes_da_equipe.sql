-- Meu perfil (back-office): o membro da equipe vê os aparelhos com sessão aberta e encerra os outros.
-- O cliente não lê auth.sessions; estas funções expõem só as sessões da própria conta.

create function public.minhas_sessoes()
returns table (id uuid, navegador text, ip text, ativa_em timestamptz, atual boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.user_agent,
    host(s.ip),
    greatest(s.updated_at, s.refreshed_at at time zone 'UTC', s.created_at),
    s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
  from auth.sessions s
  where s.user_id = (select auth.uid())
    and (s.not_after is null or s.not_after > now())
    and exists (select 1 from public.equipe e where e.usuario_id = (select auth.uid()))
  order by 4 desc;
$$;

-- Apagar a sessão invalida o refresh token; o token de acesso já emitido vale até expirar (até 1 h).
-- A sessão atual não sai por aqui: para ela, o botão é "Sair do back-office".
create function public.encerrar_sessao(p_sessao uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions s
  where s.id = p_sessao
    and s.user_id = (select auth.uid())
    and s.id is distinct from nullif(auth.jwt() ->> 'session_id', '')::uuid;
$$;

revoke all on function public.minhas_sessoes() from public, anon;
revoke all on function public.encerrar_sessao(uuid) from public, anon;
grant execute on function public.minhas_sessoes() to authenticated;
grant execute on function public.encerrar_sessao(uuid) to authenticated;
