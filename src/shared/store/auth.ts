import { useEffect } from 'react'
import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type Provider = 'google' | 'github'

interface AuthState {
  // null = signed out, undefined = initial restore in progress
  user: User | null | undefined
  signInWithProvider: (provider: Provider) => Promise<void>
  signOut: () => Promise<void>
  // Internal — call once at app boot to restore the session and subscribe
  // to future auth changes.
  attach: () => () => void
}

export const useAuth = create<AuthState>((set) => ({
  user: supabase ? undefined : null,

  signInWithProvider: async (provider) => {
    if (!supabase) return
    // Bring the user back to /Purdle/ after the OAuth round-trip; the
    // Supabase client picks up the ?code=… on landing.
    const redirectTo = window.location.origin + import.meta.env.BASE_URL
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    })
    if (error) {
      console.error(`sign-in (${provider}) failed`, error)
      throw error
    }
  },

  signOut: async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) console.error('sign-out failed', error)
    set({ user: null })
  },

  attach: () => {
    if (!supabase) return () => {}
    void supabase.auth
      .getSession()
      .then(({ data }) => set({ user: data.session?.user ?? null }))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null })
    })
    return () => sub.subscription.unsubscribe()
  },
}))

// React entry point — call from App.tsx so the session restores on first
// render and subscribes to changes for the lifetime of the app.
export function useAuthBootstrap() {
  const attach = useAuth((s) => s.attach)
  useEffect(() => attach(), [attach])
}
