import { useState } from 'react'
import { ORG_COLORS, type OrgColor } from '@shared/types'
import { ColorSwatches } from './ColorSwatches'

/** Names a new organization, creates it and moves into it (the window reloads). */
export function NewOrgModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [name, setName] = useState('')
  const [color, setColor] = useState<OrgColor>('teal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async (): Promise<void> => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const org = await window.tyslin.orgs.create(name.trim(), color)
      await window.tyslin.orgs.switch(org.id)
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="backdrop" role="dialog" aria-modal="true" aria-labelledby="no-title" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void create() }}>
        <h2 id="no-title">New organization</h2>
        <div className="field">
          <label htmlFor="no-name">Name</label>
          <input id="no-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme" autoFocus />
          <span className="hint">
            An organization has its own agencies, agents, chats and skills, kept apart from your other organizations.
            Your sign-in, API keys and theme are shared.
          </span>
        </div>
        <fieldset className="field" style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="label" style={{ marginBottom: 8 }}>Colour</legend>
          <ColorSwatches value={color} onChange={setColor} name="new-org-color" />
          <span className="hint">Marks the organization in the switcher, so you can tell them apart. {ORG_COLORS[color].label} selected.</span>
        </fieldset>
        {error && <p className="hint account-error" role="alert">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || busy}>{busy ? 'Creating…' : 'Create organization'}</button>
        </div>
      </form>
    </div>
  )
}
