export type TileState = 'empty' | 'filled' | 'correct' | 'present' | 'absent'

export type LetterEvaluation = 'correct' | 'present' | 'absent'

export type GameStatus = 'in-progress' | 'won' | 'lost'

export const WORD_LENGTH = 5
export const MAX_GUESSES = 6

// BCP-47-ish lowercase language tag, e.g. 'en', 'es', 'fr', 'de', 'pt-br'.
// v1 only ships 'en'; the field exists now so future locales slot in
// without a schema migration.
export type LanguageTag = string

export const DEFAULT_LANGUAGE: LanguageTag = 'en'

export interface Puzzle {
  date: string
  game: 'wordle'
  lang: LanguageTag
  solution: string
  difficulty?: number
  theme?: string | null
  etymology?: string
  generated_by?: string
  schema_version?: number
}
