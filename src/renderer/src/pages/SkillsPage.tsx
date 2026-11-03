import { useEffect, useState } from 'react'
import type { Agent, Skill, SkillInput } from '@shared/types'
import { Icon } from '../components/Icon'

const BLANK: SkillInput = { name: '', description: '', body: '' }

const errorText = (err: unknown): string =>
  err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)

const toSlug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 64)

interface EditorProps {
  skill: SkillInput
  usedBy: Agent[]
  onClose: () => void
  onSaved: () => void
}

function SkillEditor({ skill, usedBy, onClose, onSaved }: EditorProps): JSX.Element {
  const [form, setForm] = useState<SkillInput>(skill)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof SkillInput>(k: K, v: SkillInput[K]): void => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (fn: () => Promise<unknown>, close = true): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onSaved()
      if (close) onClose()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const save = (): Promise<void> => run(() => window.tyslin.skills.save({ ...form, name: form.name.replace(/-+$/, '') }))
  const remove = (): Promise<void> => {
    const who = usedBy.length ? ` It will be removed from ${usedBy.map((a) => a.name).join(', ')}.` : ''
    if (!form.id || !window.confirm(`Delete ${form.name}?${who}`)) return Promise.resolve()
    return run(() => window.tyslin.skills.remove(form.id!))
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <form className="modal skill-modal" role="dialog" aria-modal="true" aria-labelledby="skill-title"
        onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void save() }}>
        <header className="review-head" style={{ padding: 0, border: 0 }}>
          <div>
            <span className="eyebrow">{form.id ? 'Edit skill' : 'New skill'}</span>
            <h2 id="skill-title">{form.name || 'Untitled skill'}</h2>
          </div>
          <button type="button" className="btn icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="two">
          <div className="field">
            <label htmlFor="s-name">Name</label>
            <input id="s-name" className="input mono" value={form.name} onChange={(e) => set('name', toSlug(e.target.value))} placeholder="meeting-notes" autoFocus={!form.id} />
            <span className="hint">Lowercase words joined by hyphens.</span>
          </div>
          <div className="field">
            <label htmlFor="s-desc">One-line description</label>
            <input id="s-desc" className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What this skill helps an agent do" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="s-body">Instructions</label>
          <textarea id="s-body" className="textarea mono" rows={12} value={form.body} onChange={(e) => set('body', e.target.value)}
            placeholder={'What to produce, in what structure, and what to avoid.\nFive to eight short lines works well.'} />
          <span className="hint">{form.body.length.toLocaleString()} / 20,000 characters · added to the instructions of every agent that uses it</span>
        </div>
        {form.id && (
          <span className="hint">{usedBy.length ? `Used by ${usedBy.map((a) => a.name).join(', ')}` : 'Not attached to any agent yet. Attach it in an agent\'s editor.'}</span>
        )}
        {error && <div className="msg-error" role="alert">{error}</div>}
        <footer className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            {form.id && <button type="button" className="btn" disabled={busy} onClick={() => void remove()}>Delete</button>}
            {form.id && (
              <button type="button" className="btn" disabled={busy} onClick={() => void run(() => window.tyslin.skills.exportFile(form.id!), false)}>Export .md</button>
            )}
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !form.name || !form.body.trim()}>Save skill</button>
          </div>
        </footer>
      </form>
    </div>
  )
}

interface Props {
  agents: Agent[]
  onAgentsChanged: () => void
}

export function SkillsPage({ agents, onAgentsChanged }: Props): JSX.Element {
  const [skills, setSkills] = useState<Skill[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<SkillInput | null>(null)
  const [notice, setNotice] = useState<{ text: string; skipped: string[] } | null>(null)

  const load = (): Promise<void> => window.tyslin.skills.list().then(setSkills)
  useEffect(() => { void load() }, [])

  const usedBy = (name: string): Agent[] => agents.filter((a) => a.skills.includes(name))
  const q = query.trim().toLowerCase()
  const shown = q ? skills.filter((s) => s.name.includes(q) || s.description.toLowerCase().includes(q)) : skills

  const importFiles = async (): Promise<void> => {
    try {
      const r = await window.tyslin.skills.importFiles()
      if (!r.imported.length && !r.skipped.length) return
      await load()
      setNotice({ text: `Imported ${r.imported.length} skill${r.imported.length === 1 ? '' : 's'}.`, skipped: r.skipped })
    } catch (err) {
      setNotice({ text: errorText(err), skipped: [] })
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="eyebrow">Library</span>
          <h1>Skills</h1>
          <p className="lead">Reusable instructions you can attach to any agent. Attached skills are added to the agent's instructions.</p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => void importFiles()}>Import .md</button>
          <button type="button" className="btn btn-primary" onClick={() => setEditing(BLANK)}><Icon name="plus" size={12} /> New skill</button>
        </div>
      </header>

      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="skill-search" className="section-label" style={{ padding: 0 }}>Search</label>
        <input id="skill-search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`${skills.length} skills`} />
      </div>

      {notice && (
        <div className="box" role="status">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{notice.text}</strong>
            <button type="button" className="btn btn-sm" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
          {notice.skipped.length > 0 && (
            <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
              {notice.skipped.map((s) => <li key={s}>Skipped {s}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="grid">
        {shown.map((s) => {
          const used = usedBy(s.name)
          return (
            <button key={s.id} type="button" className="card skill-card" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}>
              <span className="chip on" style={{ alignSelf: 'flex-start' }}>{s.name}</span>
              <p>{s.description || 'No description'}</p>
              <span className="card-foot">
                <span className="mono">{used.length ? `${used.length} agent${used.length === 1 ? '' : 's'}` : 'Not attached'}</span>
                <span className="mono">Edit</span>
              </span>
            </button>
          )
        })}
        {shown.length === 0 && <p className="hint">No skills match “{query}”.</p>}
      </div>

      {editing && (
        <SkillEditor
          skill={editing}
          usedBy={editing.name ? usedBy(skills.find((s) => s.id === editing.id)?.name ?? '') : []}
          onClose={() => setEditing(null)}
          onSaved={() => { void load(); onAgentsChanged() }}
        />
      )}
    </div>
  )
}
