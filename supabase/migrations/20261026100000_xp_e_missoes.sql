-- Missões e XP: a tabela de XP por ação, o extrato de cada torcedor, as missões, os multiplicadores e os créditos
-- automáticos. O webapp não credita nada: cada ação já gravada no banco (palpite, notas, chat, fotos, convite,
-- feedback) credita por trigger, e o login diário entra por registrar_presenca(). A equipe edita regras, missões e
-- multiplicadores pelo back-office (torcida-online-admin, tela Missões e XP).
--
-- Nível: passar do nível n para o n+1 custa 150 + 50·n XP (1→2 = 200). XP total para chegar ao nível n = (n−1)·(150+25n).

-- ---------- equipe ----------
/** Papel do usuário logado no back-office, ou null para quem não é da equipe. */
create function public.papel_na_equipe()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select e.papel from public.equipe e where e.usuario_id = (select auth.uid());
$$;

revoke execute on function public.papel_na_equipe() from public, anon;
grant execute on function public.papel_na_equipe() to authenticated;

/** Barra quem não pode mexer em Missões e XP (super admin e editor). */
create function public.exigir_editor_de_xp()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.papel_na_equipe(), '') not in ('super_admin', 'editor') then
    raise exception 'Só super admin e editor mexem em Missões e XP' using errcode = '42501', hint = 'sem_permissao';
  end if;
end;
$$;

revoke execute on function public.exigir_editor_de_xp() from public, anon, authenticated;

-- ---------- nível ----------
/** Nível a partir do XP total: (nivel, xp já feito dentro do nível, xp que o nível pede). */
create function public.nivel_do_xp(p_xp bigint)
returns table (nivel integer, xp_no_nivel integer, xp_do_nivel integer)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_xp bigint := greatest(coalesce(p_xp, 0), 0);
  v_nivel integer := floor((-125 + sqrt(15625 + 100 * (150 + v_xp))) / 50)::integer;
begin
  -- A raiz pode errar por um na borda; o acerto fino é pela soma exata.
  while (v_nivel::bigint - 1) * (150 + 25 * v_nivel) > v_xp loop
    v_nivel := v_nivel - 1;
  end loop;
  while (v_nivel::bigint) * (150 + 25 * (v_nivel + 1)) <= v_xp loop
    v_nivel := v_nivel + 1;
  end loop;
  nivel := greatest(v_nivel, 1);
  xp_no_nivel := (v_xp - (nivel::bigint - 1) * (150 + 25 * nivel))::integer;
  xp_do_nivel := 150 + 50 * nivel;
  return next;
end;
$$;

grant execute on function public.nivel_do_xp(bigint) to anon, authenticated;

-- ---------- regras ----------
-- XP por ação. O limite conta lançamentos da mesma ação no período (dia e semana em Brasília) ou na mesma partida.
create table public.xp_regras (
  acao text primary key check (acao ~ '^[a-z_]{3,30}$'),
  rotulo text not null check (char_length(rotulo) between 3 and 40),
  xp integer not null check (xp between 0 and 5000),
  limite integer check (limite > 0),
  limite_por text check (limite_por in ('dia', 'semana', 'partida')),
  -- Texto curto no lugar do limite, para as ações que não são do torcedor (apuração, convite).
  observacao text check (char_length(observacao) <= 40),
  icone text not null,
  ordem smallint not null,
  atualizado_em timestamptz not null default now(),
  constraint xp_regras_limite_completo check ((limite is null) = (limite_por is null))
);

insert into public.xp_regras (acao, rotulo, xp, limite, limite_por, observacao, icone, ordem) values
  ('login_diario', 'Login diário', 20, 1, 'dia', null, 'login', 1),
  ('palpite_enviado', 'Palpite enviado', 50, 1, 'partida', null, 'how_to_reg', 2),
  ('palpite_vencedor', 'Acertou o vencedor', 60, 1, 'partida', 'apurado no apito final', 'emoji_events', 3),
  ('palpite_exato', 'Placar exato', 240, 1, 'partida', 'bônus no apito final', 'target', 4),
  ('palpite_autor', 'Acertou quem marca', 40, null, null, 'por autor certo', 'sports_soccer', 5),
  ('notas', 'Notas nos jogadores', 50, 1, 'partida', null, 'grade', 6),
  ('mensagem_chat', 'Mensagem no chat', 2, 30, 'partida', null, 'forum', 7),
  ('foto_enviada', 'Foto publicada', 40, 3, 'partida', null, 'photo_camera', 8),
  ('foto_campea', 'Foto campeã', 500, null, null, 'mais curtida do clube', 'workspace_premium', 9),
  ('convite_aceito', 'Convite aceito', 100, null, null, 'para os dois torcedores', 'group_add', 10),
  ('feedback', 'Feedback enviado', 50, 2, 'semana', null, 'rate_review', 11);

alter table public.xp_regras enable row level security;

-- Os valores são públicos para o torcedor: os textos "+40 XP" do app leem daqui.
create policy "Todos leem as regras de XP" on public.xp_regras
  for select to authenticated
  using (true);

