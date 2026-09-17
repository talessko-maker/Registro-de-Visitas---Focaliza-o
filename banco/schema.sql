-- ===================================================================
-- REGISTRO DE VISITAS — estrutura do banco
--
-- Arquivo único e final. Substitui tudo o que rodou antes: cria o que
-- falta, corrige as regras que ficaram frouxas nos testes, apaga o
-- diagnóstico temporário e limpa as linhas de teste.
--
-- Cole inteiro no SQL Editor e rode. Pode rodar quantas vezes quiser —
-- tudo é "if not exists", "or replace" ou "drop if exists" antes de
-- criar.
--
-- ANTES DE CLICAR EM RUN: não deixe nenhum trecho selecionado no
-- editor. Com texto selecionado, o Supabase roda só a seleção, e é
-- assim que um script "dá Success" sem ter entrado inteiro.
--
-- Projeto: https://iozeyyuftogrpsndkrvj.supabase.co
-- Os dois formulários (Focalização e Terra Forte) gravam nesta mesma
-- tabela; o campo "origem" separa um do outro.
-- ===================================================================


-- ===================================================================
-- 1. A TABELA
-- Uma linha por visita. O que o formulário manda está em
-- enviaRegistro(), no index.html; os nomes aqui são os mesmos.
-- ===================================================================
create table if not exists public.visitas (
  id              uuid primary key,          -- gerado no celular, evita duplicata
  origem          text        not null,      -- 'focalizacao' | 'terra-forte'
  consultor       text        not null,
  produtor        text        not null,
  municipio       text,
  data_visita     date        not null,      -- o dia da visita
  descricao       text,                      -- texto puro, para busca
  descricao_html  text,                      -- com negrito/lista, para o PDF
  acao            text,                      -- o que ficou combinado
  prazo_acao      date,
  fotos           text[]      default '{}',  -- URLs públicas no Storage
  extras          jsonb       default '{}',  -- checklist e áreas
  registrado_em   timestamptz not null,      -- quando o celular fechou o registro
  criado_em       timestamptz default now()  -- quando chegou aqui (a fila offline pode atrasar)
);

create index if not exists visitas_data_idx      on public.visitas (data_visita desc);
create index if not exists visitas_consultor_idx on public.visitas (consultor, data_visita desc);
create index if not exists visitas_produtor_idx  on public.visitas (produtor, data_visita desc);
create index if not exists visitas_origem_idx    on public.visitas (origem);

-- busca em texto, em português
create index if not exists visitas_descricao_idx
  on public.visitas using gin (to_tsvector('portuguese', coalesce(descricao, '')));


-- ===================================================================
-- 2. QUEM PODE O QUÊ
--
-- A chave do site fica visível no HTML — é assim por projeto, ela não
-- é segredo. Quem protege os dados é a regra abaixo: o formulário só
-- INSERE. Sem regra de SELECT, ninguém lê a tabela com essa chave,
-- nem sabendo o endereço. O admin lê logado no painel do Supabase,
-- que não passa por aqui.
--
-- Duas coisas que aprendemos apanhando, e que precisam ficar assim:
--
-- "to public" e não "to anon" — public aqui é "qualquer papel" do
-- Postgres, não "aberto para a internet". Quem chega ao banco continua
-- sendo só quem tem a chave.
--
-- NADA DE UPSERT. O formulário insere direto e trata "já existe" como
-- sucesso (409 na tabela, KeyAlreadyExists no Storage), que é o caso
-- da fila reenviando um registro cuja resposta se perdeu. Upsert — o
-- resolution=ignore-duplicates e o x-upsert — precisa de leitura e de
-- update, que este papel não tem e não deve ter. Era isso, e não a
-- regra, que fazia todo insert cair em "new row violates row-level
-- security policy".
-- ===================================================================
alter table public.visitas enable row level security;

grant insert on public.visitas to anon;

drop policy if exists "formulario insere" on public.visitas;
create policy "formulario insere" on public.visitas
  for insert to public
  with check (origem in ('focalizacao', 'terra-forte'));

-- Leitura: quem entrou com conta lê o que é dela, e só isso.
--
-- ANTES DE RODAR ISTO, desligue o cadastro público em
-- Authentication > Sign In / Providers > Email > "Allow new users to
-- sign up". Com ele ligado, qualquer pessoa cria conta sozinha. Hoje
-- ela não veria nada (item 2.1 abaixo: sem vínculo, sem linhas), mas
-- conta que ninguém pediu é porta que ninguém fecha.
--
-- A regra em si está no item 2.1, porque depende da tabela de vínculo.
drop policy if exists "admin le" on public.visitas;

