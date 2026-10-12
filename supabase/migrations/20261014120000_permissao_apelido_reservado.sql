-- O trigger perfis_antes_de_atualizar roda com a permissão de quem edita o perfil (authenticated) e chama
-- apelido_reservado(); sem o grant, toda troca de apelido falhava com "permission denied for function".
-- A função só diz se um apelido está reservado, o mesmo que apelido_disponivel() já responde.
grant execute on function public.apelido_reservado(text, uuid) to authenticated;
