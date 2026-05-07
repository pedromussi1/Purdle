import { useEffect, useState } from 'react'
import { useStore } from '../StoreContext'
import { todayUTC } from '../../../shared/lib/date'
import { DEFAULT_LANGUAGE, type QuartetPuzzle } from '../types'

interface Manifest {
  dates: string[]
}

const PUZZLES_BASE = `${import.meta.env.BASE_URL}puzzles/quartet/${DEFAULT_LANGUAGE}/`

export type PuzzleStatus = 'loading' | 'ready' | 'unavailable'

async function fetchPuzzle(date: string): Promise<QuartetPuzzle | null> {
  try {
    const r = await fetch(PUZZLES_BASE + date + '.json', { cache: 'no-cache' })
    if (!r.ok) return null
    return (await r.json()) as QuartetPuzzle
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

async function resolveTodayPuzzle(): Promise<QuartetPuzzle | null> {
  const today = todayUTC()
  const direct = await fetchPuzzle(today)
  if (direct) return direct
  const manifest = await fetchManifest()
  if (!manifest?.dates?.length) return null
  const latest = [...manifest.dates].filter((d) => d <= today).sort().pop()
  if (!latest) return null
  return fetchPuzzle(latest)
}

export function usePuzzle(): { status: PuzzleStatus; puzzle: QuartetPuzzle | null } {
  const [puzzle, setPuzzle] = useState<QuartetPuzzle | null>(null)
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
      setStorePuzzle(p)
    })
    return () => {
      cancelled = true
    }
  }, [setStorePuzzle])

  return { status, puzzle }
}

export function useDatePuzzle(date: string): {
  status: PuzzleStatus
  puzzle: QuartetPuzzle | null
} {
  const [puzzle, setPuzzleLocal] = useState<QuartetPuzzle | null>(null)
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
      setStorePuzzle(p)
    })
    return () => {
      cancelled = true
    }
  }, [date, setStorePuzzle])

  return { status, puzzle }
}

export { fetchPuzzle, fetchManifest, PUZZLES_BASE }