grant select on public.visitas to authenticated;


-- ===================================================================
-- 2.1 CADA CONSULTOR VÊ O QUE É SEU
--
-- A senha do painel diz QUEM é a pessoa. Ela não diz o que a pessoa
-- pode ver — isso é esta regra, e ela mora aqui no banco de propósito.
-- Separar na tela não separa nada: o navegador é do usuário, e quem
-- tem um token válido chama a API do Supabase direto e recebe o que a
-- regra permitir. Se a regra permite tudo, a tela é enfeite.
--
-- O vínculo é por NOME, e o nome tem que ser igual ao que o formulário
-- grava em visitas.consultor — o mesmo texto que está no CARTEIRA, no
-- index.html. "Daniel Bojarski" com "y" no fim entra no painel e vê
-- uma tela vazia, sem erro nenhum. O item 6 confere isso.
-- ===================================================================
create table if not exists public.consultores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome    text not null,                    -- igual a visitas.consultor
  admin   boolean not null default false,   -- true = vê todo mundo
  criado_em timestamptz default now()
);

create unique index if not exists consultores_nome_idx
  on public.consultores (nome) where not admin;

-- Ninguém mexe nisto pela chave do site: sem grant de insert/update/
-- delete, o vínculo só se edita aqui no SQL Editor, que roda como
-- service_role e passa por cima da RLS.
alter table public.consultores enable row level security;

grant select on public.consultores to authenticated;

drop policy if exists "cada um ve seu vinculo" on public.consultores;
create policy "cada um ve seu vinculo" on public.consultores
  for select to authenticated
  using (user_id = auth.uid());

-- As duas funções abaixo são "security definer": rodam com os poderes
-- de quem as criou e por isso enxergam a tabela consultores inteira.
-- Sem isso a consulta bateria na RLS logo acima e não acharia nada —
-- a regra da tabela visitas nunca daria true, e ninguém leria nada.
--
-- search_path travado em vazio, com tudo qualificado: uma função
-- security definer com search_path solto é a receita clássica de
-- escalar privilégio no Postgres.
create or replace function public.meu_nome()
  returns text
  language sql
  stable
  security definer
  set search_path = ''
as $func$
  select nome from public.consultores where user_id = auth.uid()
$func$;

create or replace function public.sou_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $func$
  select coalesce(
    (select admin from public.consultores where user_id = auth.uid()),
    false)
$func$;

revoke execute on function public.meu_nome()  from public, anon;
revoke execute on function public.sou_admin() from public, anon;
grant  execute on function public.meu_nome()  to authenticated;
grant  execute on function public.sou_admin() to authenticated;

-- A regra. Quem não tem vínculo cai no NULL de meu_nome(): a
-- comparação vira NULL, que não é true, e a linha não sai. Falha
-- fechado, que é como tem que falhar.
drop policy if exists "cada um le o seu" on public.visitas;
create policy "cada um le o seu" on public.visitas
  for select to authenticated
  using (public.sou_admin() or consultor = public.meu_nome());


-- ===================================================================
-- 2.2 LIGAR CADA LOGIN AO SEU NOME
--
-- Antes de rodar: crie as contas em Authentication > Users > Add user,
-- com "Auto Confirm User" marcado. Depois edite a lista abaixo e rode
-- de novo o arquivo — é idempotente, pode repetir à vontade.
--
-- A busca é pelo e-mail, para você não precisar copiar uuid nenhum do
-- painel do Supabase. E-mail que ainda não tem conta é simplesmente
-- ignorado; o item 6 mostra quem ficou de fora.
--
-- admin = true  -> vê todos os registros (você)
-- admin = false -> vê só as visitas gravadas com aquele nome
-- ===================================================================
insert into public.consultores (user_id, nome, admin)
select u.id, lista.nome, lista.admin
from (values
  -- e-mail da conta                     nome em visitas.consultor   admin
  ('tales@terraforte.agr.br',            'Tales',                    true )

  -- Descomente e preencha conforme criar as contas. Os nomes precisam
  -- ser exatamente estes — são os que estão no CARTEIRA do index.html.
  -- ,('alex@terraforte.agr.br',          'Alex',                     false)
  -- ,('daniel.bojarski@terraforte.agr.br','Daniel Bojarski',         false)
  -- ,('daniel.prestes@terraforte.agr.br','Daniel Prestes',           false)
  -- ,('gerson@terraforte.agr.br',        'Gerson',                   false)
  -- ,('gilson@terraforte.agr.br',        'Gilson',                   false)
  -- ,('grexe@terraforte.agr.br',         'Grexe',                    false)
  -- ,('gustavo@terraforte.agr.br',       'Gustavo',                  false)
  -- ,('jalmir@terraforte.agr.br',        'Jalmir',                   false)
  -- ,('marcelo@terraforte.agr.br',       'Marcelo',                  false)
  -- ,('marcos@terraforte.agr.br',        'Marcos',                   false)
  -- ,('marcal@terraforte.agr.br',        'Marçal',                   false)
  -- ,('shander@terraforte.agr.br',       'Shander',                  false)
) as lista(email, nome, admin)
join auth.users u on lower(u.email) = lower(lista.email)
on conflict (user_id) do update
  set nome = excluded.nome, admin = excluded.admin;


