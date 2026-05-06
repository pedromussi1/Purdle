import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Cloud sync is opt-in: if either env var is missing, we run as v1 did (local
// stats only, no sign-in UI). This keeps local development frictionless and
// means the build doesn't fail when secrets aren't configured.
export const supabase: SupabaseClient | null =
  URL && ANON_KEY
    ? createClient(URL, ANON_KEY, {
        auth: {
          // Persist session across reloads (default true). Use the standard
          // localStorage key so devtools-clearers can find it.
          persistSession: true,
          autoRefreshToken: true,
          // Detect the OAuth redirect callback (?code=...) on /auth/callback
          // and populate the session automatically.
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      })
    : null

export const isCloudConfigured = supabase !== null
