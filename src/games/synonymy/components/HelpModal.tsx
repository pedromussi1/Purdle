import { Modal } from '../../../shared/components/Modal'

interface Props {
  open: boolean
  onClose: () => void
}

export function HelpModal({ open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="How to play Synonymy">
      <p>
        Get from the <strong>start</strong> word to the <strong>target</strong>{' '}
        through a chain of <strong>semantic neighbours</strong>. Each new
        word must be similar in meaning to the word that came before it.
      </p>

      <h3 className="help-section">What counts as a neighbour?</h3>
      <p>
        Two words are neighbours when their{' '}
        <a
          href="https://en.wikipedia.org/wiki/Sentence_embedding"
          target="_blank"
          rel="noreferrer"
        >
          sentence-embedding cosine similarity
        </a>{' '}
        is at least <strong>0.5</strong>. Embeddings come from{' '}
        <code>sentence-transformers/all-MiniLM-L6-v2</code> and are
        precomputed for ~5,000 common 5-letter words. Submitting a word
        that isn&apos;t similar enough to the previous one is rejected.
      </p>
      <p>
        Concretely: <strong>HAPPY → MERRY</strong> is fine (close
        synonyms), <strong>HAPPY → CHAIR</strong> is not (unrelated),
        and <strong>HAPPY → SORRY</strong> is borderline — the embedding
        knows they&apos;re both feelings.
      </p>

      <h3 className="help-section">Submission rules</h3>
      <ul className="help-list">
        <li>Exactly five letters, in the synonym graph.</li>
        <li>Must be a semantic neighbour of your previous word.</li>
        <li>Hasn&apos;t already appeared in your chain.</li>
      </ul>
      <p>
        The counter shows your current step count vs the BFS-optimal — try
        to match it. <strong>Give up</strong> reveals the optimal path the
        solver found through embedding space.
      </p>

      <p className="help-footnote">
        Pair selection is LLM-driven (Gemini suggests thematically
        connected starts and ends), with a BFS sanity-check over the
        precomputed synonym graph guaranteeing the puzzle is solvable in
        3-7 steps.
      </p>
    </Modal>
  )
}