revoke all on public.xp_regras from anon, authenticated;
grant select on public.xp_regras to authenticated;
grant select, insert, update, delete on public.xp_regras to service_role;

create table public.xp_regras_historico (
  id bigint generated always as identity primary key,
  acao text not null references public.xp_regras (acao) on delete cascade,
  xp_antes integer not null,
  xp_depois integer not null,
  alterado_por uuid references auth.users (id) on delete set null,
  alterado_em timestamptz not null default now()
);

create index xp_regras_historico_recentes on public.xp_regras_historico (alterado_em desc);

alter table public.xp_regras_historico enable row level security;
revoke all on public.xp_regras_historico from anon, authenticated;
grant select, insert, update, delete on public.xp_regras_historico to service_role;

-- ---------- multiplicadores ----------
-- Fator sobre o XP base das ações (não das missões). Vale o maior fator que se aplica; eles não se somam.
--   partida:      ações ligadas a uma partida (ex.: clássico);
--   fora_de_casa: ações em partidas em que o clube do torcedor é o visitante;
--   novato:       os primeiros `dias` depois do cadastro do torcedor;
--   periodo:      tudo entre inicio e fim.
-- inicio/fim, quando preenchidos, limitam qualquer tipo.
create table public.xp_multiplicadores (
  id uuid primary key default gen_random_uuid(),
  rotulo text not null check (char_length(btrim(rotulo)) between 3 and 40),
  fator numeric(3, 2) not null check (fator > 1 and fator <= 3),
  tipo text not null check (tipo in ('partida', 'fora_de_casa', 'novato', 'periodo')),
  partida_id integer references public.partidas (id) on delete cascade,
  dias smallint check (dias between 1 and 90),
  inicio timestamptz,
  fim timestamptz,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint xp_multiplicadores_tipo_completo check (
    (tipo <> 'partida' or partida_id is not null)
    and (tipo <> 'novato' or dias is not null)
    and (tipo <> 'periodo' or (inicio is not null and fim is not null))
  ),
  constraint xp_multiplicadores_janela check (inicio is null or fim is null or fim > inicio)
);

alter table public.xp_multiplicadores enable row level security;
revoke all on public.xp_multiplicadores from anon, authenticated;
grant select, insert, update, delete on public.xp_multiplicadores to service_role;

/** Maior fator que vale para esta ação agora (1 quando nenhum se aplica). */
create function public.fator_de_xp(p_usuario uuid, p_partida integer)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(m.fator), 1)
  from public.xp_multiplicadores m
  where m.ativo
    and (m.inicio is null or m.inicio <= now())
    and (m.fim is null or m.fim > now())
    and case m.tipo
      when 'partida' then m.partida_id = p_partida
      when 'fora_de_casa' then exists (
        select 1 from public.partidas pa, public.perfis pe
        where pa.id = p_partida and pe.id = p_usuario and pa.visitante_id = pe.time_id
      )
      when 'novato' then exists (
        select 1 from public.perfis pe where pe.id = p_usuario and pe.criado_em > now() - make_interval(days => m.dias)
      )
      else true
    end;
$$;

revoke execute on function public.fator_de_xp(uuid, integer) from public, anon, authenticated;

-- ---------- missões ----------
-- Missão = juntar `meta` lançamentos de uma ação. Semanal conta de segunda 00:00 (Brasília), por jogo conta na mesma
-- partida e contínua conta desde que a missão foi criada. Concluir credita `xp` uma vez por período.
create table public.missoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(btrim(titulo)) between 3 and 40),
  regra text not null check (char_length(btrim(regra)) between 3 and 80),
  icone text not null default 'flag',
  tipo text not null check (tipo in ('semanal', 'por_jogo', 'continua')),
  acao text not null references public.xp_regras (acao),
  meta integer not null check (meta between 1 and 100),
  xp integer not null check (xp between 1 and 5000),
  status text not null default 'rascunho' check (status in ('rascunho', 'ativa', 'pausada', 'encerrada')),
  ordem smallint not null default 0,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.missoes enable row level security;
revoke all on public.missoes from anon, authenticated;
grant select, insert, update, delete on public.missoes to service_role;

-- ---------- extrato ----------
-- Um lançamento por ação creditada. A referência torna o crédito idempotente: o mesmo palpite, mensagem ou dia de
-- login nunca credita duas vezes, mesmo que o trigger ou a apuração rodem de novo.
create table public.xp_lancamentos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  acao text not null,
  referencia text not null,
  xp integer not null check (xp >= 0),
  xp_base integer not null check (xp_base >= 0),
  fator numeric(3, 2) not null default 1,
  partida_id integer references public.partidas (id) on delete set null,
  missao_id uuid references public.missoes (id) on delete set null,
  detalhe text,
  criado_em timestamptz not null default now(),
  unique (usuario_id, acao, referencia)
);

