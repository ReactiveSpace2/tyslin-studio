import { useState } from 'react'

/** Names a new organization, creates it and moves into it (the window reloads). */
export function NewOrgModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async (): Promise<void> => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const org = await window.tyslin.orgs.create(name.trim())
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
            An organization has its own agents, assistants, projects, chats and skills, kept apart from your other organizations.
            Your sign-in, API keys and theme are shared.
          </span>
        </div>
        {error && <p className="hint account-error" role="alert">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || busy}>{busy ? 'Creating…' : 'Create organization'}</button>
        </div>
      </form>
    </div>
  )
}
