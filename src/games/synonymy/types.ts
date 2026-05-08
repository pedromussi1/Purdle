export interface SynonymyPuzzle {
  date: string
  game: 'synonymy'
  lang: string
  schema_version: number
  start: string
  end: string
  optimal_steps: number
  optimal_path: string[]
  threshold: number
  generated_by?: string
}

export type SynonymyStatus = 'in-progress' | 'won' | 'gave-up'

export const WORD_LENGTH = 5
export const DEFAULT_LANGUAGE = 'en'
