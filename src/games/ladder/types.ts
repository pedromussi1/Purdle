export interface LadderPuzzle {
  date: string
  game: 'ladder'
  lang: string
  schema_version: number
  start: string
  end: string
  optimal_steps: number
  optimal_path: string[]
  difficulty_similarity?: number | null
  generated_by?: string
}

export type LadderStatus = 'in-progress' | 'won' | 'gave-up'

export const WORD_LENGTH = 5
export const DEFAULT_LANGUAGE = 'en'