create index xp_lancamentos_do_torcedor on public.xp_lancamentos (usuario_id, criado_em desc);
create index xp_lancamentos_da_acao on public.xp_lancamentos (usuario_id, acao, criado_em);
create index xp_lancamentos_da_partida on public.xp_lancamentos (usuario_id, partida_id, acao) where partida_id is not null;
create index xp_lancamentos_recentes on public.xp_lancamentos (criado_em);

alter table public.xp_lancamentos enable row level security;
revoke all on public.xp_lancamentos from anon, authenticated;
grant select, insert, update, delete on public.xp_lancamentos to service_role;

/** Conclui as missões ativas desta ação que bateram a meta com o lançamento que acabou de entrar. */
create function public.conferir_missoes(p_usuario uuid, p_acao text, p_partida integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missao public.missoes;
  v_feito integer;
  v_referencia text;
begin
  for v_missao in select * from public.missoes m where m.status = 'ativa' and m.acao = p_acao loop
    if v_missao.tipo = 'semanal' then
      select count(*) into v_feito from public.xp_lancamentos l
      where l.usuario_id = p_usuario and l.acao = p_acao and l.criado_em >= public.inicio_da_semana();
      v_referencia := v_missao.id || ':' || to_char(public.inicio_da_semana() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
    elsif v_missao.tipo = 'por_jogo' then
      continue when p_partida is null;
      select count(*) into v_feito from public.xp_lancamentos l
      where l.usuario_id = p_usuario and l.acao = p_acao and l.partida_id = p_partida;
      v_referencia := v_missao.id || ':' || p_partida;
    else
      select count(*) into v_feito from public.xp_lancamentos l
      where l.usuario_id = p_usuario and l.acao = p_acao and l.criado_em >= v_missao.criado_em;
      v_referencia := v_missao.id::text;
    end if;

    if v_feito >= v_missao.meta then
      insert into public.xp_lancamentos (usuario_id, acao, referencia, xp, xp_base, partida_id, missao_id, detalhe)
      values (p_usuario, 'missao', v_referencia, v_missao.xp, v_missao.xp,
        case when v_missao.tipo = 'por_jogo' then p_partida end, v_missao.id, v_missao.titulo)
      on conflict (usuario_id, acao, referencia) do nothing;
    end if;
  end loop;
end;
$$;

revoke execute on function public.conferir_missoes(uuid, text, integer) from public, anon, authenticated;

/**
 * Credita uma ação: aplica o limite da regra e o multiplicador, grava o lançamento (uma vez por referência) e confere
 * as missões. Devolve o XP creditado (0 quando já tinha sido creditado, passou do limite ou a conta não é de torcedor).
 */
create function public.creditar_xp(
  p_usuario uuid,
  p_acao text,
  p_referencia text,
  p_partida integer default null,
  p_detalhe text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regra public.xp_regras;
  v_feito integer;
  v_fator numeric;
  v_xp integer;
  v_id bigint;
begin
  if p_usuario is null or not exists (select 1 from public.perfis p where p.id = p_usuario) then
    return 0;
  end if;
  select * into v_regra from public.xp_regras r where r.acao = p_acao;
  if not found then
    return 0;
  end if;

  if v_regra.limite is not null then
    select count(*) into v_feito from public.xp_lancamentos l
    where l.usuario_id = p_usuario and l.acao = p_acao
      and case v_regra.limite_por
        when 'dia' then l.criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
        when 'semana' then l.criado_em >= public.inicio_da_semana()
        else l.partida_id = p_partida
      end;
    if v_feito >= v_regra.limite then
      return 0;
    end if;
  end if;

  v_fator := public.fator_de_xp(p_usuario, p_partida);
  v_xp := round(v_regra.xp * v_fator)::integer;

  insert into public.xp_lancamentos (usuario_id, acao, referencia, xp, xp_base, fator, partida_id, detalhe)
  values (p_usuario, p_acao, p_referencia, v_xp, v_regra.xp, v_fator, p_partida, p_detalhe)
  on conflict (usuario_id, acao, referencia) do nothing
  returning id into v_id;

  if v_id is null then
    return 0;
  end if;
  perform public.conferir_missoes(p_usuario, p_acao, p_partida);
  return v_xp;
end;
$$;

revoke execute on function public.creditar_xp(uuid, text, text, integer, text) from public, anon, authenticated;

-- ---------- créditos automáticos ----------
/** Login diário: o app chama ao abrir com sessão. Devolve o XP creditado (0 quando o dia já contou). */
create function public.registrar_presenca()
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.creditar_xp(
    (select auth.uid()),
    'login_diario',
    to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
  );
$$;

revoke execute on function public.registrar_presenca() from public, anon;
grant execute on function public.registrar_presenca() to authenticated;

create function public.xp_do_palpite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.creditar_xp(new.usuario_id, 'palpite_enviado', new.partida_id::text, new.partida_id,
    (select pa.mandante_nome || ' x ' || pa.visitante_nome from public.partidas pa where pa.id = new.partida_id));
  return null;
end;
$$;

revoke execute on function public.xp_do_palpite() from public, anon, authenticated;

create trigger xp_do_palpite
  after insert on public.palpites
  for each row execute function public.xp_do_palpite();

create function public.xp_das_notas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.creditar_xp(new.usuario_id, 'notas', new.partida_id::text, new.partida_id,
    (select pa.mandante_nome || ' x ' || pa.visitante_nome from public.partidas pa where pa.id = new.partida_id));
  return null;
end;
$$;

revoke execute on function public.xp_das_notas() from public, anon, authenticated;

create trigger xp_das_notas
  after insert on public.notas_jogadores
  for each row execute function public.xp_das_notas();

create function public.xp_do_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.creditar_xp(new.autor_id, 'mensagem_chat', new.id::text, new.partida_id,
    (select pa.mandante_nome || ' x ' || pa.visitante_nome from public.partidas pa where pa.id = new.partida_id));
  return null;
end;
$$;

revoke execute on function public.xp_do_chat() from public, anon, authenticated;

create trigger xp_do_chat
  after insert on public.mensagens_chat
  for each row execute function public.xp_do_chat();

create function public.xp_da_foto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.creditar_xp(new.autor_id, 'foto_enviada', new.id::text, new.partida_id,
    (select pa.mandante_nome || ' x ' || pa.visitante_nome from public.partidas pa where pa.id = new.partida_id));
  return null;
end;
$$;

revoke execute on function public.xp_da_foto() from public, anon, authenticated;

create trigger xp_da_foto
  after insert on public.fotos_torcida
  for each row execute function public.xp_da_foto();

-- O convite conta quando o convidado conclui o onboarding (perfis.convite_contou_em): XP para os dois.
create function public.xp_do_convite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.convite_contou_em is null and new.convite_contou_em is not null and new.convidado_por is not null then
    perform public.creditar_xp(new.convidado_por, 'convite_aceito', 'convidou:' || new.id,
      null, coalesce(new.apelido, 'Um amigo') || ' entrou pelo seu convite');
    perform public.creditar_xp(new.id, 'convite_aceito', 'convidado:' || new.convidado_por,
      null, 'Entrou pelo convite de ' || coalesce((select p.apelido from public.perfis p where p.id = new.convidado_por), 'um amigo'));
  end if;
  return null;
end;
$$;

revoke execute on function public.xp_do_convite() from public, anon, authenticated;

-- Sem "update of convite_contou_em": quem preenche a coluna é o trigger before, não o update do app.
create trigger xp_do_convite
  after update on public.perfis
  for each row when (old.convite_contou_em is null and new.convite_contou_em is not null)
  execute function public.xp_do_convite();

-- Feedback: o XP do envio passa a sair da regra (limite de envios com XP por semana) e entra no extrato.
create or replace function public.feedbacks_antes_de_inserir()
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
  new.criado_em := now();
  new.atualizado_em := now();
  new.xp := public.creditar_xp(v_usuario, 'feedback', new.id::text, null,
    case new.tipo when 'problema' then 'Relatou um problema' when 'sugestao' then 'Enviou uma sugestão' else 'Enviou um elogio' end);
  return new;
end;
$$;

-- ---------- apuração do jogo ----------
/** Mesmo jogador? Os gols trazem o nome curto da BSD ("M. Reus"); o elenco, o nome do cadastro ("Marco Reus"). */
create function public.mesmo_jogador(p_gol text, p_elenco text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with n as (
    select
      regexp_split_to_array(lower(btrim(p_gol)), '[\s.]+') as g,
      regexp_split_to_array(lower(btrim(p_elenco)), '[\s.]+') as e
  )
  select lower(btrim(p_gol)) = lower(btrim(p_elenco))
    or (
      cardinality(g) > 1 and cardinality(e) > 1
      and g[cardinality(g)] = e[cardinality(e)]
      and left(g[1], 1) = left(e[1], 1)
    )
  from n;
$$;

/**
 * Apura os palpites de uma partida encerrada: vencedor (ou empate), placar exato e autores certos (um crédito por
 * gol acertado, sem gol contra). Idempotente: roda no apito e de novo pelo cron.
 */
create function public.apurar_palpites(p_partida integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partida public.partidas;
  v_palpite public.palpites;
  v_jogo text;
  v_autor jsonb;
  v_nome text;
  v_gols_certos integer;
  v_indice integer;
begin
  select * into v_partida from public.partidas p where p.id = p_partida;
  if not found or v_partida.status <> 'encerrada' or v_partida.gols_mandante is null or v_partida.gols_visitante is null then
    return;
  end if;
  v_jogo := v_partida.mandante_nome || ' ' || v_partida.gols_mandante || ' x ' || v_partida.gols_visitante || ' ' || v_partida.visitante_nome;

  for v_palpite in select * from public.palpites pp where pp.partida_id = p_partida loop
    if v_palpite.gols_mandante = v_partida.gols_mandante and v_palpite.gols_visitante = v_partida.gols_visitante then
      perform public.creditar_xp(v_palpite.usuario_id, 'palpite_exato', p_partida::text, p_partida, 'Placar exato: ' || v_jogo);
    elsif sign(v_palpite.gols_mandante - v_palpite.gols_visitante) = sign(v_partida.gols_mandante - v_partida.gols_visitante) then
      perform public.creditar_xp(v_palpite.usuario_id, 'palpite_vencedor', p_partida::text, p_partida, 'Acertou o resultado: ' || v_jogo);
    end if;

    -- Cada autor palpitado vale uma vez por gol real dele (dois palpites no mesmo jogador pedem dois gols).
    v_indice := 0;
    for v_autor in select * from jsonb_array_elements(v_palpite.autores) loop
      v_indice := v_indice + 1;
      select j ->> 'nome' into v_nome
      from public.elencos e, jsonb_array_elements(e.jogadores) j
      where e.clube_id = case when (v_autor ->> 'mandante')::boolean then v_partida.mandante_id else v_partida.visitante_id end
        and (j ->> 'id')::integer = (v_autor ->> 'jogador')::integer
      limit 1;
      continue when v_nome is null;

      select count(*) into v_gols_certos
      from jsonb_array_elements(coalesce(v_partida.gols, '[]'::jsonb)) g
      where not coalesce((g ->> 'contra')::boolean, false)
        and (g ->> 'mandante')::boolean = (v_autor ->> 'mandante')::boolean
        and public.mesmo_jogador(g ->> 'jogador', v_nome);

      -- Quantas vezes este jogador já apareceu antes neste palpite: só credita se houver gol real para todas.
      if v_gols_certos >= (
        select count(*) from jsonb_array_elements(v_palpite.autores) with ordinality a(v, i)
        where i <= v_indice and (a.v ->> 'jogador') = (v_autor ->> 'jogador') and (a.v ->> 'mandante') = (v_autor ->> 'mandante')
      ) then
        perform public.creditar_xp(v_palpite.usuario_id, 'palpite_autor', p_partida || ':' || v_indice, p_partida,
          'Acertou o gol de ' || v_nome || ': ' || v_jogo);
      end if;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.apurar_palpites(integer) from public, anon, authenticated;

/** Foto campeã de cada clube no jogo: a mais curtida que não foi ocultada (empate: a mais antiga). */
create function public.apurar_fotos(p_partida integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foto record;
begin
  for v_foto in
    select distinct on (f.clube_id) f.id, f.autor_id, f.partida_id, pa.mandante_nome || ' x ' || pa.visitante_nome as jogo
    from public.fotos_torcida f
    join public.partidas pa on pa.id = f.partida_id
    where f.partida_id = p_partida and not f.oculta and f.curtidas > 0
    order by f.clube_id, f.curtidas desc, f.criado_em
  loop
    perform public.creditar_xp(v_foto.autor_id, 'foto_campea', v_foto.id::text, v_foto.partida_id, 'Foto campeã: ' || v_foto.jogo);
  end loop;
end;
$$;

revoke execute on function public.apurar_fotos(integer) from public, anon, authenticated;

-- No apito: apura os palpites. Um erro aqui não pode travar a sincronização das partidas, então vira aviso.
create function public.xp_no_apito()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'encerrada' and old.status is distinct from 'encerrada' then
    begin
      perform public.apurar_palpites(new.id);
    exception when others then
      raise warning 'Apuração de XP da partida % falhou: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end;
$$;

revoke execute on function public.xp_no_apito() from public, anon, authenticated;

create trigger xp_no_apito
  after update of status on public.partidas
  for each row execute function public.xp_no_apito();

/**
 * Repescagem de hora em hora (pg_cron): reapura os palpites dos jogos encerrados nos últimos 3 dias (placar corrigido
 * depois do apito ganha o que faltava) e dá a foto campeã quando a janela de joinhas fecha (1 h depois do apito).
 */
create function public.apurar_xp_pendente()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partida public.partidas;
begin
  for v_partida in
    select * from public.partidas p
    where p.status = 'encerrada' and p.encerrada_em > now() - interval '3 days'
  loop
    perform public.apurar_palpites(v_partida.id);
    if v_partida.encerrada_em < now() - interval '1 hour' then
      perform public.apurar_fotos(v_partida.id);
    end if;
  end loop;
end;
$$;

revoke execute on function public.apurar_xp_pendente() from public, anon, authenticated;

select cron.schedule('apurar-xp', '7 * * * *', 'select public.apurar_xp_pendente()');

-- ---------- torcedor ----------
/** XP do torcedor logado: total, nível, semana e a posição na temporada (ano corrente) entre todos os torcedores. */
create function public.meu_xp()
returns table (xp_total bigint, nivel integer, xp_no_nivel integer, xp_do_nivel integer, xp_semana bigint, xp_temporada bigint, posicao_temporada bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select (select auth.uid()) as id),
  totais as (
    select
      coalesce(sum(l.xp), 0) as total,
      coalesce(sum(l.xp) filter (where l.criado_em >= public.inicio_da_semana()), 0) as semana,
      coalesce(sum(l.xp) filter (where l.criado_em >= date_trunc('year', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'), 0) as temporada
    from public.xp_lancamentos l, eu where l.usuario_id = eu.id
  ),
  outros as (
    select l.usuario_id, sum(l.xp) as xp
    from public.xp_lancamentos l
    where l.criado_em >= date_trunc('year', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    group by l.usuario_id
  )
  select t.total, n.nivel, n.xp_no_nivel, n.xp_do_nivel, t.semana, t.temporada,
    1 + (select count(*) from outros o, eu where o.xp > t.temporada and o.usuario_id <> eu.id)
  from totais t, public.nivel_do_xp(t.total) n
  where exists (select 1 from public.perfis p, eu where p.id = eu.id);
$$;

revoke execute on function public.meu_xp() from public, anon;
grant execute on function public.meu_xp() to authenticated;

/** Extrato de XP do torcedor logado, do mais recente para o mais antigo. */
create function public.meu_extrato(p_limite integer default 30)
returns table (id bigint, acao text, rotulo text, icone text, xp integer, fator numeric, detalhe text, partida_id integer, criado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.acao,
    coalesce(r.rotulo, case when l.acao = 'missao' then 'Missão concluída' end),
    coalesce(r.icone, m.icone, 'flag'),
    l.xp, l.fator, l.detalhe, l.partida_id, l.criado_em
  from public.xp_lancamentos l
  left join public.xp_regras r on r.acao = l.acao
  left join public.missoes m on m.id = l.missao_id
  where l.usuario_id = (select auth.uid())
  order by l.criado_em desc, l.id desc
  limit least(greatest(coalesce(p_limite, 30), 1), 100);
$$;

revoke execute on function public.meu_extrato(integer) from public, anon;
grant execute on function public.meu_extrato(integer) to authenticated;

/**
 * Missões ativas com o progresso do torcedor logado. Semanal: desde segunda; por jogo: o melhor jogo da semana;
 * contínua: desde a criação da missão. concluida_em vem do lançamento da missão no mesmo período.
 */
create function public.minhas_missoes()
returns table (id uuid, titulo text, regra text, icone text, tipo text, acao text, meta integer, progresso integer, xp integer, concluida_em timestamptz, termina_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select (select auth.uid()) as id)
  select m.id, m.titulo, m.regra, m.icone, m.tipo, m.acao, m.meta,
    least(m.meta, case m.tipo
      when 'semanal' then (select count(*) from public.xp_lancamentos l, eu
        where l.usuario_id = eu.id and l.acao = m.acao and l.criado_em >= public.inicio_da_semana())
      when 'por_jogo' then (select coalesce(max(c.n), 0) from (select count(*) as n from public.xp_lancamentos l, eu
        where l.usuario_id = eu.id and l.acao = m.acao and l.partida_id is not null and l.criado_em >= public.inicio_da_semana()
        group by l.partida_id) c)
      else (select count(*) from public.xp_lancamentos l, eu
        where l.usuario_id = eu.id and l.acao = m.acao and l.criado_em >= m.criado_em)
    end)::integer,
    m.xp,
    (select max(l.criado_em) from public.xp_lancamentos l, eu
      where l.usuario_id = eu.id and l.missao_id = m.id
        and (m.tipo = 'continua' or l.criado_em >= public.inicio_da_semana())),
    case when m.tipo = 'semanal' then public.inicio_da_semana() + interval '7 days' end
  from public.missoes m
  where m.status = 'ativa' and exists (select 1 from public.perfis p, eu where p.id = eu.id)
  order by m.ordem, m.criado_em;
$$;

revoke execute on function public.minhas_missoes() from public, anon;
grant execute on function public.minhas_missoes() to authenticated;

/**
 * Ranking de XP no período ('temporada' = ano corrente, 'mes', 'semana'), opcionalmente só de um clube. Traz o top
 * `p_limite` e, se o torcedor logado ficou de fora, a linha dele no fim.
 */
create function public.ranking_xp(p_periodo text default 'temporada', p_clube integer default null, p_limite integer default 50)
returns table (posicao bigint, usuario_id uuid, apelido text, clube_id integer, xp bigint, nivel integer, eu boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with inicio as (
    select case p_periodo
      when 'semana' then public.inicio_da_semana()
      when 'mes' then date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
      else date_trunc('year', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    end as em
  ),
  periodo as (
    select l.usuario_id, sum(l.xp) as xp
    from public.xp_lancamentos l, inicio
    where l.criado_em >= inicio.em
    group by l.usuario_id
  ),
  total as (
    select l.usuario_id, sum(l.xp) as xp from public.xp_lancamentos l
    where l.usuario_id in (select usuario_id from periodo)
    group by l.usuario_id
  ),
  classificados as (
    select rank() over (order by pe.xp desc) as posicao, pe.usuario_id, p.apelido, p.time_id, pe.xp,
      (select n.nivel from public.nivel_do_xp(t.xp) n) as nivel,
      pe.usuario_id = (select auth.uid()) as eu
    from periodo pe
    join public.perfis p on p.id = pe.usuario_id
    join total t on t.usuario_id = pe.usuario_id
    where p.apelido is not null and (p_clube is null or p.time_id = p_clube)
  )
  select * from (
    select * from classificados c order by c.posicao, c.apelido limit least(greatest(coalesce(p_limite, 50), 1), 200)
  ) topo
  union
  select * from classificados c where c.eu
  order by 1, 3;
$$;

revoke execute on function public.ranking_xp(text, integer, integer) from public, anon;
grant execute on function public.ranking_xp(text, integer, integer) to authenticated;

-- ---------- back-office ----------
/** Grava os valores de XP ({"acao": xp, ...}) e registra cada mudança no histórico. */
create function public.salvar_regras_xp(p_valores jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_antes integer;
begin
  perform public.exigir_editor_de_xp();
  if jsonb_typeof(p_valores) <> 'object' then
    raise exception 'Valores inválidos' using errcode = 'P0001', hint = 'valores_invalidos';
  end if;
  for v_item in select key as acao, value from jsonb_each(p_valores) loop
    if jsonb_typeof(v_item.value) <> 'number' or (v_item.value)::text !~ '^\d{1,4}$' then
      raise exception 'XP inválido para %', v_item.acao using errcode = 'P0001', hint = 'xp_invalido';
    end if;
    select r.xp into v_antes from public.xp_regras r where r.acao = v_item.acao for update;
    if not found then
      raise exception 'Ação desconhecida: %', v_item.acao using errcode = 'P0001', hint = 'acao_desconhecida';
    end if;
    if v_antes <> (v_item.value)::integer then
      update public.xp_regras set xp = (v_item.value)::integer, atualizado_em = now() where acao = v_item.acao;
      insert into public.xp_regras_historico (acao, xp_antes, xp_depois, alterado_por)
      values (v_item.acao, v_antes, (v_item.value)::integer, (select auth.uid()));
    end if;
  end loop;
end;
$$;

revoke execute on function public.salvar_regras_xp(jsonb) from public, anon;
grant execute on function public.salvar_regras_xp(jsonb) to authenticated;

/** Últimas mudanças na tabela de XP, com quem mudou. */
create function public.historico_regras_xp(p_limite integer default 30)
returns table (id bigint, acao text, rotulo text, xp_antes integer, xp_depois integer, alterado_por text, alterado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_xp();
  return query
    select h.id, h.acao, r.rotulo, h.xp_antes, h.xp_depois,
      coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email)::text,
      h.alterado_em
    from public.xp_regras_historico h
    join public.xp_regras r on r.acao = h.acao
    left join auth.users u on u.id = h.alterado_por
    order by h.alterado_em desc, h.id desc
    limit least(greatest(coalesce(p_limite, 30), 1), 100);
end;
$$;

revoke execute on function public.historico_regras_xp(integer) from public, anon;
grant execute on function public.historico_regras_xp(integer) to authenticated;

/**
 * Missões para o back-office, com a adesão do período atual: quantos torcedores concluíram (semanal: nesta semana;
 * por jogo: nos últimos 7 dias; contínua: desde sempre) sobre os torcedores com onboarding concluído.
 */
create function public.admin_missoes()
returns table (id uuid, titulo text, regra text, icone text, tipo text, acao text, meta integer, xp integer, status text, ordem smallint, concluiram bigint, torcedores bigint, criado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_xp();
  return query
    select m.id, m.titulo, m.regra, m.icone, m.tipo, m.acao, m.meta, m.xp, m.status, m.ordem,
      (select count(distinct l.usuario_id) from public.xp_lancamentos l
        where l.missao_id = m.id
          and l.criado_em >= case m.tipo
            when 'semanal' then public.inicio_da_semana()
            when 'por_jogo' then now() - interval '7 days'
            else '-infinity'::timestamptz
          end),
      (select count(*) from public.perfis p where p.onboarding_concluido_em is not null),
      m.criado_em
    from public.missoes m
    order by case m.status when 'ativa' then 0 when 'rascunho' then 1 when 'pausada' then 2 else 3 end, m.ordem, m.criado_em;
end;
$$;

revoke execute on function public.admin_missoes() from public, anon;
grant execute on function public.admin_missoes() to authenticated;

/** Cria (p_id nulo) ou altera uma missão. Devolve o id. */
create function public.salvar_missao(
  p_id uuid,
  p_titulo text,
  p_regra text,
  p_icone text,
  p_tipo text,
  p_acao text,
  p_meta integer,
  p_xp integer,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.exigir_editor_de_xp();
  if p_id is null then
    insert into public.missoes (titulo, regra, icone, tipo, acao, meta, xp, status, ordem, criado_por)
    values (btrim(p_titulo), btrim(p_regra), coalesce(nullif(btrim(p_icone), ''), 'flag'), p_tipo, p_acao, p_meta, p_xp, p_status,
      coalesce((select max(m.ordem) + 1 from public.missoes m), 0), (select auth.uid()))
    returning id into v_id;
  else
    update public.missoes set
      titulo = btrim(p_titulo), regra = btrim(p_regra), icone = coalesce(nullif(btrim(p_icone), ''), 'flag'),
      tipo = p_tipo, acao = p_acao, meta = p_meta, xp = p_xp, status = p_status, atualizado_em = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Missão não encontrada' using errcode = 'P0001', hint = 'missao_inexistente';
    end if;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.salvar_missao(uuid, text, text, text, text, text, integer, integer, text) from public, anon;
grant execute on function public.salvar_missao(uuid, text, text, text, text, text, integer, integer, text) to authenticated;

/** Apaga uma missão que ainda é rascunho; as outras se encerram pelo status, para o extrato não perder a referência. */
create function public.excluir_missao(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_xp();
  delete from public.missoes m where m.id = p_id and m.status = 'rascunho';
  if not found then
    raise exception 'Só rascunho pode ser apagado' using errcode = 'P0001', hint = 'missao_publicada';
  end if;
end;
$$;

revoke execute on function public.excluir_missao(uuid) from public, anon;
grant execute on function public.excluir_missao(uuid) to authenticated;

/** Multiplicadores para o back-office, com o nome da partida quando o tipo é partida. */
create function public.admin_multiplicadores()
returns table (id uuid, rotulo text, fator numeric, tipo text, partida_id integer, partida text, dias smallint, inicio timestamptz, fim timestamptz, ativo boolean, vigente boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_xp();
  return query
    select m.id, m.rotulo, m.fator, m.tipo, m.partida_id,
      pa.mandante_nome || ' x ' || pa.visitante_nome,
      m.dias, m.inicio, m.fim, m.ativo,
      m.ativo and (m.inicio is null or m.inicio <= now()) and (m.fim is null or m.fim > now())
    from public.xp_multiplicadores m
    left join public.partidas pa on pa.id = m.partida_id
    order by m.ativo desc, m.fator desc, m.criado_em;
end;
$$;

revoke execute on function public.admin_multiplicadores() from public, anon;
grant execute on function public.admin_multiplicadores() to authenticated;

/** Cria (p_id nulo) ou altera um multiplicador. Devolve o id. */
create function public.salvar_multiplicador(
  p_id uuid,
  p_rotulo text,
  p_fator numeric,
  p_tipo text,
  p_partida integer,
  p_dias integer,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_ativo boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.exigir_editor_de_xp();
  if p_id is null then
    insert into public.xp_multiplicadores (rotulo, fator, tipo, partida_id, dias, inicio, fim, ativo)
    values (btrim(p_rotulo), p_fator, p_tipo, p_partida, p_dias, p_inicio, p_fim, coalesce(p_ativo, true))
    returning id into v_id;
  else
    update public.xp_multiplicadores set
      rotulo = btrim(p_rotulo), fator = p_fator, tipo = p_tipo, partida_id = p_partida, dias = p_dias,
      inicio = p_inicio, fim = p_fim, ativo = coalesce(p_ativo, true)
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Multiplicador não encontrado' using errcode = 'P0001', hint = 'multiplicador_inexistente';
    end if;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.salvar_multiplicador(uuid, text, numeric, text, integer, integer, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.salvar_multiplicador(uuid, text, numeric, text, integer, integer, timestamptz, timestamptz, boolean) to authenticated;

create function public.excluir_multiplicador(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_xp();
  delete from public.xp_multiplicadores m where m.id = p_id;
end;
$$;

revoke execute on function public.excluir_multiplicador(uuid) from public, anon;
grant execute on function public.excluir_multiplicador(uuid) to authenticated;

/**
 * Saúde da economia: XP dos últimos 7 dias contra os 7 anteriores, a fatia de cada ação, quantos torcedores
 * ganharam XP e o nível médio de quem tem XP.
 */
create function public.economia_xp()
returns table (xp_7d bigint, xp_7d_anterior bigint, torcedores_7d bigint, nivel_medio numeric, por_acao jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_editor_de_xp();
  return query
    with recentes as (
      select l.acao, l.xp, l.usuario_id from public.xp_lancamentos l where l.criado_em >= now() - interval '7 days'
    ),
    acoes as (
      select r.acao, sum(r.xp) as xp from recentes r group by r.acao
    )
    select
      coalesce((select sum(r.xp) from recentes r), 0)::bigint,
      coalesce((select sum(l.xp) from public.xp_lancamentos l
        where l.criado_em >= now() - interval '14 days' and l.criado_em < now() - interval '7 days'), 0)::bigint,
      (select count(distinct r.usuario_id) from recentes r),
      (select round(avg(n.nivel), 1) from (
        select l.usuario_id, sum(l.xp) as xp from public.xp_lancamentos l group by l.usuario_id
      ) t, public.nivel_do_xp(t.xp) n),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'acao', a.acao,
          'rotulo', coalesce(x.rotulo, case when a.acao = 'missao' then 'Missões' else a.acao end),
          'xp', a.xp
        ) order by a.xp desc)
        from acoes a left join public.xp_regras x on x.acao = a.acao
      ), '[]'::jsonb);
end;
$$;

revoke execute on function public.economia_xp() from public, anon;
grant execute on function public.economia_xp() to authenticated;
