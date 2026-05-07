import { useEffect, useState } from 'react'
import { Board } from './components/Board'
import { Keyboard } from './components/Keyboard'
import { Toast } from './components/Toast'
import { HintButton } from './components/HintButton'
import { useStore } from './StoreContext'

// Game UI driven entirely by the store in context — works for both today's
// persisted game and an ephemeral archive replay. Owns the keydown handler
// and the row-shake side-effect.
export function GameSurface() {
  const pressLetter = useStore((s) => s.pressLetter)
  const pressBackspace = useStore((s) => s.pressBackspace)
  const pressEnter = useStore((s) => s.pressEnter)
  const status = useStore((s) => s.status)
  const toast = useStore((s) => s.toast)

  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (toast && status === 'in-progress') {
      setShake(true)
      const t = setTimeout(() => setShake(false), 500)
      return () => clearTimeout(t)
    }
  }, [toast, status])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[aria-modal="true"]')) return
      if (e.key === 'Enter') {
        pressEnter()
      } else if (e.key === 'Backspace') {
        pressBackspace()
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        pressLetter(e.key)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pressEnter, pressBackspace, pressLetter])

  return (
    <>
      <Board shakeCurrent={shake} />
      <Toast />
      <HintButton />
      <Keyboard />
    </>
  )
}
