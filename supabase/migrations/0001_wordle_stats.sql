-- Purdle v2 schema: cloud-synced wordle stats per user.
--
-- Run this once in Supabase → SQL Editor → New query → paste → Run.
-- Idempotent (drops/recreates the trigger; uses IF NOT EXISTS for table).

-- 1. Stats table — one row per authenticated user.
create table if not exists public.wordle_stats (
  user_id          uuid        primary key references auth.users(id) on delete cascade,
  played           int         not null default 0,
  won              int         not null default 0,
  current_streak   int         not null default 0,
  max_streak       int         not null default 0,
  -- Bucket [i] = number of wins in (i+1) guesses. Always length 6.
  distribution     int[]       not null default array[0,0,0,0,0,0],
  last_played_date date,
  last_won_date    date,
  updated_at       timestamptz not null default now()
);

-- 2. Row Level Security: each user can only read/write their own row.
alter table public.wordle_stats enable row level security;

-- Drop policies if they already exist so the script is rerunnable.
drop policy if exists "users select own stats"  on public.wordle_stats;
drop policy if exists "users insert own stats"  on public.wordle_stats;
drop policy if exists "users update own stats"  on public.wordle_stats;

create policy "users select own stats"
  on public.wordle_stats for select
  using (user_id = (select auth.uid()));

create policy "users insert own stats"
  on public.wordle_stats for insert
  with check (user_id = (select auth.uid()));

create policy "users update own stats"
  on public.wordle_stats for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- (No delete policy: users can't drop their stats from the client.
--  The on-delete cascade in the FK handles row removal when a user is deleted.)

-- 3. Auto-update the updated_at column on every row write.
create or replace function public.touch_wordle_stats_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists wordle_stats_touch_updated_at on public.wordle_stats;
create trigger wordle_stats_touch_updated_at
  before insert or update on public.wordle_stats
  for each row execute function public.touch_wordle_stats_updated_at();

-- 4. (Optional but recommended) Heartbeat row used by the daily-puzzle
--    GitHub Action to keep the project from auto-pausing after 7 days
--    of inactivity on the free tier. Single row, public read, only the
--    service role can write — but the action uses the anon key, so we
--    open up upsert to anon as well.
create table if not exists public.heartbeat (
  id        text        primary key default 'singleton',
  pinged_at timestamptz not null default now()
);

alter table public.heartbeat enable row level security;

drop policy if exists "anyone can read heartbeat" on public.heartbeat;
drop policy if exists "anyone can ping heartbeat" on public.heartbeat;

create policy "anyone can read heartbeat"
  on public.heartbeat for select
  using (true);

create policy "anyone can ping heartbeat"
  on public.heartbeat for insert
  with check (id = 'singleton');

create policy "anyone can update heartbeat"
  on public.heartbeat for update
  using (id = 'singleton')
  with check (id = 'singleton');

-- Seed the singleton row.
insert into public.heartbeat (id, pinged_at)
values ('singleton', now())
on conflict (id) do nothing;
