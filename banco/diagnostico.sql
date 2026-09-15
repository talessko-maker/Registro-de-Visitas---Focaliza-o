-- ===================================================================
-- DIAGNÓSTICO — por que o insert continua sendo recusado
--
-- O que já se sabe: a chave funciona (o select responde), o papel é
-- "anon", a tabela, as visões e o bucket existem, e os dois scripts
-- rodaram. Mesmo assim o insert cai em "new row violates row-level
-- security policy", na tabela e no Storage.
--
-- Este bloco tira a CONDIÇÃO das regras por um instante. Se o insert
-- passar assim, o problema estava na condição; se continuar caindo, o
-- problema é a regra não estar sendo aplicada, e o resultado do item 3
-- mostra o que está gravado.
--
-- É temporário e a gente aperta de volta no passo seguinte.
--
-- IMPORTANTE: não deixe nenhum trecho selecionado no editor antes de
-- clicar em Run — com texto selecionado, o Supabase roda só a seleção.
-- ===================================================================


-- -------------------------------------------------------------------
-- 1. Regras sem condição nenhuma (temporário)
-- -------------------------------------------------------------------
drop policy if exists "formulario insere" on public.visitas;
create policy "formulario insere" on public.visitas
  for insert to public
  with check (true);

drop policy if exists "formulario envia foto" on storage.objects;
create policy "formulario envia foto" on storage.objects
  for insert to public
  with check (true);

drop policy if exists "formulario regrava foto" on storage.objects;
create policy "formulario regrava foto" on storage.objects
  for update to public
  using (true)
  with check (true);


-- -------------------------------------------------------------------
-- 2. Confere se o anon tem mesmo permissão de escrever na tabela
--    (isto é anterior às regras: sem isto, regra nenhuma adianta)
-- -------------------------------------------------------------------
grant insert on public.visitas to anon;
grant select, insert, update on storage.objects to anon;


-- -------------------------------------------------------------------
-- 3. O QUE ESTÁ GRAVADO (é este resultado que aparece na tela —
--    me mande ele inteiro)
-- -------------------------------------------------------------------
select json_build_object(
  'rls_visitas', (
    select json_build_object('ligada', relrowsecurity, 'forcada', relforcerowsecurity)
    from pg_class where oid = 'public.visitas'::regclass),

  'politicas', (
    select json_agg(json_build_object(
      'onde',       p.polrelid::regclass::text,
      'nome',       p.polname,
      'comando',    p.polcmd::text,
      'permissiva', p.polpermissive,
      'papeis',     coalesce((select array_agg(r.rolname::text)
                              from pg_roles r where r.oid = any(p.polroles)),
                             array['public']),
      'with_check', pg_get_expr(p.polwithcheck, p.polrelid),
      'using',      pg_get_expr(p.polqual, p.polrelid)))
    from pg_policy p
    where p.polrelid in ('public.visitas'::regclass, 'storage.objects'::regclass)),

  'permissoes_anon', (
    select json_agg(distinct privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'visitas' and grantee = 'anon')
) as diagnostico;
