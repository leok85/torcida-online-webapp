-- Painel de métricas do back-office: indicadores da semana, torcedores ativos por dia, jogos de hoje, economia de XP
-- do mês e o log do que a equipe fez. Todo papel da equipe vê o painel. O arrecadado do mês não está no banco: vem do
-- Stripe pela Edge Function receita-do-mes, que usa assinantes_pagantes() daqui para o número de assinantes.
-- Os dias seguem o horário de Brasília, o mesmo do login diário (registrar_presenca).

/** Torcedores com assinatura valendo agora (ativa, atrasada ou cancelada ainda no prazo). */
create function public.assinantes_pagantes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct a.usuario_id)
  from public.assinaturas a
  where a.status in ('ativa', 'atrasada', 'cancelada') and a.expira_em > now();
$$;

revoke execute on function public.assinantes_pagantes() from public, anon, authenticated;
grant execute on function public.assinantes_pagantes() to service_role;

/** Tudo do painel numa chamada só. */
create function public.admin_painel()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if public.papel_na_equipe() is null then
    raise exception 'Só a equipe' using errcode = '42501', hint = 'sem_permissao';
  end if;

  return jsonb_build_object(
    'indicadores', (
      select jsonb_build_object(
        -- Hoje contra o mesmo dia da semana passada; os outros, 7 dias contra os 7 anteriores.
        'ativos_hoje', count(distinct l.usuario_id) filter (where l.referencia = to_char(v_hoje, 'YYYY-MM-DD')),
        'ativos_semana_passada', count(distinct l.usuario_id) filter (where l.referencia = to_char(v_hoje - 7, 'YYYY-MM-DD'))
      )
      from public.xp_lancamentos l
      where l.acao = 'login_diario' and l.referencia in (to_char(v_hoje, 'YYYY-MM-DD'), to_char(v_hoje - 7, 'YYYY-MM-DD'))
    ) || (
      select jsonb_build_object(
        'cadastros_7d', count(*) filter (where p.criado_em >= now() - interval '7 days'),
        'cadastros_anterior', count(*) filter (where p.criado_em < now() - interval '7 days')
      )
      from public.perfis p
      where p.criado_em >= now() - interval '14 days'
        and not exists (select 1 from public.equipe e where e.usuario_id = p.id)
    ) || (
      select jsonb_build_object(
        'xp_7d', coalesce(sum(l.xp) filter (where l.criado_em >= now() - interval '7 days'), 0),
        'xp_anterior', coalesce(sum(l.xp) filter (where l.criado_em < now() - interval '7 days'), 0)
      )
      from public.xp_lancamentos l
      where l.criado_em >= now() - interval '14 days'
    ) || (
      select jsonb_build_object(
        'mensagens_7d', count(*) filter (where m.criado_em >= now() - interval '7 days'),
        'mensagens_anterior', count(*) filter (where m.criado_em < now() - interval '7 days')
      )
      from public.mensagens_chat m
      where m.criado_em >= now() - interval '14 days'
    ),

    -- Últimos 14 dias, do mais antigo para hoje. Dia de jogo: algum clube com torcedores jogou.
    'engajamento', (
      select jsonb_agg(jsonb_build_object(
        'dia', d.dia,
        'ativos', (
          select count(distinct l.usuario_id) from public.xp_lancamentos l
          where l.acao = 'login_diario' and l.referencia = to_char(d.dia, 'YYYY-MM-DD')
        ),
        'jogo', exists (
          select 1 from public.partidas pa
          where (pa.inicio at time zone 'America/Sao_Paulo')::date = d.dia
            and pa.status not in ('adiada', 'cancelada')
            and exists (
              select 1 from public.perfis p
              where p.onboarding_concluido_em is not null and p.time_id in (pa.mandante_id, pa.visitante_id)
            )
        )
      ) order by d.dia)
      from (select generate_series(v_hoje - 13, v_hoje, interval '1 day')::date as dia) d
    ),

    -- Jogos de hoje (e algum ainda ao vivo desde ontem) de clubes com torcedores: ao vivo, depois os próximos,
    -- depois os encerrados.
    'jogos_hoje', coalesce((
      select jsonb_agg(j.obj order by j.ordem, j.inicio)
      from (
        select
          jsonb_build_object(
            'id', pa.id,
            'mandante', pa.mandante_nome,
            'visitante', pa.visitante_nome,
            'liga', pa.liga_nome,
            'inicio', pa.inicio,
            'status', pa.status,
            'gols_mandante', pa.gols_mandante,
            'gols_visitante', pa.gols_visitante,
            'no_chat', (select count(distinct m.autor_id) from public.mensagens_chat m where m.partida_id = pa.id),
            'palpites', (select count(*) from public.palpites pp where pp.partida_id = pa.id),
            'notas_abertas', pa.status = 'encerrada' and now() < pa.encerrada_em + interval '1 hour'
          ) as obj,
          case pa.status when 'ao_vivo' then 0 when 'agendada' then 1 else 2 end as ordem,
          pa.inicio
        from public.partidas pa
        where ((pa.inicio at time zone 'America/Sao_Paulo')::date = v_hoje or pa.status = 'ao_vivo')
          and pa.status not in ('adiada', 'cancelada')
          and exists (
            select 1 from public.perfis p
            where p.onboarding_concluido_em is not null and p.time_id in (pa.mandante_id, pa.visitante_id)
          )
        order by 2, pa.inicio
        limit 5
      ) j
    ), '[]'::jsonb),

    -- XP lançado no mês, por grupo de ações.
    'economia_xp', (
      select jsonb_build_object(
        'palpites_notas', coalesce(sum(l.xp) filter (where l.acao like 'palpite\_%' or l.acao = 'notas'), 0),
        'chat_fotos', coalesce(sum(l.xp) filter (where l.acao in ('mensagem_chat', 'foto_enviada', 'foto_campea')), 0),
        'login', coalesce(sum(l.xp) filter (where l.acao = 'login_diario'), 0),
        'convites', coalesce(sum(l.xp) filter (where l.acao = 'convite_aceito'), 0),
        'total', coalesce(sum(l.xp), 0)
      )
      from public.xp_lancamentos l
      where l.criado_em >= v_inicio_mes
    ),

    -- O que a equipe fez por último, juntando as tabelas que guardam quem fez.
    'log', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.quando desc)
      from (
        select * from (
          select x.quando, x.acao, x.origem, x.icone, x.tom,
            coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email)::text as quem
          from (
            select r.aplicada_em as quando,
              format('Conta @%s %s até %s', coalesce(p.apelido, 'sem_apelido'),
                case r.tipo when 'silencio' then 'silenciada' else 'suspensa' end,
                to_char(r.ate at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')) as acao,
              'usuarios' as origem, case r.tipo when 'silencio' then 'volume_off' else 'person_off' end as icone,
              'danger' as tom, r.aplicada_por as por
            from public.restricoes r join public.perfis p on p.id = r.usuario_id
            where r.aplicada_por is not null
            union all
            select r.encerrada_em, format('Restrição de @%s encerrada', coalesce(p.apelido, 'sem_apelido')),
              'usuarios', 'how_to_reg', 'success', r.encerrada_por
            from public.restricoes r join public.perfis p on p.id = r.usuario_id
            where r.encerrada_por is not null and r.encerrada_em is not null
            union all
            select h.alterado_em, format('XP de “%s” de %s para %s', g.rotulo, h.xp_antes, h.xp_depois),
              'missoes', 'bolt', 'warning', h.alterado_por
            from public.xp_regras_historico h join public.xp_regras g on g.acao = h.acao
            where h.alterado_por is not null
            union all
            select m.criado_em, format('Missão “%s” criada', m.titulo), 'missoes', 'flag', 'info', m.criado_por
            from public.missoes m
            where m.criado_por is not null
            union all
            select n.publicada_em, format('Notícia publicada: %s', n.titulo), 'noticias', 'newspaper', 'success', n.publicada_por
            from public.noticias n
            where n.publicada_por is not null and n.estado = 'publicada'
            union all
            select f.criado_em, format('Fonte “%s” adicionada', f.nome), 'noticias', 'add_link', 'info', f.criado_por
            from public.noticias_fontes f
            where f.criado_por is not null
          ) x
          left join auth.users u on u.id = x.por
        ) t
        order by t.quando desc
        limit 8
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_painel() from public, anon;
grant execute on function public.admin_painel() to authenticated;
