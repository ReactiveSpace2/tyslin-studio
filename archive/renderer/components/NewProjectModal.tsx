import { useEffect, useState } from 'react'
import type { Project } from '@shared/types'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/**
 * New project. Every project is a real folder on disk: a new one Tyslin creates under
 * Documents/Tyslin Studio/<organization>/, or an existing folder the user picks.
 */
export function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }): JSX.Element {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [folder, setFolder] = useState<string | null>(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'new') return
    let live = true
    void window.tyslin.projects.newFolderPath(name.trim() || 'New project').then((p) => { if (live) setPreview(p) })
    return () => { live = false }
  }, [name, mode])

  const pick = async (): Promise<void> => {
    const f = await window.tyslin.projects.pickFolder()
    if (f) {
      setFolder(f)
      setMode('existing')
      if (!name.trim()) setName(f.split(/[\\/]/).filter(Boolean).pop() ?? '')
    }
  }

  const ready = !!name.trim() && (mode === 'new' || !!folder)
  const create = async (): Promise<void> => {
    if (!ready) return
    setBusy(true); setError(null)
    try {
      onCreated(mode === 'new'
        ? await window.tyslin.projects.createWithFolder(name.trim())
        : await window.tyslin.projects.create(name.trim(), folder))
    } catch (e) {
      setError(errorText(e)); setBusy(false)
    }
  }

  return (
    <div className="backdrop" role="dialog" aria-modal="true" aria-labelledby="np-title" onClick={() => { if (!busy) onClose() }}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="np-title">New project</h2>
        <div className="field">
          <label htmlFor="np-name">Name</label>
          <input id="np-name" className="input" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void create() }} autoFocus />
        </div>
        <fieldset className="field np-folder">
          <legend className="label">Folder</legend>
          <label className="np-choice">
            <input type="radio" name="np-mode" checked={mode === 'new'} onChange={() => setMode('new')} />
            <span>
              <strong>Create a new folder</strong>
              <span className="mono hint" style={{ wordBreak: 'break-all' }}>{preview}</span>
            </span>
          </label>
          <label className="np-choice">
            <input type="radio" name="np-mode" checked={mode === 'existing'} onChange={() => (folder ? setMode('existing') : void pick())} />
            <span>
              <strong>Use an existing folder</strong>
              {folder
                ? <span className="mono hint" style={{ wordBreak: 'break-all' }}>{folder}</span>
                : <span className="hint">Pick a folder already on this computer.</span>}
            </span>
            <button type="button" className="btn btn-sm" onClick={() => void pick()}>{folder ? 'Change…' : 'Choose folder…'}</button>
          </label>
          <span className="hint">Agents in this project work in this folder, and Drive shows its files.</span>
        </fieldset>
        {error && <p className="hint account-error" role="alert">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create project'}</button>
        </div>
      </div>
    </div>
  )
}
