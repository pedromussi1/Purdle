import { useEffect } from 'react'
import { useStore } from '../StoreContext'

export function Toast() {
  const toast = useStore((s) => s.toast)
  const status = useStore((s) => s.status)
  const resetToast = useStore((s) => s.resetToast)

  useEffect(() => {
    if (!toast) return
    if (status !== 'in-progress') return
    const t = setTimeout(resetToast, 1800)
    return () => clearTimeout(t)
  }, [toast, status, resetToast])

  if (!toast) return null
  return <div className="toast">{toast}</div>
}
