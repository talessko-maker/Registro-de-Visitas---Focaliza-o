-- ===================================================================
-- REGISTRO DE VISITAS — estrutura do banco
--
-- Cole este arquivo inteiro no SQL Editor do Supabase e rode uma vez.
-- Pode rodar de novo sem medo: tudo é "if not exists" ou "or replace".
--
-- Projeto: https://iozeyyuftogrpsndkrvj.supabase.co
-- Os dois formulários (Focalização e Terra Forte) gravam nesta mesma
-- tabela; o campo "origem" separa um do outro.
-- ===================================================================


-- -------------------------------------------------------------------
-- 1. A TABELA
-- Uma linha por visita. O que o formulário manda está em enviaRegistro()
-- no index.html; os nomes aqui são os mesmos, na mesma ordem.
-- -------------------------------------------------------------------
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


-- -------------------------------------------------------------------
-- 2. QUEM PODE O QUÊ
--
-- A chave "anon" fica visível no HTML do site — é assim por projeto,
-- ela não é segredo. Quem protege os dados é a regra abaixo: o
-- formulário só INSERE. Sem regra de SELECT, ninguém lê a tabela com
-- essa chave, nem sabendo o endereço.
--
-- O admin lê logado no painel do Supabase, que não passa por aqui.
-- -------------------------------------------------------------------
alter table public.visitas enable row level security;

drop policy if exists "formulario insere" on public.visitas;
create policy "formulario insere" on public.visitas
  for insert to anon
  with check (origem in ('focalizacao', 'terra-forte'));

-- Quando existir um painel próprio, com login de verdade, é esta linha
-- que abre a leitura para quem estiver autenticado:
-- create policy "admin le" on public.visitas for select to authenticated using (true);


-- -------------------------------------------------------------------
-- 3. AS FOTOS
-- Bucket público porque o PDF e o painel montam a URL direta. O caminho
-- carrega o uuid do registro, então não é endereço adivinhável.
-- (Dá para criar pelo menu Storage > New bucket, dá no mesmo.)
-- -------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fotos-visitas', 'fotos-visitas', true)
on conflict (id) do update set public = true;

drop policy if exists "formulario envia foto" on storage.objects;
create policy "formulario envia foto" on storage.objects
  for insert to anon
  with check (bucket_id = 'fotos-visitas');

-- O upload vai com "x-upsert", para o reenvio da fila não travar num
-- arquivo que já subiu. Upsert precisa de update, daí esta segunda regra.
drop policy if exists "formulario regrava foto" on storage.objects;
create policy "formulario regrava foto" on storage.objects
  for update to anon
  using (bucket_id = 'fotos-visitas')
  with check (bucket_id = 'fotos-visitas');


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
