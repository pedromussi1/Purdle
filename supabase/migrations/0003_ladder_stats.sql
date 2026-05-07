-- Purdle v3.4 schema: cloud-synced Word Ladder stats per user.
--
-- Run this in Supabase → SQL Editor → New query → paste → Run.
-- Idempotent (drops/recreates policies + trigger; uses IF NOT EXISTS for table).

-- 1. Stats table.
create table if not exists public.ladder_stats (
  user_id          uuid        primary key references auth.users(id) on delete cascade,
  played           int         not null default 0,
  won              int         not null default 0,
  -- Solved using exactly the optimal step count (matched the BFS-shortest path).
  optimal_solves   int         not null default 0,
  current_streak   int         not null default 0,
  max_streak       int         not null default 0,
  -- Sum of (player_steps - optimal_steps) across wins. Combined with `won`,
  -- gives an avg-extra-steps metric. Resets are not supported.
  total_extra_steps int        not null default 0,
  last_played_date date,
  last_won_date    date,
  updated_at       timestamptz not null default now()
);

-- 2. Row Level Security: each user can only read/write their own row.
alter table public.ladder_stats enable row level security;

drop policy if exists "users select own ladder stats" on public.ladder_stats;
drop policy if exists "users insert own ladder stats" on public.ladder_stats;
drop policy if exists "users update own ladder stats" on public.ladder_stats;

create policy "users select own ladder stats"
  on public.ladder_stats for select
  using (user_id = (select auth.uid()));

create policy "users insert own ladder stats"
  on public.ladder_stats for insert
  with check (user_id = (select auth.uid()));

create policy "users update own ladder stats"
  on public.ladder_stats for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3. Reuse the touch_wordle_stats_updated_at function from migration 0001.
drop trigger if exists ladder_stats_touch_updated_at on public.ladder_stats;
create trigger ladder_stats_touch_updated_at
  before insert or update on public.ladder_stats
  for each row execute function public.touch_wordle_stats_updated_at();
