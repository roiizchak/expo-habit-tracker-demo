-- coach_messages: server-side cache of AI-generated coaching output.
--
-- Follows the same conventions as the init schema (denormalized user_id for flat
-- RLS, server-authoritative updated_at trigger, FK cascade to auth.users).
--
-- Written ONLY by the `ai-coach` Edge Function (under the caller's JWT, so RLS
-- still applies). `period_key` is computed server-side from the client's IANA
-- timezone and doubles as the cache/rate-limit key:
--   * nudge      -> 'YYYY-MM-DD' (one per local day)
--   * reflection -> 'YYYY-Www' (ISO week) or 'YYYY-MM' (month)
-- `is_pending` + nullable `content` implement a concurrency sentinel: the slot is
-- reserved BEFORE the Claude call so two simultaneous cache-misses don't both bill.
create table public.coach_messages (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('nudge', 'reflection')),
  period_key  text not null,                  -- nudge: 'YYYY-MM-DD'; reflection: 'YYYY-Www' | 'YYYY-MM'
  content     text,                            -- null while a sentinel row reserves the slot
  is_pending  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, kind, period_key)
);

alter table public.coach_messages enable row level security;

create policy "own coach messages" on public.coach_messages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Backs the per-day rate-limit count query (filter by user_id + kind + created_at).
create index coach_messages_user_kind_created_idx
  on public.coach_messages (user_id, kind, created_at);

create trigger coach_messages_set_updated_at
  before insert or update on public.coach_messages
  for each row execute function public.set_updated_at();
