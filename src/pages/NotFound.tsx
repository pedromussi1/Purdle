import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <main className="not-found">
      <h2>Not found</h2>
      <p>That page doesn&apos;t exist.</p>
      <Link to="/" className="archive-back">
        &larr; Back to today&apos;s puzzle
      </Link>
    </main>
  )
}
