-- Habit tracker: per-user normalized schema with RLS, soft-delete tombstones,
-- composite FKs (cross-user injection guard), and server-authoritative updated_at.
--
-- Conventions:
--   * user_id denormalized onto every table -> flat RLS (auth.uid() = user_id), no joins.
--   * id columns are text: client generates UUID strings reused as PKs (offline-first identity).
--   * date keys are local-time 'YYYY-MM-DD' strings (matches lib/date.ts).
--   * deleted_at tombstones drive the delta-pull sync; hard deletes can't be detected remotely.
--   * notifIds is local-only and intentionally NOT stored here.

-- ---------------------------------------------------------------------------
-- updated_at trigger (server-authoritative; never trust client timestamps)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  onboarded   boolean not null default false,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile" on public.profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create trigger profiles_set_updated_at
  before insert or update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- settings (one row per user)
-- ---------------------------------------------------------------------------
create table public.settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  sound            boolean not null default true,
  haptics          boolean not null default true,
  default_reminder jsonb   not null default '{"hour":9,"minute":0}'::jsonb,
  updated_at       timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "own settings" on public.settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger settings_set_updated_at
  before insert or update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- habits
-- PK (user_id, id) so child FKs can reference (user_id, id) and a child can
-- only ever attach to a habit the SAME user owns (blocks cross-user injection).
-- ---------------------------------------------------------------------------
create table public.habits (
  id             text not null,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null default '',
  emoji          text not null default '',
  color          text not null default '',
  type           text not null check (type in ('binary', 'volume')),
  target         integer not null default 1,
  created_at_key text not null,                 -- 'YYYY-MM-DD' (Habit.createdAt)
  reminders      jsonb not null default '[]'::jsonb,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  primary key (user_id, id)
);

alter table public.habits enable row level security;

create policy "own habits" on public.habits
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger habits_set_updated_at
  before insert or update on public.habits
  for each row execute function public.set_updated_at();

create index habits_user_updated_idx on public.habits (user_id, updated_at);
create index habits_user_deleted_idx on public.habits (user_id, deleted_at);

-- ---------------------------------------------------------------------------
-- challenges
-- ---------------------------------------------------------------------------
create table public.challenges (
  id          text not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id    text not null,
  length_days integer not null,
  start_date  text not null,                    -- 'YYYY-MM-DD'
  status      text not null check (status in ('active', 'completed', 'failed')),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (user_id, id),
  foreign key (user_id, habit_id)
    references public.habits (user_id, id) on delete cascade
);

alter table public.challenges enable row level security;

create policy "own challenges" on public.challenges
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger challenges_set_updated_at
  before insert or update on public.challenges
  for each row execute function public.set_updated_at();

create index challenges_user_updated_idx on public.challenges (user_id, updated_at);
create index challenges_user_deleted_idx on public.challenges (user_id, deleted_at);
create index challenges_user_habit_idx   on public.challenges (user_id, habit_id);

-- ---------------------------------------------------------------------------
-- daily_logs (flattened Habit.log: one row per (habit, day))
-- deleted_at tombstone needed: the store removes a log entry when count hits 0,
-- and a delta-pull learns of that only via the tombstone, not a vanished row.
-- ---------------------------------------------------------------------------
create table public.daily_logs (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id   text not null,
  date       text not null,                     -- 'YYYY-MM-DD'
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, habit_id, date),
  foreign key (user_id, habit_id)
    references public.habits (user_id, id) on delete cascade
);

alter table public.daily_logs enable row level security;

create policy "own daily_logs" on public.daily_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger daily_logs_set_updated_at
  before insert or update on public.daily_logs
  for each row execute function public.set_updated_at();

create index daily_logs_user_updated_idx on public.daily_logs (user_id, updated_at);
create index daily_logs_user_deleted_idx on public.daily_logs (user_id, deleted_at);
create index daily_logs_user_habit_idx   on public.daily_logs (user_id, habit_id);
