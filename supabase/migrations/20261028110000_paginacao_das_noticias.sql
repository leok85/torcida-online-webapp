-- Paginação das notícias sem perder empates: a busca em lote publica várias notícias no mesmo instante (now() da
-- transação), e comparar só publicada_em < p_antes descartava as que caíam na divisa da página. Agora o cursor é o
-- par (publicada_em, id), com a mesma ordem.
drop function public.noticias_do_clube(integer, timestamptz);

/**
 * Notícias publicadas para o clube do torcedor logado (e as de todas as torcidas), da mais recente para a mais antiga.
 * Para a próxima página, passe p_antes e p_antes_id da última notícia recebida.
 */
create function public.noticias_do_clube(p_limite integer default 20, p_antes timestamptz default null, p_antes_id uuid default null)
returns table (
  id uuid, titulo text, resumo text, imagem_url text, link text, fonte text, publicada_em timestamptz,
  leituras integer, curtidas integer, comentarios integer, curti boolean, li boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select p.id, p.time_id from public.perfis p where p.id = (select auth.uid()))
  select n.id, n.titulo, n.resumo, n.imagem_url, n.link, n.fonte_nome, n.publicada_em, n.leituras, n.curtidas, n.comentarios,
    exists (select 1 from public.noticias_curtidas c where c.noticia_id = n.id and c.usuario_id = eu.id),
    exists (select 1 from public.noticias_leituras l where l.noticia_id = n.id and l.usuario_id = eu.id)
  from public.noticias n, eu
  where n.estado = 'publicada'
    and (n.clubes = '{}' or eu.time_id = any(n.clubes))
    and (p_antes is null or (n.publicada_em, n.id) < (p_antes, coalesce(p_antes_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by n.publicada_em desc, n.id desc
  limit least(greatest(coalesce(p_limite, 20), 1), 50);
$$;

revoke execute on function public.noticias_do_clube(integer, timestamptz, uuid) from public, anon;
grant execute on function public.noticias_do_clube(integer, timestamptz, uuid) to authenticated;
