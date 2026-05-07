import { Link } from 'react-router-dom'

interface HeaderProps {
  onOpenHelp: () => void
  onOpenStats: () => void
  onOpenSettings: () => void
  onOpenArchive: () => void
}

export function Header({
  onOpenHelp,
  onOpenStats,
  onOpenSettings,
  onOpenArchive,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-side">
        <IconButton onClick={onOpenHelp} label="How to play">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <text
              x="12"
              y="17"
              textAnchor="middle"
              fontSize="14"
              fontWeight="700"
              fill="currentColor"
            >
              ?
            </text>
          </svg>
        </IconButton>
      </div>
      <Link to="/" className="app-title" aria-label="Home">
        Purdle
      </Link>
      <div className="header-side header-side--right">
        <IconButton onClick={onOpenArchive} label="Past puzzles">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect
              x="3"
              y="5"
              width="18"
              height="16"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M3 9h18M8 3v4M16 3v4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </IconButton>
        <IconButton onClick={onOpenStats} label="Statistics">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect x="3" y="13" width="4" height="8" fill="currentColor" />
            <rect x="10" y="8" width="4" height="13" fill="currentColor" />
            <rect x="17" y="3" width="4" height="18" fill="currentColor" />
          </svg>
        </IconButton>
        <IconButton onClick={onOpenSettings} label="Settings">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M19.14 12.94a7.49 7.49 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.5 7.5 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.13.55-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.66 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.49 7.49 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.67.24l2.39-.96c.49.39 1.04.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.13-.55 1.62-.94l2.39.96c.25.1.53 0 .67-.24l1.92-3.32a.5.5 0 0 0-.12-.64l-2.04-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
              fill="currentColor"
            />
          </svg>
        </IconButton>
      </div>
    </header>
  )
}

interface IconButtonProps {
  onClick: () => void
  label: string
  children: React.ReactNode
}

function IconButton({ onClick, label, children }: IconButtonProps) {
  return (
    <button
      type="button"
      className="icon-button"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}
