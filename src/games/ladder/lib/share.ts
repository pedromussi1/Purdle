interface ShareArgs {
  date: string
  start: string
  end: string
  playerSteps: number
  optimalSteps: number
  // 'won' = solved by reaching the target; 'gave-up' = revealed the optimal path.
  status: 'won' | 'gave-up'
}

// Compact, readable share text. Includes the puzzle's start/end words
// (already public on the site) and the outcome, but NOT the chain itself —
// recipients who haven't played yet still get to think.
export function buildShareText({
  date,
  start,
  end,
  playerSteps,
  optimalSteps,
  status,
}: ShareArgs): string {
  const headline = `${start.toUpperCase()} → ${end.toUpperCase()}`

  if (status === 'gave-up') {
    return `Ladder ${date}\nGave up at ${headline} (optimal: ${optimalSteps})`
  }

  const extra = playerSteps - optimalSteps
  if (extra <= 0) {
    return `Ladder ${date}\n${headline} in ${playerSteps} — optimal!`
  }
  const suffix = extra === 1 ? '1 over' : `${extra} over`
  return `Ladder ${date}\n${headline} in ${playerSteps} (${suffix} optimal)`
}
