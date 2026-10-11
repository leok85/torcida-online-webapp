-- Escudos dos clubes, copiados da BSD (sports.bzzoiro.com/img/team/<id>/) para não depender dela em produção.
-- Bucket público: leitura por /storage/v1/object/public/escudos/clubes/<id>.png. Sem políticas de escrita: só o servidor grava.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('escudos', 'escudos', true, 204800, array['image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
