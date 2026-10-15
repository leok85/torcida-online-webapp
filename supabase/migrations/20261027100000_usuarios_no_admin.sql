-- Usuários no back-office (torcida-online-admin, tela Usuários): lista e perfil dos torcedores com dados reais e as
-- restrições da moderação. Silenciar impede mensagens no chat e fotos; suspender bloqueia o login (auth.users.banned_until,
-- que o Supabase Auth respeita no login e na renovação do token) e derruba as sessões abertas.
-- Só super admin e moderador veem e agem; contas da equipe não têm perfil e não aparecem.

-- ---------- equipe ----------
/** Barra quem não pode mexer em Usuários (super admin e moderador). */
create function public.exigir_moderador()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.papel_na_equipe(), '') not in ('super_admin', 'moderador') then
    raise exception 'Só super admin e moderador mexem em Usuários' using errcode = '42501', hint = 'sem_permissao';
  end if;
end;
$$;

revoke execute on function public.exigir_moderador() from public, anon, authenticated;

-- ---------- restrições ----------
create table public.restricoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  tipo text not null check (tipo in ('silencio', 'suspensao')),
  motivo text check (char_length(motivo) <= 200),
  ate timestamptz not null,
  aplicada_por uuid references auth.users (id) on delete set null,
  aplicada_em timestamptz not null default now(),
  encerrada_em timestamptz,
  encerrada_por uuid references auth.users (id) on delete set null,
  constraint restricoes_janela check (ate > aplicada_em)
);

create index restricoes_do_torcedor on public.restricoes (usuario_id, aplicada_em desc);

alter table public.restricoes enable row level security;
revoke all on public.restricoes from anon, authenticated;
grant select, insert, update, delete on public.restricoes to service_role;

