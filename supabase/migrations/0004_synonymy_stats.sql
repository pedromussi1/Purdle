-- Purdle v3.5 schema: cloud-synced Synonymy stats per user.
--
-- Run this in Supabase → SQL Editor → New query → paste → Run.
-- Idempotent (drops/recreates policies + trigger; uses IF NOT EXISTS for table).

create table if not exists public.synonymy_stats (
  user_id          uuid        primary key references auth.users(id) on delete cascade,
  played           int         not null default 0,
  won              int         not null default 0,
  optimal_solves   int         not null default 0,
  current_streak   int         not null default 0,
  max_streak       int         not null default 0,
  total_extra_steps int        not null default 0,
  last_played_date date,
  last_won_date    date,
  updated_at       timestamptz not null default now()
);

alter table public.synonymy_stats enable row level security;

drop policy if exists "users select own synonymy stats" on public.synonymy_stats;
drop policy if exists "users insert own synonymy stats" on public.synonymy_stats;
drop policy if exists "users update own synonymy stats" on public.synonymy_stats;

create policy "users select own synonymy stats"
  on public.synonymy_stats for select
  using (user_id = (select auth.uid()));

create policy "users insert own synonymy stats"
  on public.synonymy_stats for insert
  with check (user_id = (select auth.uid()));

create policy "users update own synonymy stats"
  on public.synonymy_stats for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists synonymy_stats_touch_updated_at on public.synonymy_stats;
create trigger synonymy_stats_touch_updated_at
  before insert or update on public.synonymy_stats
  for each row execute function public.touch_wordle_stats_updated_at();
