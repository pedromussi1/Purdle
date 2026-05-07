// Tier difficulty for a Quartet group. 1 = easiest, 4 = trickiest. The frontend
// renders a different color per tier, but the player only learns each group's
// tier when it's solved (otherwise the colors would give the puzzle away).
export type Tier = 1 | 2 | 3 | 4

export interface Group {
  theme: string
  words: string[]      // exactly 4 lowercase words
  tier: Tier
}

export interface QuartetPuzzle {
  date: string
  game: 'quartet'
  lang: string
  schema_version: number
  groups: Group[]
  generated_by?: string
}

export type QuartetStatus = 'in-progress' | 'won' | 'lost'

export const GROUP_COUNT = 4
export const WORDS_PER_GROUP = 4
export const TOTAL_WORDS = GROUP_COUNT * WORDS_PER_GROUP
export const MAX_MISTAKES = 4
export const DEFAULT_LANGUAGE = 'en'
