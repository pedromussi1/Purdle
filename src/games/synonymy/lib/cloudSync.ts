import { supabase } from '../../../shared/lib/supabase'
import { useAuth } from '../../../shared/store/auth'
import { EMPTY_SYNONYMY_STATS, type SynonymyStatsSnapshot, useStats } from '../stats'

interface StatsRow {
  user_id: string
  played: number
  won: number
  optimal_solves: number
  current_streak: number
  max_streak: number
  total_extra_steps: number
  last_played_date: string | null
  last_won_date: string | null
}

function rowToSnapshot(r: StatsRow): SynonymyStatsSnapshot {
  return {
    played: r.played,
    won: r.won,
    optimalSolves: r.optimal_solves,
    currentStreak: r.current_streak,
    maxStreak: r.max_streak,
    totalExtraSteps: r.total_extra_steps,
    lastPlayedDate: r.last_played_date,
    lastWonDate: r.last_won_date,
  }
}

function snapshotToRow(s: SynonymyStatsSnapshot, userId: string): StatsRow {
  return {
    user_id: userId,
    played: s.played,
    won: s.won,
    optimal_solves: s.optimalSolves,
    current_streak: s.currentStreak,
    max_streak: s.maxStreak,
    total_extra_steps: s.totalExtraSteps,
    last_played_date: s.lastPlayedDate,
    last_won_date: s.lastWonDate,
  }
}

export function mergeSnapshots(a: SynonymyStatsSnapshot, b: SynonymyStatsSnapshot): SynonymyStatsSnapshot {
  const maxDate = (x: string | null, y: string | null) =>
    !x ? y : !y ? x : x > y ? x : y
  return {
    played: Math.max(a.played, b.played),
    won: Math.max(a.won, b.won),
    optimalSolves: Math.max(a.optimalSolves, b.optimalSolves),
    currentStreak: Math.max(a.currentStreak, b.currentStreak),
    maxStreak: Math.max(a.maxStreak, b.maxStreak),
    totalExtraSteps: Math.max(a.totalExtraSteps, b.totalExtraSteps),
    lastPlayedDate: maxDate(a.lastPlayedDate, b.lastPlayedDate),
    lastWonDate: maxDate(a.lastWonDate, b.lastWonDate),
  }
}

async function pullCloud(): Promise<SynonymyStatsSnapshot | null> {
  const user = useAuth.getState().user
  if (!supabase || !user) return null
  const { data, error } = await supabase
    .from('synonymy_stats')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) {
    console.error('synonymy stats pull failed', error)
    return null
  }
  return data ? rowToSnapshot(data as StatsRow) : EMPTY_SYNONYMY_STATS
}

async function pushCloud(snapshot: SynonymyStatsSnapshot): Promise<void> {
  const user = useAuth.getState().user
  if (!supabase || !user) return
  const { error } = await supabase
    .from('synonymy_stats')
    .upsert(snapshotToRow(snapshot, user.id), { onConflict: 'user_id' })
  if (error) console.error('synonymy stats push failed', error)
}

export async function syncOnSignIn(): Promise<void> {
  const cloud = await pullCloud()
  if (cloud === null) return
  const local = useStats.getState().snapshot()
  const merged = mergeSnapshots(local, cloud)
  if (JSON.stringify(merged) !== JSON.stringify(cloud)) {
    await pushCloud(merged)
  }
  useStats.getState().replace(merged)
}

export function attachCloudSync(): () => void {
  if (!supabase) return () => {}
  return useStats.subscribe((state, prev) => {
    if (state === prev) return
    if (!useAuth.getState().user) return
    void pushCloud(useStats.getState().snapshot())
  })
}
