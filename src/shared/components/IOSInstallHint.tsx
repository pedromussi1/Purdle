import { useEffect, useState } from 'react'

// One-time banner shown to iOS Safari users so they discover that Purdle
// is installable. iOS doesn't surface an install prompt the way Android
// Chrome does — the user has to tap Share → Add to Home Screen manually,
// and they'll never know unless we tell them. Dismissed forever after
// they tap the X.

const DISMISSED_KEY = 'purdle:ios-install-hint-dismissed'

function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  // iOS Safari: matches iPhone/iPad/iPod, NOT Chrome (CriOS) / Firefox (FxiOS).
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !('MSStream' in window)
  if (!isIOS) return false
  const isChromeOrFirefox = /CriOS|FxiOS/.test(ua)
  return !isChromeOrFirefox
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari uses navigator.standalone; spec-compliant browsers use the
  // display-mode media query.
  if ((window.navigator as { standalone?: boolean }).standalone) return true
  return window.matchMedia('(display-mode: standalone)').matches
}

export function IOSInstallHint() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isIOSSafari()) return
    if (isStandalone()) return
    if (window.localStorage.getItem(DISMISSED_KEY)) return
    // Wait a few seconds before showing — let the user see the page first
    // so the banner doesn't feel like a popover ad on landing.
    const t = setTimeout(() => setVisible(true), 4000)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  return (
    <div className="ios-install-hint" role="status" aria-live="polite">
      <div className="ios-install-hint-text">
        Install Purdle: tap{' '}
        <span className="ios-install-hint-icon" aria-hidden>
          ⬆
        </span>{' '}
        then <strong>Add to Home Screen</strong>.
      </div>
      <button
        className="ios-install-hint-close"
        onClick={dismiss}
        aria-label="Dismiss install hint"
      >
        ×
      </button>
    </div>
  )
}
