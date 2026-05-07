import { supabase } from '../../../shared/lib/supabase'
import { useAuth } from '../../../shared/store/auth'
import { EMPTY_STATS, type StatsSnapshot, useStats } from '../stats'

// Maps DB row → in-memory snapshot. The DB uses snake_case + Postgres
// arrays; the client uses camelCase + JS arrays.
interface StatsRow {
  user_id: string
  played: number
  won: number
  current_streak: number
  max_streak: number
  distribution: number[]
  last_played_date: string | null
  last_won_date: string | null
}

function rowToSnapshot(row: StatsRow): StatsSnapshot {
  return {
    played: row.played,
    won: row.won,
    currentStreak: row.current_streak,
    maxStreak: row.max_streak,
    distribution: [...row.distribution],
    lastPlayedDate: row.last_played_date,
    lastWonDate: row.last_won_date,
  }
}

function snapshotToRow(s: StatsSnapshot, userId: string): StatsRow {
  return {
    user_id: userId,
    played: s.played,
    won: s.won,
    current_streak: s.currentStreak,
    max_streak: s.maxStreak,
    distribution: s.distribution,
    last_played_date: s.lastPlayedDate,
    last_won_date: s.lastWonDate,
  }
}

// Forgiving merge: take max of each scalar, element-wise max of the
// distribution, latest of the two dates. Never *loses* progress; can
// undercount in the rare case of independent device plays before
// signing in. Acceptable trade-off for a single-player puzzle.
export function mergeSnapshots(
  a: StatsSnapshot,
  b: StatsSnapshot,
): StatsSnapshot {
  const maxDate = (x: string | null, y: string | null): string | null => {
    if (!x) return y
    if (!y) return x
    return x > y ? x : y
  }
  return {
    played: Math.max(a.played, b.played),
    won: Math.max(a.won, b.won),
    currentStreak: Math.max(a.currentStreak, b.currentStreak),
    maxStreak: Math.max(a.maxStreak, b.maxStreak),
    distribution: a.distribution.map((v, i) =>
      Math.max(v, b.distribution[i] ?? 0),
    ),
    lastPlayedDate: maxDate(a.lastPlayedDate, b.lastPlayedDate),
    lastWonDate: maxDate(a.lastWonDate, b.lastWonDate),
  }
}

async function pullCloudSnapshot(): Promise<StatsSnapshot | null> {
  const user = useAuth.getState().user
  if (!supabase || !user) return null
  const { data, error } = await supabase
    .from('wordle_stats')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) {
    console.error('stats pull failed', error)
    return null
  }
  return data ? rowToSnapshot(data as StatsRow) : EMPTY_STATS
}

async function pushCloudSnapshot(snapshot: StatsSnapshot): Promise<void> {
  const user = useAuth.getState().user
  if (!supabase || !user) return
  const { error } = await supabase
    .from('wordle_stats')
    .upsert(snapshotToRow(snapshot, user.id), { onConflict: 'user_id' })
  if (error) console.error('stats push failed', error)
}

// Called when auth state transitions to "signed in". Pulls cloud, merges
// with local, writes the merged result to both. Idempotent — safe to
// call multiple times.
export async function syncOnSignIn(): Promise<void> {
  const cloud = await pullCloudSnapshot()
  if (cloud === null) return
  const local = useStats.getState().snapshot()
  const merged = mergeSnapshots(local, cloud)
  // Only push if it actually differs from cloud, to avoid a no-op write.
  const same = JSON.stringify(merged) === JSON.stringify(cloud)
  if (!same) await pushCloudSnapshot(merged)
  useStats.getState().replace(merged)
}

// Set up at app boot. Subscribes to local stats changes and pushes to
// cloud whenever the player is signed in. Returns an unsubscribe.
export function attachStatsCloudSync(): () => void {
  if (!supabase) return () => {}
  return useStats.subscribe((state, prev) => {
    if (state === prev) return
    if (!useAuth.getState().user) return
    // Fire-and-forget — local state already updated; if push fails,
    // the next change re-attempts.
    void pushCloudSnapshot(useStats.getState().snapshot())
  })
}
