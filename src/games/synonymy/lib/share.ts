interface ShareArgs {
  date: string
  start: string
  end: string
  playerSteps: number
  optimalSteps: number
  status: 'won' | 'gave-up'
}

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
    return `Synonymy ${date}\nGave up at ${headline} (optimal: ${optimalSteps})`
  }
  const extra = playerSteps - optimalSteps
  if (extra <= 0) {
    return `Synonymy ${date}\n${headline} in ${playerSteps} — optimal!`
  }
  const suffix = extra === 1 ? '1 over' : `${extra} over`
  return `Synonymy ${date}\n${headline} in ${playerSteps} (${suffix} optimal)`
}
