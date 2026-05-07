import { useStore } from './StoreContext'
import { Chain } from './components/Chain'
import { Input } from './components/Input'
import { Controls } from './components/Controls'
import { Toast } from './components/Toast'

export function GameSurface() {
  const puzzle = useStore((s) => s.puzzle)
  if (!puzzle) {
    return <div className="l-empty">Loading puzzle…</div>
  }

  return (
    <>
      <Chain />
      <Input />
      <Toast />
      <Controls />
    </>
  )
}
