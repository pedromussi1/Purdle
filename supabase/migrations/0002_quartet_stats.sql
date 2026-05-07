-- Purdle v3 schema: cloud-synced Quartet stats per user.
--
-- Run this in Supabase → SQL Editor → New query → paste → Run.
-- Idempotent (drops/recreates policies + trigger; uses IF NOT EXISTS for table).

-- 1. Stats table — one row per authenticated user.
create table if not exists public.quartet_stats (
  user_id           uuid        primary key references auth.users(id) on delete cascade,
  played            int         not null default 0,
  won               int         not null default 0,
  perfect_solves    int         not null default 0,
  current_streak    int         not null default 0,
  max_streak        int         not null default 0,
  -- Bucket [i] = wins with i mistakes (i in 0..3). Always length 4.
  mistakes_distribution int[]   not null default array[0,0,0,0],
  -- Total groups solved across all attempts (4 if cleanly solved, fewer if abandoned).
  groups_solved_total int       not null default 0,
  last_played_date  date,
  last_won_date     date,
  updated_at        timestamptz not null default now()
);

-- 2. Row Level Security: each user can only read/write their own row.
alter table public.quartet_stats enable row level security;

drop policy if exists "users select own quartet stats" on public.quartet_stats;
drop policy if exists "users insert own quartet stats" on public.quartet_stats;
drop policy if exists "users update own quartet stats" on public.quartet_stats;

create policy "users select own quartet stats"
  on public.quartet_stats for select
  using (user_id = (select auth.uid()));

create policy "users insert own quartet stats"
  on public.quartet_stats for insert
  with check (user_id = (select auth.uid()));

create policy "users update own quartet stats"
  on public.quartet_stats for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3. Reuse the touch_wordle_stats_updated_at function from migration 0001.
--    (Same body, applied to a different table — function is generic.)
drop trigger if exists quartet_stats_touch_updated_at on public.quartet_stats;
create trigger quartet_stats_touch_updated_at
  before insert or update on public.quartet_stats
  for each row execute function public.touch_wordle_stats_updated_at();
