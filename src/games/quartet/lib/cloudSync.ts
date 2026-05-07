import { supabase } from '../../../shared/lib/supabase'
import { useAuth } from '../../../shared/store/auth'
import { EMPTY_QUARTET_STATS, type QuartetStatsSnapshot, useStats } from '../stats'

interface StatsRow {
  user_id: string
  played: number
  won: number
  perfect_solves: number
  current_streak: number
  max_streak: number
  mistakes_distribution: number[]
  groups_solved_total: number
  last_played_date: string | null
  last_won_date: string | null
}

function rowToSnapshot(row: StatsRow): QuartetStatsSnapshot {
  return {
    played: row.played,
    won: row.won,
    perfectSolves: row.perfect_solves,
    currentStreak: row.current_streak,
    maxStreak: row.max_streak,
    mistakesDistribution: [...row.mistakes_distribution],
    groupsSolvedTotal: row.groups_solved_total,
    lastPlayedDate: row.last_played_date,
    lastWonDate: row.last_won_date,
  }
}

function snapshotToRow(s: QuartetStatsSnapshot, userId: string): StatsRow {
  return {
    user_id: userId,
    played: s.played,
    won: s.won,
    perfect_solves: s.perfectSolves,
    current_streak: s.currentStreak,
    max_streak: s.maxStreak,
    mistakes_distribution: s.mistakesDistribution,
    groups_solved_total: s.groupsSolvedTotal,
    last_played_date: s.lastPlayedDate,
    last_won_date: s.lastWonDate,
  }
}

export function mergeSnapshots(
  a: QuartetStatsSnapshot,
  b: QuartetStatsSnapshot,
): QuartetStatsSnapshot {
  const maxDate = (x: string | null, y: string | null): string | null => {
    if (!x) return y
    if (!y) return x
    return x > y ? x : y
  }
  return {
    played: Math.max(a.played, b.played),
    won: Math.max(a.won, b.won),
    perfectSolves: Math.max(a.perfectSolves, b.perfectSolves),
    currentStreak: Math.max(a.currentStreak, b.currentStreak),
    maxStreak: Math.max(a.maxStreak, b.maxStreak),
    mistakesDistribution: a.mistakesDistribution.map((v, i) =>
      Math.max(v, b.mistakesDistribution[i] ?? 0),
    ),
    groupsSolvedTotal: Math.max(a.groupsSolvedTotal, b.groupsSolvedTotal),
    lastPlayedDate: maxDate(a.lastPlayedDate, b.lastPlayedDate),
    lastWonDate: maxDate(a.lastWonDate, b.lastWonDate),
  }
}

async function pullCloud(): Promise<QuartetStatsSnapshot | null> {
  const user = useAuth.getState().user
  if (!supabase || !user) return null
  const { data, error } = await supabase
    .from('quartet_stats')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) {
    console.error('quartet stats pull failed', error)
    return null
  }
  return data ? rowToSnapshot(data as StatsRow) : EMPTY_QUARTET_STATS
}

async function pushCloud(snapshot: QuartetStatsSnapshot): Promise<void> {
  const user = useAuth.getState().user
  if (!supabase || !user) return
  const { error } = await supabase
    .from('quartet_stats')
    .upsert(snapshotToRow(snapshot, user.id), { onConflict: 'user_id' })
  if (error) console.error('quartet stats push failed', error)
}

// One-shot: pull cloud, merge with local, write merged to both.
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

// Subscribe to local stats changes; mirror each change to cloud when signed in.
export function attachCloudSync(): () => void {
  if (!supabase) return () => {}
  return useStats.subscribe((state, prev) => {
    if (state === prev) return
    if (!useAuth.getState().user) return
    void pushCloud(useStats.getState().snapshot())
  })
}
