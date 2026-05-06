import { useEffect, useState } from 'react'
import { useWordleStore } from '../store'
import { todayUTC } from '../../../shared/lib/date'
import { DEFAULT_LANGUAGE } from '../types'
import type { Puzzle } from '../types'

interface Manifest {
  dates: string[]
  schema_version?: number
}

const PUZZLES_BASE = `${import.meta.env.BASE_URL}puzzles/wordle/${DEFAULT_LANGUAGE}/`

async function fetchPuzzle(date: string): Promise<Puzzle | null> {
  try {
    const r = await fetch(PUZZLES_BASE + date + '.json', { cache: 'force-cache' })
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

// Try today's puzzle first; on miss (deploy lag, missing day), use the manifest
// to find the most recent available date <= today and load that instead.
export async function resolveTodayPuzzle(): Promise<Puzzle | null> {
  const today = todayUTC()
  const direct = await fetchPuzzle(today)
  if (direct) return direct

  const manifest = await fetchManifest()
  if (!manifest?.dates?.length) return null
  const latest = [...manifest.dates].filter((d) => d <= today).sort().pop()
  if (!latest) return null
  return fetchPuzzle(latest)
}

export type PuzzleStatus = 'loading' | 'ready' | 'unavailable'

export function usePuzzle(): { status: PuzzleStatus; puzzle: Puzzle | null } {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [status, setStatus] = useState<PuzzleStatus>('loading')
  const setStorePuzzle = useWordleStore((s) => s.setPuzzle)

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
