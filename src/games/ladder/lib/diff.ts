// Find the index of the single character that differs between two equal-length
// strings. Returns -1 if they're identical, or null if they differ in more
// than one position (so the caller can report "not a one-letter change").
export function singleLetterDiff(a: string, b: string): number | null {
  if (a.length !== b.length) return null
  let diff = -1
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      if (diff !== -1) return null
      diff = i
    }
  }
  return diff
}
