import type { Agent } from '@shared/types'
import { Icon } from './Icon'
import { StarterList } from './StarterList'

/** "New assistant": write one from scratch, or add a ready-made one to the selected project. */
export function NewAssistantModal({ agents, onClose, onBlank, onAdded }: { agents: Agent[]; onClose: () => void; onBlank: () => void; onAdded: () => void }): JSX.Element {
  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal nt-modal nt-small" role="dialog" aria-modal="true" aria-labelledby="na-title">
        <header className="nt-head-row">
          <div>
            <h2 id="na-title">New assistant</h2>
            <p className="hint">Write one from scratch, or add a ready-made assistant to this project.</p>
          </div>
          <button type="button" className="btn icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={14} /></button>
        </header>
        <div className="nt-starters">
          <button type="button" className="nt-option nt-blank" onClick={onBlank}>
            <strong><Icon name="plus" size={14} /> Blank assistant</strong>
            <span>A prompt, a model and the skills you pick.</span>
          </button>
          <span className="section-label" style={{ padding: 0 }}>Ready-made</span>
          <StarterList kind="assistant" agents={agents} onAdded={() => onAdded()} />
        </div>
        <footer className="nt-foot"><span /><button type="button" className="btn" onClick={onClose}>Done</button></footer>
      </div>
    </div>
  )
}
