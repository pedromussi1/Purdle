import { useEffect } from 'react'
import { useWordleStore } from '../store'

export function Toast() {
  const toast = useWordleStore((s) => s.toast)
  const status = useWordleStore((s) => s.status)
  const resetToast = useWordleStore((s) => s.resetToast)

  useEffect(() => {
    if (!toast) return
    if (status !== 'in-progress') return
    const t = setTimeout(resetToast, 1500)
    return () => clearTimeout(t)
  }, [toast, status, resetToast])

  if (!toast) return null
  return <div className="toast">{toast}</div>
}
