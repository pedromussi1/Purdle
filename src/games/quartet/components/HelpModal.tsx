import { Modal } from '../../../shared/components/Modal'

interface Props {
  open: boolean
  onClose: () => void
}

export function HelpModal({ open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="How to play Quartet">
      <p>
        Find four groups of four. Tap words to select them, then submit when
        you have four picked.
      </p>
      <ul className="help-list">
        <li>Each puzzle has 16 words that form 4 themed groups.</li>
        <li>
          Find a group right and the four words slide up into a coloured row,
          with the theme revealed.
        </li>
        <li>
          You have <strong>4 mistakes</strong>. If three of your four picks
          belong to a single group, the toast says <em>One away…</em>.
        </li>
        <li>
          Tiers run from <strong>easy → tricky</strong>: the trickiest group
          often involves wordplay or a less-obvious connection.
        </li>
      </ul>
      <p className="help-footnote">
        Each puzzle&apos;s themes and words are generated daily by the same
        LLM + embedding-clustering pipeline that powers the Purdle word puzzle.
      </p>
    </Modal>
  )
}
