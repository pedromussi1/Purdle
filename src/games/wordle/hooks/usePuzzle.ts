import { useEffect, useState } from 'react'
import { useStore } from '../StoreContext'
import { todayUTC } from '../../../shared/lib/date'
import { DEFAULT_LANGUAGE } from '../types'
import type { Puzzle } from '../types'

interface Manifest {
  dates: string[]
  schema_version?: number
}

const PUZZLES_BASE = `${import.meta.env.BASE_URL}puzzles/wordle/${DEFAULT_LANGUAGE}/`

export type PuzzleStatus = 'loading' | 'ready' | 'unavailable'

async function fetchPuzzle(date: string): Promise<Puzzle | null> {
  try {
    const r = await fetch(PUZZLES_BASE + date + '.json', { cache: 'no-cache' })
    if (!r.ok) return null
    return (await r.json()) as Puzzle
  } catch {
    return null
  }
}

async function fetchManifest(): Promise<Manifest | null> {
  try {
    const r = await fetch(PUZZLES_BASE + 'index.json', { cache: 'no-cache' })
    if (!r.ok) return null
    return (await r.json()) as Manifest
  } catch {
    return null
  }
}

// Try today's puzzle first; on miss (deploy lag, missing day), use the
// manifest to find the most recent available date <= today.
async function resolveTodayPuzzle(): Promise<Puzzle | null> {
  const today = todayUTC()
  const direct = await fetchPuzzle(today)
  if (direct) return direct

  const manifest = await fetchManifest()
  if (!manifest?.dates?.length) return null
  const latest = [...manifest.dates].filter((d) => d <= today).sort().pop()
  if (!latest) return null
  return fetchPuzzle(latest)
}

// Fetches today's puzzle and pushes it into the store from context. Used by
// the today route (`/`).
export function usePuzzle(): { status: PuzzleStatus; puzzle: Puzzle | null } {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [status, setStatus] = useState<PuzzleStatus>('loading')
  const setStorePuzzle = useStore((s) => s.setPuzzle)

  useEffect(() => {
    let cancelled = false
    resolveTodayPuzzle().then((p) => {
      if (cancelled) return
      if (!p) {
        setStatus('unavailable')
        return
      }
      setPuzzle(p)
      setStatus('ready')
      setStorePuzzle({ date: p.date, solution: p.solution })
    })
    return () => {
      cancelled = true
    }
  }, [setStorePuzzle])

  return { status, puzzle }
}

// Fetches a specific date's puzzle directly. Used by the archive replay
// route (`/archive/:date`). No manifest fallback — if the file is missing,
// status is 'unavailable' so the caller can show a NotFound-ish state.
export function useDatePuzzle(date: string): {
  status: PuzzleStatus
  puzzle: Puzzle | null
} {
  const [puzzle, setPuzzleLocal] = useState<Puzzle | null>(null)
  const [status, setStatus] = useState<PuzzleStatus>('loading')
  const setStorePuzzle = useStore((s) => s.setPuzzle)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    fetchPuzzle(date).then((p) => {
      if (cancelled) return
      if (!p) {
        setStatus('unavailable')
        return
      }
      setPuzzleLocal(p)
      setStatus('ready')
      setStorePuzzle({ date: p.date, solution: p.solution })
    })
    return () => {
      cancelled = true
    }
  }, [date, setStorePuzzle])

  return { status, puzzle }
}
