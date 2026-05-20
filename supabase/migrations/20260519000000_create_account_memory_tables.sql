-- Account-backed memory for the chat-first assistant.
-- Keep favorites and scraped perfumes as-is; this migration adds the user-owned
-- memory that currently lives in browser storage so it can sync across devices.

create extension if not exists pgcrypto;

-- ============================================================
-- shared helper for updated_at columns
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- user_profiles: persistent onboarding / taste profile per user
-- ============================================================
create table if not exists user_profiles (
  user_id                 text        not null default (auth.jwt() ->> 'sub'),
  onboarding_choice       text,
  taste_profile           jsonb       not null default '{}'::jsonb,
  include_favorites_default boolean   not null default true,
  ranking_preference      text        not null default 'balanced',
  last_query              text,
  updated_at              timestamptz  not null default now(),
  created_at              timestamptz  not null default now(),
  primary key (user_id)
);

alter table user_profiles enable row level security;

drop policy if exists "Users read own profile" on user_profiles;
create policy "Users read own profile"
  on user_profiles for select
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Users insert own profile" on user_profiles;
create policy "Users insert own profile"
  on user_profiles for insert
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Users update own profile" on user_profiles;
create policy "Users update own profile"
  on user_profiles for update
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Users delete own profile" on user_profiles;
create policy "Users delete own profile"
  on user_profiles for delete
  using (user_id = (auth.jwt() ->> 'sub'));

drop trigger if exists set_user_profiles_updated_at on user_profiles;
create trigger set_user_profiles_updated_at
before update on user_profiles
for each row
execute function public.set_updated_at();

create index if not exists user_profiles_updated_at_idx on user_profiles (updated_at desc);
grant select, insert, update, delete on user_profiles to anon, authenticated, service_role;

-- ============================================================
-- chat_threads: one row per assistant conversation
-- ============================================================
create table if not exists chat_threads (
  id                uuid        primary key default gen_random_uuid(),
  user_id           text        not null default (auth.jwt() ->> 'sub'),
  title             text        not null default 'New conversation',
  surface           text        not null default 'home',
  summary           text,
  include_favorites  boolean     not null default true,
  ranking_preference text        not null default 'balanced',
  seed_ids          jsonb       not null default '[]'::jsonb,
  taste_profile     jsonb       not null default '{}'::jsonb,
  last_message_at   timestamptz  not null default now(),
  updated_at        timestamptz  not null default now(),
  created_at        timestamptz  not null default now()
);

alter table chat_threads enable row level security;

drop policy if exists "Users read own threads" on chat_threads;
create policy "Users read own threads"
  on chat_threads for select
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Users insert own threads" on chat_threads;
create policy "Users insert own threads"
  on chat_threads for insert
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Users update own threads" on chat_threads;
create policy "Users update own threads"
  on chat_threads for update
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Users delete own threads" on chat_threads;
create policy "Users delete own threads"
  on chat_threads for delete
  using (user_id = (auth.jwt() ->> 'sub'));

drop trigger if exists set_chat_threads_updated_at on chat_threads;
create trigger set_chat_threads_updated_at
before update on chat_threads
for each row
execute function public.set_updated_at();

create index if not exists chat_threads_user_last_message_idx on chat_threads (user_id, last_message_at desc);
create index if not exists chat_threads_created_at_idx on chat_threads (created_at desc);
grant select, insert, update, delete on chat_threads to anon, authenticated, service_role;

-- ============================================================
-- chat_messages: full message log for each thread
-- ============================================================
create table if not exists chat_messages (
  id         uuid        primary key default gen_random_uuid(),
  thread_id  uuid        not null references chat_threads(id) on delete cascade,
  user_id    text        not null default (auth.jwt() ->> 'sub'),
  role       text        not null,
  content    text        not null,
  metadata   jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint chat_messages_role_check check (role in ('user', 'assistant', 'tool', 'system'))
);

alter table chat_messages enable row level security;

drop policy if exists "Users read own messages" on chat_messages;
create policy "Users read own messages"
  on chat_messages for select
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Users insert own messages" on chat_messages;
create policy "Users insert own messages"
  on chat_messages for insert
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Users update own messages" on chat_messages;
create policy "Users update own messages"
  on chat_messages for update
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Users delete own messages" on chat_messages;
create policy "Users delete own messages"
  on chat_messages for delete
  using (user_id = (auth.jwt() ->> 'sub'));

create index if not exists chat_messages_thread_created_idx on chat_messages (thread_id, created_at asc);
create index if not exists chat_messages_user_created_idx on chat_messages (user_id, created_at desc);
grant select, insert, update, delete on chat_messages to anon, authenticated, service_role;

-- ============================================================
-- saved_recommendations: persisted assistant result cards
-- One row per user/doc_id pair to mirror the current browser dedupe model.
-- ============================================================
create table if not exists saved_recommendations (
  user_id        text        not null default (auth.jwt() ->> 'sub'),
  doc_id         text        not null,
  thread_id      uuid        null references chat_threads(id) on delete set null,
  query          text,
  brand          text        not null,
  name           text        not null,
  official_url   text,
  url            text,
  source_type    text,
  rating_value   text,
  rating_count   text,
  accords        jsonb       not null default '[]'::jsonb,
  notes          jsonb       not null default '[]'::jsonb,
  release_signal text,
  snippet        text,
  score          numeric,
  metadata       jsonb       not null default '{}'::jsonb,
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  primary key (user_id, doc_id)
);

alter table saved_recommendations enable row level security;

drop policy if exists "Users read own saved recommendations" on saved_recommendations;
create policy "Users read own saved recommendations"
  on saved_recommendations for select
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Users insert own saved recommendations" on saved_recommendations;
create policy "Users insert own saved recommendations"
  on saved_recommendations for insert
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Users update own saved recommendations" on saved_recommendations;
create policy "Users update own saved recommendations"
  on saved_recommendations for update
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Users delete own saved recommendations" on saved_recommendations;
create policy "Users delete own saved recommendations"
  on saved_recommendations for delete
  using (user_id = (auth.jwt() ->> 'sub'));

drop trigger if exists set_saved_recommendations_updated_at on saved_recommendations;
create trigger set_saved_recommendations_updated_at
before update on saved_recommendations
for each row
execute function public.set_updated_at();

create index if not exists saved_recommendations_user_created_idx on saved_recommendations (user_id, created_at desc);
create index if not exists saved_recommendations_thread_idx on saved_recommendations (thread_id);
grant select, insert, update, delete on saved_recommendations to anon, authenticated, service_role;
