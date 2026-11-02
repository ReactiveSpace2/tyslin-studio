import { useState } from 'react'
import type { Project } from '@shared/types'

export function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }): JSX.Element {
  const [name, setName] = useState('')
  const [folder, setFolder] = useState<string | null>(null)

  const pick = async (): Promise<void> => {
    const f = await window.tyslin.projects.pickFolder()
    if (f) {
      setFolder(f)
      if (!name) setName(f.split(/[\\/]/).filter(Boolean).pop() ?? '')
    }
  }

  const create = async (): Promise<void> => {
    if (!name.trim()) return
    onCreated(await window.tyslin.projects.create(name.trim(), folder))
  }

  return (
    <div className="backdrop" role="dialog" aria-modal="true" aria-labelledby="np-title" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="np-title">New project</h2>
        <div className="field">
          <label htmlFor="np-name">Name</label>
          <input id="np-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <span className="label">Folder</span>
          <div className="row">
            <button type="button" className="btn" onClick={pick}>Choose folder…</button>
            {folder && <span className="mono hint" style={{ wordBreak: 'break-all' }}>{folder}</span>}
          </div>
          <span className="hint">Agents in this project can see the file list from this folder.</span>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={create}>Create project</button>
        </div>
      </div>
    </div>
  )
}