-- ===================================================================
-- 3. AS FOTOS
-- Bucket público porque o PDF e o painel montam a URL direta. O caminho
-- carrega o uuid do registro, então não é endereço adivinhável.
-- ===================================================================
insert into storage.buckets (id, name, public)
values ('fotos-visitas', 'fotos-visitas', true)
on conflict (id) do update set public = true;

drop policy if exists "formulario envia foto" on storage.objects;
create policy "formulario envia foto" on storage.objects
  for insert to public
  with check (bucket_id = 'fotos-visitas');

-- Sem regra de update: o upload não usa mais x-upsert. Esta linha
-- remove a regra que existia no desenho antigo.
drop policy if exists "formulario regrava foto" on storage.objects;


-- ===================================================================
-- 4. AS VISÕES — é por aqui que o admin olha
--
-- "security_invoker = on" não é detalhe: sem ele a visão roda com os
-- poderes de quem a criou e FURA a regra do item 2 — a tabela ficaria
-- trancada e a visão aberta ao público.
-- ===================================================================

-- 4.1 A planilha: o extras aberto em colunas de verdade.
--     É esta que o admin exporta para o Excel.
create or replace view public.visitas_planilha
with (security_invoker = on) as
select
  v.data_visita,
  v.consultor,
  v.produtor,
  v.municipio,
  v.origem,
  (v.extras->>'area_manejo_ha')::numeric       as area_manejo_ha,
  (v.extras->>'area_experimental_ha')::numeric as area_experimental_ha,
  (v.extras->'situacao'->>'consultoria_contratada')::boolean   as consultoria_contratada,
  (v.extras->'situacao'->>'visita_yuri')::boolean              as visita_yuri,
  (v.extras->'situacao'->>'visita_guilherme')::boolean         as visita_guilherme,
  (v.extras->'situacao'->>'ja_tem_ap')::boolean                as ja_tem_ap,
  (v.extras->'situacao'->>'ja_tinha_analise_solo')::boolean    as ja_tinha_analise_solo,
  (v.extras->'situacao'->>'regulagem_pulverizador')::boolean   as regulagem_pulverizador,
  (v.extras->'situacao'->>'coleta_analise_solo')::boolean      as coleta_analise_solo,
  (v.extras->'situacao'->>'coleta_analise_nematoide')::boolean as coleta_analise_nematoide,
  v.acao,
  v.prazo_acao,
  coalesce(array_length(v.fotos, 1), 0) as qtd_fotos,
  v.descricao,
  v.registrado_em,
  v.id
from public.visitas v
order by v.data_visita desc, v.registrado_em desc;


-- 4.2 Situação de cada produtor HOJE.
--     O checklist é retrato daquela visita, não estado acumulado:
--     "já tem AP" marcado em março e desmarcado em maio não é erro, é
--     o que o consultor viu em cada dia. Por isso pergunta de estado se
--     responde pela ÚLTIMA visita de cada produtor — somar as linhas
--     infla o número sozinho conforme as visitas se repetem.
create or replace view public.situacao_atual
with (security_invoker = on) as
select distinct on (v.produtor)
  v.produtor,
  v.municipio,
  v.consultor,
  v.data_visita as ultima_visita,
  current_date - v.data_visita as dias_desde_a_visita,
  (v.extras->'situacao'->>'consultoria_contratada')::boolean   as consultoria_contratada,
  (v.extras->'situacao'->>'ja_tem_ap')::boolean                as ja_tem_ap,
  (v.extras->'situacao'->>'ja_tinha_analise_solo')::boolean    as ja_tinha_analise_solo,
  (v.extras->'situacao'->>'coleta_analise_solo')::boolean      as coleta_analise_solo,
  (v.extras->'situacao'->>'coleta_analise_nematoide')::boolean as coleta_analise_nematoide
from public.visitas v
order by v.produtor, v.data_visita desc, v.registrado_em desc;


