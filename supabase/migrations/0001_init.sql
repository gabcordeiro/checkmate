-- ChequeCerto — schema inicial
-- Tabelas: profiles, batches, cheques. RLS obrigatório em todas.
--
-- Isolamento no MVP: cada usuário só vê os próprios lotes/cheques.
-- A coluna org_id já existe (nullable) para a fase 2 (multiempresa) entrar sem
-- migração destrutiva — nenhuma policy usa ela ainda.

-- ---------------------------------------------------------------------------
-- profiles — 1 linha por usuário do auth. Criada no primeiro login (trigger).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  nome       text,
  org_id     uuid,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Cria o profile automaticamente no primeiro login (inclusive Google OAuth),
-- para o app nunca depender de um insert client-side que pode falhar.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- batches — um lote = um upload de cheques de uma operação.
-- total_valor/total_cheques são materializados por trigger para a tela de
-- histórico não precisar somar os cheques de todos os lotes.
-- ---------------------------------------------------------------------------
create table if not exists public.batches (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  org_id        uuid,
  nome          text,
  total_valor   numeric(14, 2) not null default 0,
  total_cheques integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists batches_owner_created_idx
  on public.batches (owner_id, created_at desc);

alter table public.batches enable row level security;

drop policy if exists "batches_select_own" on public.batches;
create policy "batches_select_own" on public.batches
  for select using (auth.uid() = owner_id);

drop policy if exists "batches_insert_own" on public.batches;
create policy "batches_insert_own" on public.batches
  for insert with check (auth.uid() = owner_id);

drop policy if exists "batches_update_own" on public.batches;
create policy "batches_update_own" on public.batches
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "batches_delete_own" on public.batches;
create policy "batches_delete_own" on public.batches
  for delete using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- cheques — um cheque extraído de uma foto.
-- Guardamos o que o MODELO extraiu e, em colunas separadas, o que o CÓDIGO
-- validou (valor_extenso_convertido, status, alertas). Nada aqui é decisão
-- final: a operadora confere na tela.
-- ---------------------------------------------------------------------------
create table if not exists public.cheques (
  id                       uuid primary key default gen_random_uuid(),
  batch_id                 uuid not null references public.batches (id) on delete cascade,
  owner_id                 uuid not null references public.profiles (id) on delete cascade,
  org_id                   uuid,

  storage_path             text,

  emitente                 text,
  emitente_normalizado     text,
  banco_codigo             text,
  banco_nome               text,
  agencia                  text,
  conta                    text,
  numero_cheque            text,

  cmc7_bloco1              text,
  cmc7_bloco2              text,
  cmc7_bloco3              text,
  cmc7_completo            text,
  digitos_duvidosos        jsonb not null default '[]'::jsonb,
  cmc7_sugestoes           jsonb not null default '[]'::jsonb,

  valor_numerico           numeric(14, 2),
  valor_extenso_texto      text,
  valor_extenso_convertido numeric(14, 2),

  data_emissao             date,
  bom_para                 date,
  data_efetiva             date,

  nominal                  text,
  cidade                   text,
  assinatura_presente      boolean,
  rasuras                  jsonb not null default '[]'::jsonb,
  confianca                jsonb not null default '{}'::jsonb,
  observacoes              text,

  status                   text not null default 'conferir'
                             check (status in ('ok', 'conferir', 'vermelho')),
  alertas                  jsonb not null default '[]'::jsonb,
  lancado                  boolean not null default false,
  created_at               timestamptz not null default now()
);

create index if not exists cheques_batch_idx on public.cheques (batch_id);
create index if not exists cheques_owner_idx on public.cheques (owner_id, created_at desc);
create index if not exists cheques_emitente_idx on public.cheques (owner_id, emitente_normalizado);

alter table public.cheques enable row level security;

drop policy if exists "cheques_select_own" on public.cheques;
create policy "cheques_select_own" on public.cheques
  for select using (auth.uid() = owner_id);

drop policy if exists "cheques_insert_own" on public.cheques;
create policy "cheques_insert_own" on public.cheques
  for insert with check (auth.uid() = owner_id);

drop policy if exists "cheques_update_own" on public.cheques;
create policy "cheques_update_own" on public.cheques
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "cheques_delete_own" on public.cheques;
create policy "cheques_delete_own" on public.cheques
  for delete using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- Totais do lote sempre coerentes com as linhas de cheques.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_batch_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.batch_id, old.batch_id);
begin
  update public.batches b
     set total_valor = coalesce((select sum(c.valor_numerico) from public.cheques c where c.batch_id = target), 0),
         total_cheques = coalesce((select count(*) from public.cheques c where c.batch_id = target), 0)
   where b.id = target;
  return null;
end;
$$;

drop trigger if exists cheques_refresh_batch_totals on public.cheques;
create trigger cheques_refresh_batch_totals
  after insert or update of valor_numerico, batch_id or delete on public.cheques
  for each row execute function public.refresh_batch_totals();
