-- Nota TO (W04 · Notas da partida): a nota de cada jogador calculada com os números dele em campo (rating da BSD),
-- guardada no cache dos detalhes do jogo como { "<id do jogador>": 8.7 }.
alter table public.detalhes_partidas add column notas jsonb not null default '{}'::jsonb;

-- Os jogos já fechados no cache não tinham as notas: buscam mais uma vez na próxima visita.
update public.detalhes_partidas set final = false where final;
