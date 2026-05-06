import { Modal } from '../../../shared/components/Modal'

interface Props {
  open: boolean
  onClose: () => void
}

export function HelpModal({ open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="How to play">
      <p>Guess the Purdle in 6 tries.</p>
      <ul className="help-list">
        <li>Each guess must be a valid 5-letter word.</li>
        <li>The colour of the tiles will change to show how close your guess was.</li>
      </ul>
      <h3 className="help-section">Examples</h3>
      <div className="help-example">
        <div className="help-row">
          <span className="tile tile--correct help-tile">W</span>
          <span className="tile tile--filled help-tile">E</span>
          <span className="tile tile--filled help-tile">A</span>
          <span className="tile tile--filled help-tile">R</span>
          <span className="tile tile--filled help-tile">Y</span>
        </div>
        <p>
          <strong>W</strong> is in the word and in the correct spot.
        </p>
      </div>
      <div className="help-example">
        <div className="help-row">
          <span className="tile tile--filled help-tile">P</span>
          <span className="tile tile--present help-tile">I</span>
          <span className="tile tile--filled help-tile">L</span>
          <span className="tile tile--filled help-tile">L</span>
          <span className="tile tile--filled help-tile">S</span>
        </div>
        <p>
          <strong>I</strong> is in the word but in the wrong spot.
        </p>
      </div>
      <div className="help-example">
        <div className="help-row">
          <span className="tile tile--filled help-tile">V</span>
          <span className="tile tile--filled help-tile">A</span>
          <span className="tile tile--filled help-tile">G</span>
          <span className="tile tile--absent help-tile">U</span>
          <span className="tile tile--filled help-tile">E</span>
        </div>
        <p>
          <strong>U</strong> is not in the word in any spot.
        </p>
      </div>
      <p className="help-footnote">
        A new puzzle is generated every day by an automated LLM + ML pipeline.
      </p>
    </Modal>
  )
}
