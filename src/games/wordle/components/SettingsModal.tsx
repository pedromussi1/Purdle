import { useState } from 'react'
import { Modal } from '../../../shared/components/Modal'
import { useSettings } from '../../../shared/store/settings'
import { useAuth, type Provider } from '../../../shared/store/auth'
import { isCloudConfigured } from '../../../shared/lib/supabase'
import { useWordleStore } from '../store'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props) {
  const { theme, toggleTheme, colorBlind, setColorBlind, hardMode, setHardMode } =
    useSettings()
  const guesses = useWordleStore((s) => s.guesses)
  const hardModeLocked = guesses.length > 0

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      {isCloudConfigured && <AccountSection />}
      <Toggle
        label="Hard mode"
        description="Any revealed hints must be used in subsequent guesses."
        checked={hardMode}
        disabled={hardModeLocked}
        onChange={setHardMode}
        disabledHint={
          hardModeLocked
            ? "Can't change hard mode after guessing has started."
            : undefined
        }
      />
      <Toggle
        label="Dark theme"
        description="Reduces glare in low-light environments."
        checked={theme === 'dark'}
        onChange={toggleTheme}
      />
      <Toggle
        label="Colour blind mode"
        description="High-contrast colours (orange / blue) instead of green / yellow."
        checked={colorBlind}
        onChange={setColorBlind}
      />
    </Modal>
  )
}

function AccountSection() {
  const user = useAuth((s) => s.user)
  const signInWithProvider = useAuth((s) => s.signInWithProvider)
  const signOut = useAuth((s) => s.signOut)
  const [busy, setBusy] = useState<Provider | 'signout' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn(provider: Provider) {
    setBusy(provider)
    setError(null)
    try {
      await signInWithProvider(provider)
      // After this, the browser redirects to the provider — onClose isn't
      // strictly needed, but the user won't see the modal anyway.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed')
      setBusy(null)
    }
  }

  async function handleSignOut() {
    setBusy('signout')
    try {
      await signOut()
    } finally {
      setBusy(null)
    }
  }

  if (user === undefined) {
    return (
      <div className="account-section">
        <div className="setting-label">Account</div>
        <div className="setting-desc">Loading…</div>
      </div>
    )
  }

  if (user === null) {
    return (
      <div className="account-section">
        <div className="setting-label">Account</div>
        <div className="setting-desc">
          Sign in to sync your stats across devices. Your local stats will be
          merged with whatever&apos;s on file the first time you sign in.
        </div>
        <div className="provider-buttons">
          <button
            type="button"
            className="provider-btn provider-btn--github"
            onClick={() => handleSignIn('github')}
            disabled={busy !== null}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.4 3.6 1 .1-.8.4-1.4.8-1.7-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.3-3.2-.1-.4-.6-1.6.1-3.3 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.3.8.8 1.3 1.9 1.3 3.2 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A12 12 0 0 0 12 .3"
              />
            </svg>
            {busy === 'github' ? 'Redirecting…' : 'Continue with GitHub'}
          </button>
          <button
            type="button"
            className="provider-btn provider-btn--google"
            onClick={() => handleSignIn('google')}
            disabled={busy !== null}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="#4285f4"
                d="M22.5 12.27c0-.78-.07-1.53-.2-2.27H12v4.51h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.27-4.74 3.27-8.33z"
              />
              <path
                fill="#34a853"
                d="M12 23c2.97 0 5.46-.99 7.28-2.68l-3.56-2.77c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z"
              />
              <path
                fill="#fbbc04"
                d="M5.85 14.08a6.6 6.6 0 0 1 0-4.16V7.08H2.18a11 11 0 0 0 0 9.84l3.67-2.84z"
              />
              <path
                fill="#ea4335"
                d="M12 5.38c1.61 0 3.06.55 4.2 1.64l3.16-3.16C17.46 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.08l3.67 2.84C6.71 7.31 9.14 5.38 12 5.38z"
              />
            </svg>
            {busy === 'google' ? 'Redirecting…' : 'Continue with Google'}
          </button>
        </div>
        {error && <div className="account-error">{error}</div>}
      </div>
    )
  }

  // Signed in
  const label = user.email ?? user.user_metadata?.user_name ?? 'Signed in'
  return (
    <div className="account-section">
      <div className="setting-label">Account</div>
      <div className="account-row">
        <span className="account-email" title={label}>
          {label}
        </span>
        <button
          type="button"
          className="archive-reveal-btn"
          onClick={handleSignOut}
          disabled={busy !== null}
        >
          {busy === 'signout' ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
      <div className="setting-desc">Stats sync to the cloud after each game.</div>
    </div>
  )
}

interface ToggleProps {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  disabledHint?: string
  onChange: (v: boolean) => void
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  disabledHint,
  onChange,
}: ToggleProps) {
  return (
    <div className={'setting' + (disabled ? ' setting--disabled' : '')}>
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        <div className="setting-desc">{disabledHint ?? description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={'switch' + (checked ? ' switch--on' : '')}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  )
}
