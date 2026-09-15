-- ===================================================================
-- FECHAMENTO — aperta as regras de volta e limpa os testes
--
-- O que o diagnóstico achou: o que derrubava o insert não era a regra,
-- era o upsert. As duas formas de upsert que o formulário usava
-- (resolution=ignore-duplicates na tabela e x-upsert nas fotos)
-- precisam de leitura e de update, que o anon não tem — e não deve ter,
-- porque a chave fica visível no HTML.
--
-- O formulário já foi corrigido: insere direto e trata "já existe"
-- (409 na tabela, KeyAlreadyExists no Storage) como sucesso, que é o
-- caso da fila reenviando algo que já tinha entrado.
--
-- Com isso as permissões ficam mais apertadas do que o plano original:
-- só INSERT, sem update em lugar nenhum.
--
-- Cole no SQL Editor e rode, sem deixar trecho selecionado.
-- ===================================================================


-- -------------------------------------------------------------------
-- 1. Tabela: volta a condição de origem
-- -------------------------------------------------------------------
drop policy if exists "formulario insere" on public.visitas;
create policy "formulario insere" on public.visitas
  for insert to public
  with check (origem in ('focalizacao', 'terra-forte'));


-- -------------------------------------------------------------------
-- 2. Storage: só insert, só no bucket das fotos.
--    A regra de update sai de vez — sem x-upsert, não é mais precisa.
-- -------------------------------------------------------------------
drop policy if exists "formulario envia foto" on storage.objects;
create policy "formulario envia foto" on storage.objects
  for insert to public
  with check (bucket_id = 'fotos-visitas');

drop policy if exists "formulario regrava foto" on storage.objects;


-- -------------------------------------------------------------------
-- 3. Apaga a função de diagnóstico
-- -------------------------------------------------------------------
drop function if exists public.quem_sou_eu();


-- -------------------------------------------------------------------
-- 4. Limpa as linhas de teste
-- -------------------------------------------------------------------
delete from public.visitas
where consultor in ('TESTE', 'TESTE - APAGAR', 'x')
   or produtor  in ('TESTE - APAGAR', 'x')
   or origem = 'invasor';


-- -------------------------------------------------------------------
-- 5. Como ficou (resultado na tela)
-- -------------------------------------------------------------------
select
  (select count(*) from public.visitas) as linhas_restantes,
  (select json_agg(json_build_object(
            'onde',     p.polrelid::regclass::text,
            'nome',     p.polname,
            'comando',  case p.polcmd when 'a' then 'insert' when 'w' then 'update'
                                      when 'r' then 'select' when 'd' then 'delete'
                                      else p.polcmd::text end,
            'condicao', pg_get_expr(p.polwithcheck, p.polrelid)))
   from pg_policy p
   where p.polrelid in ('public.visitas'::regclass, 'storage.objects'::regclass)
     and p.polname like 'formulario%') as politicas;
