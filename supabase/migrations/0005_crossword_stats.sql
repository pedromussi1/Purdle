-- Purdle v3.7 schema: cloud-synced Crossword stats per user.
--
-- Run this in Supabase → SQL Editor → New query → paste → Run.
-- Idempotent (drops/recreates policies + trigger; uses IF NOT EXISTS for table).

create table if not exists public.crossword_stats (
  user_id          uuid        primary key references auth.users(id) on delete cascade,
  played           int         not null default 0,
  won              int         not null default 0,
  perfect_solves   int         not null default 0,  -- Solved with no check/reveal usage.
  current_streak   int         not null default 0,
  max_streak       int         not null default 0,
  total_check_uses int         not null default 0,
  total_reveal_uses int        not null default 0,
  last_played_date date,
  last_won_date    date,
  updated_at       timestamptz not null default now()
);

alter table public.crossword_stats enable row level security;

drop policy if exists "users select own crossword stats" on public.crossword_stats;
drop policy if exists "users insert own crossword stats" on public.crossword_stats;
drop policy if exists "users update own crossword stats" on public.crossword_stats;

create policy "users select own crossword stats"
  on public.crossword_stats for select
  using (user_id = (select auth.uid()));

create policy "users insert own crossword stats"
  on public.crossword_stats for insert
  with check (user_id = (select auth.uid()));

create policy "users update own crossword stats"
  on public.crossword_stats for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists crossword_stats_touch_updated_at on public.crossword_stats;
create trigger crossword_stats_touch_updated_at
  before insert or update on public.crossword_stats
  for each row execute function public.touch_wordle_stats_updated_at();
