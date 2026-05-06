// UTC "today" — the puzzle date for everyone, regardless of local timezone.
// Matches what the GitHub Action commits at 00:05 UTC daily.
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}