-- 4.3 O que ficou combinado e já venceu — lista de cobrança.
create or replace view public.acoes_pendentes
with (security_invoker = on) as
select
  v.prazo_acao,
  current_date - v.prazo_acao as dias_de_atraso,
  v.consultor,
  v.produtor,
  v.municipio,
  v.acao,
  v.data_visita,
  v.id
from public.visitas v
where coalesce(trim(v.acao), '') <> ''
  and v.prazo_acao is not null
  and v.prazo_acao < current_date
order by v.prazo_acao;


-- 4.4 Produtividade por consultor e mês.
--     atraso_medio_do_registro mostra quem preenche na hora e quem
--     preenche uma semana depois.
create or replace view public.visitas_por_mes
with (security_invoker = on) as
select
  date_trunc('month', v.data_visita)::date as mes,
  v.consultor,
  v.origem,
  count(*)                   as visitas,
  count(distinct v.produtor) as produtores_distintos,
  round(avg(v.registrado_em::date - v.data_visita), 1) as atraso_medio_do_registro
from public.visitas v
group by 1, 2, 3
order by 1 desc, 4 desc;


-- As visões só podem ser lidas por quem entrou com conta — elas herdam
-- a regra da tabela por causa do security_invoker. Este grant vem aqui
-- no fim porque as visões precisam existir antes.
grant select on public.visitas_planilha, public.situacao_atual,
                public.acoes_pendentes, public.visitas_por_mes
  to authenticated;


-- ===================================================================
-- 5. LIMPEZA DO QUE FOI TESTE
-- ===================================================================

-- a função que usei para descobrir qual papel o site assume
drop function if exists public.quem_sou_eu();

-- as linhas gravadas durante os testes contra o banco
delete from public.visitas
where consultor in ('TESTE', 'TESTE - APAGAR', 'x')
   or produtor  in ('TESTE - APAGAR', 'x')
   or origem = 'invasor';

-- As fotos de teste ficam no Storage e não saem por SQL: apague pelo
-- menu Storage > fotos-visitas (a pasta "teste" e a pasta com a data de
-- hoje). Como ainda não há registro real, dá para esvaziar o bucket.


-- ===================================================================
-- 6. COMO FICOU (é este resultado que aparece na tela)
-- ===================================================================
select json_build_object(
  'linhas_na_tabela', (select count(*) from public.visitas),

  'rls_ligada', (select relrowsecurity
                 from pg_class where oid = 'public.visitas'::regclass),

  'politicas', (
    select json_agg(json_build_object(
      'onde',     p.polrelid::regclass::text,
      'nome',     p.polname,
      'comando',  case p.polcmd when 'a' then 'insert' when 'w' then 'update'
                                when 'r' then 'select' when 'd' then 'delete'
                                else p.polcmd::text end,
      'papeis',   coalesce((select array_agg(r.rolname::text)
                            from pg_roles r where r.oid = any(p.polroles)),
                           array['public']),
      'condicao', pg_get_expr(p.polwithcheck, p.polrelid)))
    from pg_policy p
    where p.polrelid in ('public.visitas'::regclass, 'storage.objects'::regclass)
      and p.polname like 'formulario%'),

  'visoes', (
    select json_agg(viewname order by viewname)
    from pg_views where schemaname = 'public'),

  'bucket_publico', (select public from storage.buckets where id = 'fotos-visitas'),

  -- Quem já pode entrar e o que cada um alcança
  'vinculos', (
    select json_agg(json_build_object(
      'nome',  c.nome,
      'email', u.email,
      'admin', c.admin,
      'visitas_que_ve', case when c.admin
        then (select count(*) from public.visitas)
        else (select count(*) from public.visitas v where v.consultor = c.nome)
      end) order by c.admin desc, c.nome)
    from public.consultores c join auth.users u on u.id = c.user_id),

  -- O erro que não dá erro: nome gravado nas visitas que não tem
  -- login nenhum ligado a ele. Quem estiver nesta lista não consegue
  -- ver as próprias visitas.
  'consultores_sem_login', (
    select coalesce(json_agg(x.consultor order by x.consultor), '[]'::json)
    from (select distinct v.consultor from public.visitas v
          where not exists (select 1 from public.consultores c
                            where c.nome = v.consultor)) x),

  -- O contrário: login ligado a um nome que nunca apareceu em visita
  -- nenhuma. Costuma ser erro de digitação no item 2.2.
  'login_sem_visita', (
    select coalesce(json_agg(c.nome order by c.nome), '[]'::json)
    from public.consultores c
    where not c.admin
      and not exists (select 1 from public.visitas v where v.consultor = c.nome))
) as conferencia;