/** Restrição em vigor desse tipo (a que vence por último), ou null. */
create function public.restricao_em_vigor(p_usuario uuid, p_tipo text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(r.ate) from public.restricoes r
  where r.usuario_id = p_usuario and r.tipo = p_tipo and r.encerrada_em is null and r.ate > now();
$$;

revoke execute on function public.restricao_em_vigor(uuid, text) from public, anon, authenticated;

/**
 * Barra quem está restrito, antes de gravar. Suspenso não faz nada (o login já está bloqueado; isto cobre o token de
 * acesso que ainda vale até 1 h). Silenciado, nas tabelas marcadas com 'silencio', não publica (chat e fotos).
 */
create function public.barrar_restrito()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_ate timestamptz;
begin
  if v_usuario is null then
    return new;
  end if;
  if public.restricao_em_vigor(v_usuario, 'suspensao') is not null then
    raise exception 'Conta suspensa' using errcode = 'P0001', hint = 'suspenso';
  end if;
  if 'silencio' = any(tg_argv) then
    v_ate := public.restricao_em_vigor(v_usuario, 'silencio');
    if v_ate is not null then
      raise exception 'Você está silenciado até %', to_char(v_ate at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
        using errcode = 'P0001', hint = 'silenciado';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.barrar_restrito() from public, anon, authenticated;

create trigger barrar_restrito
  before insert on public.mensagens_chat
  for each row execute function public.barrar_restrito('silencio');

create trigger barrar_restrito
  before insert on public.fotos_torcida
  for each row execute function public.barrar_restrito('silencio');

create trigger barrar_restrito
  before insert or update on public.palpites
  for each row execute function public.barrar_restrito();

create trigger barrar_restrito
  before insert or update on public.notas_jogadores
  for each row execute function public.barrar_restrito();

create trigger barrar_restrito
  before insert on public.fotos_joinhas
  for each row execute function public.barrar_restrito();

create trigger barrar_restrito
  before insert on public.fotos_denuncias
  for each row execute function public.barrar_restrito();

create trigger barrar_restrito
  before insert on public.feedbacks
  for each row execute function public.barrar_restrito();

/**
 * Status do torcedor no back-office: suspenso e silenciado vêm das restrições em vigor; novo é quem se cadastrou há
 * menos de 7 dias; o resto é ativo.
 */
create function public.status_do_torcedor(p_usuario uuid, p_cadastro timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.restricao_em_vigor(p_usuario, 'suspensao') is not null then 'suspenso'
    when public.restricao_em_vigor(p_usuario, 'silencio') is not null then 'silenciado'
    when p_cadastro > now() - interval '7 days' then 'novo'
    else 'ativo'
  end;
$$;

revoke execute on function public.status_do_torcedor(uuid, timestamptz) from public, anon, authenticated;

-- ---------- leitura ----------
/** Os quatro números do topo da tela. Ativa = entrou ou renovou a sessão nos últimos 7 dias. */
create function public.admin_usuarios_resumo()
returns table (total bigint, ativas_7d bigint, com_restricao bigint, novas_semana bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_moderador();
  return query
    select
      (select count(*) from public.perfis),
      (select count(*) from public.perfis p join auth.users u on u.id = p.id
        where u.last_sign_in_at > now() - interval '7 days'
          or exists (select 1 from auth.sessions s where s.user_id = p.id
            and greatest(s.updated_at, s.refreshed_at at time zone 'UTC') > now() - interval '7 days')),
      (select count(distinct r.usuario_id) from public.restricoes r where r.encerrada_em is null and r.ate > now()),
      (select count(*) from public.perfis p where p.criado_em >= public.inicio_da_semana());
end;
$$;

revoke execute on function public.admin_usuarios_resumo() from public, anon;
grant execute on function public.admin_usuarios_resumo() to authenticated;

/**
 * Lista paginada de torcedores, do cadastro mais recente para o mais antigo. Aba: todos, ativos, restritos, novos.
 * A busca casa apelido, nome ou e-mail. `total` repete em cada linha o total do filtro (para a paginação).
 */
create function public.admin_usuarios(p_aba text default 'todos', p_busca text default null, p_limite integer default 25, p_deslocamento integer default 0)
returns table (
  id uuid, apelido text, nome text, email text, pais text, clube_id integer, clube text, xp bigint, nivel integer,
  cadastro timestamptz, ultimo_acesso timestamptz, status text, restricao_ate timestamptz, total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_busca text := '%' || lower(btrim(coalesce(p_busca, ''))) || '%';
begin
  perform public.exigir_moderador();
  return query
    with base as (
      select p.id, p.apelido, p.nome, u.email::text as email, p.pais, p.time_id, c.nome as clube, p.criado_em,
        u.last_sign_in_at, public.status_do_torcedor(p.id, p.criado_em) as status
      from public.perfis p
      join auth.users u on u.id = p.id
      left join public.clubes c on c.id = p.time_id
      where btrim(coalesce(p_busca, '')) = ''
        or lower(coalesce(p.apelido, '')) like v_busca or lower(p.nome) like v_busca or lower(u.email) like v_busca
    ),
    filtrados as (
      select b.* from base b
      where case coalesce(p_aba, 'todos')
        when 'ativos' then b.status = 'ativo'
        when 'restritos' then b.status in ('suspenso', 'silenciado')
        when 'novos' then b.status = 'novo'
        else true
      end
    ),
    pagina as (
      select f.*, count(*) over () as total from filtrados f
      order by f.criado_em desc, f.id
      limit least(greatest(coalesce(p_limite, 25), 1), 5000) offset greatest(coalesce(p_deslocamento, 0), 0)
    )
    select pg.id, pg.apelido, pg.nome, pg.email, pg.pais, pg.time_id, pg.clube,
      coalesce(x.xp, 0), n.nivel, pg.criado_em,
      greatest(pg.last_sign_in_at, (select max(greatest(s.updated_at, s.refreshed_at at time zone 'UTC')) from auth.sessions s where s.user_id = pg.id)),
      pg.status,
      case pg.status
        when 'suspenso' then public.restricao_em_vigor(pg.id, 'suspensao')
        when 'silenciado' then public.restricao_em_vigor(pg.id, 'silencio')
      end,
      pg.total
    from pagina pg
    left join lateral (select sum(l.xp) as xp from public.xp_lancamentos l where l.usuario_id = pg.id) x on true
    cross join lateral public.nivel_do_xp(coalesce(x.xp, 0)) n
    order by pg.criado_em desc, pg.id;
end;
$$;

revoke execute on function public.admin_usuarios(text, text, integer, integer) from public, anon;
grant execute on function public.admin_usuarios(text, text, integer, integer) to authenticated;

/**
 * Perfil completo de um torcedor para a gaveta do back-office: dados da conta, assinatura, números de atividade,
 * restrições (em vigor e passadas) e os últimos lançamentos de XP.
 */
create function public.admin_usuario(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  perform public.exigir_moderador();
  select jsonb_build_object(
    'id', p.id,
    'apelido', p.apelido,
    'nome', p.nome,
    'email', u.email,
    'pais', p.pais,
    'cidade', p.cidade,
    'clube', c.nome,
    'cadastro', p.criado_em,
    'onboarding_concluido_em', p.onboarding_concluido_em,
    'ultimo_acesso', greatest(u.last_sign_in_at, (select max(greatest(s.updated_at, s.refreshed_at at time zone 'UTC')) from auth.sessions s where s.user_id = p.id)),
    'provedor', u.raw_app_meta_data ->> 'provider',
    'status', public.status_do_torcedor(p.id, p.criado_em),
    'xp', coalesce(x.xp, 0),
    'nivel', n.nivel,
    'convidado_por', (select cp.apelido from public.perfis cp where cp.id = p.convidado_por),
    'assinatura', (
      select jsonb_build_object('plano', a.plano, 'status', a.status, 'origem', a.origem, 'expira_em', a.expira_em, 'desde', a.criado_em)
      from public.assinaturas a where a.usuario_id = p.id
      order by (a.status in ('ativa', 'atrasada', 'cancelada') and a.expira_em > now()) desc, a.criado_em desc
      limit 1
    ),
    'metricas', jsonb_build_object(
      'sessoes_ativas', (select count(*) from auth.sessions s where s.user_id = p.id and (s.not_after is null or s.not_after > now())),
      'palpites', (select count(*) from public.palpites pp where pp.usuario_id = p.id),
      'mensagens', (select count(*) from public.mensagens_chat m where m.autor_id = p.id),
      'fotos', (select count(*) from public.fotos_torcida f where f.autor_id = p.id),
      'convites', (select count(*) from public.perfis cv where cv.convidado_por = p.id and cv.convite_contou_em is not null),
      'denuncias', (select count(*) from public.fotos_denuncias d join public.fotos_torcida f on f.id = d.foto_id where f.autor_id = p.id)
    ),
    'restricoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'tipo', r.tipo, 'motivo', r.motivo, 'ate', r.ate, 'aplicada_em', r.aplicada_em, 'encerrada_em', r.encerrada_em,
        'em_vigor', r.encerrada_em is null and r.ate > now(),
        'aplicada_por', coalesce(ap.raw_user_meta_data ->> 'full_name', ap.raw_user_meta_data ->> 'name', ap.email)
      ) order by r.aplicada_em desc)
      from public.restricoes r left join auth.users ap on ap.id = r.aplicada_por
      where r.usuario_id = p.id
    ), '[]'::jsonb),
    'extrato', coalesce((
      select jsonb_agg(e order by e.criado_em desc) from (
        select l.acao, coalesce(rg.rotulo, case when l.acao = 'missao' then 'Missão concluída' end) as rotulo,
          coalesce(rg.icone, 'flag') as icone, l.xp, l.detalhe, l.criado_em
        from public.xp_lancamentos l left join public.xp_regras rg on rg.acao = l.acao
        where l.usuario_id = p.id
        order by l.criado_em desc limit 12
      ) e
    ), '[]'::jsonb)
  ) into v_resultado
  from public.perfis p
  join auth.users u on u.id = p.id
  left join public.clubes c on c.id = p.time_id
  left join lateral (select sum(l.xp) as xp from public.xp_lancamentos l where l.usuario_id = p.id) x on true
  cross join lateral public.nivel_do_xp(coalesce(x.xp, 0)) n
  where p.id = p_id;

  if v_resultado is null then
    raise exception 'Torcedor não encontrado' using errcode = 'P0001', hint = 'torcedor_inexistente';
  end if;
  return v_resultado;
end;
$$;

revoke execute on function public.admin_usuario(uuid) from public, anon;
grant execute on function public.admin_usuario(uuid) to authenticated;

-- ---------- ações ----------
/** Silencia por p_horas (1 a 720): sem chat e sem fotos até lá. */
create function public.silenciar_usuario(p_usuario uuid, p_horas integer, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_moderador();
  if p_horas is null or p_horas not between 1 and 720 then
    raise exception 'Duração inválida' using errcode = 'P0001', hint = 'duracao_invalida';
  end if;
  if not exists (select 1 from public.perfis p where p.id = p_usuario) then
    raise exception 'Torcedor não encontrado' using errcode = 'P0001', hint = 'torcedor_inexistente';
  end if;
  insert into public.restricoes (usuario_id, tipo, motivo, ate, aplicada_por)
  values (p_usuario, 'silencio', nullif(btrim(p_motivo), ''), now() + make_interval(hours => p_horas), (select auth.uid()));
end;
$$;

revoke execute on function public.silenciar_usuario(uuid, integer, text) from public, anon;
grant execute on function public.silenciar_usuario(uuid, integer, text) to authenticated;

/** Suspende por p_dias (1 a 365): bloqueia o login e encerra as sessões abertas. */
create function public.suspender_usuario(p_usuario uuid, p_dias integer, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ate timestamptz := now() + make_interval(days => p_dias);
begin
  perform public.exigir_moderador();
  if p_dias is null or p_dias not between 1 and 365 then
    raise exception 'Duração inválida' using errcode = 'P0001', hint = 'duracao_invalida';
  end if;
  if not exists (select 1 from public.perfis p where p.id = p_usuario) then
    raise exception 'Torcedor não encontrado' using errcode = 'P0001', hint = 'torcedor_inexistente';
  end if;
  insert into public.restricoes (usuario_id, tipo, motivo, ate, aplicada_por)
  values (p_usuario, 'suspensao', nullif(btrim(p_motivo), ''), v_ate, (select auth.uid()));
  update auth.users set banned_until = greatest(coalesce(banned_until, v_ate), v_ate) where id = p_usuario;
  -- O token de acesso já emitido vale até expirar (até 1 h); sem sessão, ele não renova.
  delete from auth.sessions where user_id = p_usuario;
end;
$$;

revoke execute on function public.suspender_usuario(uuid, integer, text) from public, anon;
grant execute on function public.suspender_usuario(uuid, integer, text) to authenticated;

/** Encerra as restrições em vigor de um tipo; a suspensão também libera o login. */
create function public.encerrar_restricao(p_usuario uuid, p_tipo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_moderador();
  if p_tipo not in ('silencio', 'suspensao') then
    raise exception 'Tipo inválido' using errcode = 'P0001', hint = 'tipo_invalido';
  end if;
  update public.restricoes set encerrada_em = now(), encerrada_por = (select auth.uid())
  where usuario_id = p_usuario and tipo = p_tipo and encerrada_em is null and ate > now();
  if p_tipo = 'suspensao' then
    update auth.users set banned_until = null where id = p_usuario;
  end if;
end;
$$;

revoke execute on function public.encerrar_restricao(uuid, text) from public, anon;
grant execute on function public.encerrar_restricao(uuid, text) to authenticated;

-- ---------- torcedor ----------
/** Restrições em vigor do torcedor logado, para o app avisar e travar o chat e as fotos antes do envio. */
create function public.minhas_restricoes()
returns table (tipo text, ate timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.tipo, max(r.ate)
  from public.restricoes r
  where r.usuario_id = (select auth.uid()) and r.encerrada_em is null and r.ate > now()
  group by r.tipo;
$$;

revoke execute on function public.minhas_restricoes() from public, anon;
grant execute on function public.minhas_restricoes() to authenticated;
