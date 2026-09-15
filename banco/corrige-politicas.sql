-- ===================================================================
-- CORREÇÃO DAS POLÍTICAS
--
-- O primeiro teste contra o banco recusou o insert ("new row violates
-- row-level security policy"), tanto na tabela quanto no Storage. A
-- chave está certa — o select respondeu — então o que não bateu foi o
-- "to anon" das regras: a chave sb_publishable_ (formato novo) não
-- chega ao banco como o papel anon.
--
-- A correção tira a amarra de papel. Continua seguro: é só INSERT, e a
-- condição de origem continua valendo. Ler segue trancado, porque
-- regra de SELECT não existe nenhuma.
--
-- Cole no SQL Editor e rode. O resultado que aparecer na tela é o
-- diagnóstico do fim do arquivo.
-- ===================================================================


-- -------------------------------------------------------------------
-- 1. A TABELA
-- -------------------------------------------------------------------
drop policy if exists "formulario insere" on public.visitas;
create policy "formulario insere" on public.visitas
  for insert to public
  with check (origem in ('focalizacao', 'terra-forte'));


-- -------------------------------------------------------------------
-- 2. AS FOTOS
-- -------------------------------------------------------------------
drop policy if exists "formulario envia foto" on storage.objects;
create policy "formulario envia foto" on storage.objects
  for insert to public
  with check (bucket_id = 'fotos-visitas');

drop policy if exists "formulario regrava foto" on storage.objects;
create policy "formulario regrava foto" on storage.objects
  for update to public
  using (bucket_id = 'fotos-visitas')
  with check (bucket_id = 'fotos-visitas');


-- -------------------------------------------------------------------
-- 3. DIAGNÓSTICO TEMPORÁRIO
-- Uma função que só devolve qual papel o site assume. É para eu
-- descobrir o nome certo e depois apertar as regras de volta.
-- Ela é apagada no fim do acerto.
-- -------------------------------------------------------------------
create or replace function public.quem_sou_eu()
returns json language sql security invoker as $$
  select json_build_object(
    'papel',  current_user::text,
    'claims', current_setting('request.jwt.claims', true)
  );
$$;

grant execute on function public.quem_sou_eu() to public;


-- -------------------------------------------------------------------
-- 4. COMO FICOU (é este resultado que aparece na tela)
-- -------------------------------------------------------------------
select
  case p.polrelid::regclass::text
    when 'public.visitas' then 'tabela visitas'
    else 'storage'
  end as onde,
  p.polname as politica,
  case p.polcmd when 'a' then 'insert' when 'w' then 'update'
                when 'r' then 'select' when 'd' then 'delete' else p.polcmd::text end as comando,
  coalesce(
    (select array_agg(r.rolname::text) from pg_roles r where r.oid = any(p.polroles)),
    array['public']
  ) as papeis,
  pg_get_expr(p.polwithcheck, p.polrelid) as condicao
from pg_policy p
where p.polrelid in ('public.visitas'::regclass, 'storage.objects'::regclass)
order by 1, 2;
