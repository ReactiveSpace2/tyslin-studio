import { useEffect, useState } from 'react'
import type { Agent, MemoryFile } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'

interface Props {
  agencyId: string
  agencyName: string
  agents: Agent[]
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`
const when = (ms: number): string => (ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '')

/**
 * Memory (agency menu): the agency's memory files, plain Markdown in <agency folder>/memory/ (so they're in Drive and
 * sync with Google Drive). The agency file goes into every agent's instructions; each agent's file only into its own.
 * Same layout as Skills: the files on the left, the selected one edited on the right.
 */
export function MemoryPage({ agencyId, agencyName, agents }: Props): JSX.Element {
  const [files, setFiles] = useState<MemoryFile[] | null>(null)
  const [sel, setSel] = useState('agency')
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const dirty = text !== loaded

  const loadList = async (): Promise<void> => {
    try { setFiles(await window.tyslin.memory.list(agencyId)) } catch (err) { setError(errText(err)); setFiles([]) }
  }
  useEffect(() => { void loadList() }, [agencyId])
  useEffect(() => {
    let live = true
    setSaved(false)
    void window.tyslin.memory.read(agencyId, sel).then((t) => { if (live) { setText(t); setLoaded(t) } }).catch((err) => setError(errText(err)))
    return () => { live = false }
  }, [agencyId, sel])

  const choose = (key: string): void => {
    if (key === sel) return
    if (dirty && !window.confirm('Leave without saving your changes to this memory file?')) return
    setError('')
    setSel(key)
  }
  const save = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const f = await window.tyslin.memory.write(agencyId, sel, text)
      const fresh = await window.tyslin.memory.read(agencyId, sel)
      setText(fresh)
      setLoaded(fresh)
      setFiles((l) => (l ?? []).map((x) => (x.key === f.key ? f : x)))
      setSaved(true)
    } catch (err) { setError(errText(err)) } finally { setBusy(false) }
  }
  const addNote = (): void => {
    const base = text.endsWith('\n') || !text ? text : text + '\n'
    setText(base + '- ')
    setTimeout(() => {
      const el = document.getElementById('mem-body') as HTMLTextAreaElement | null
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); el.scrollTop = el.scrollHeight }
    }, 0)
  }

  const current = files?.find((f) => f.key === sel)
  const agentOf = (f: MemoryFile): Agent | undefined => agents.find((a) => a.id === f.agentId)
  const shared = files?.filter((f) => f.key === 'agency') ?? []
  const people = files?.filter((f) => f.key !== 'agency') ?? []

  const item = (f: MemoryFile): JSX.Element => {
    const on = f.key === sel
    const a = agentOf(f)
    return (
      <li key={f.key}>
        <button type="button" className={'sk-item' + (on ? ' on' : '')} aria-current={on ? 'true' : undefined} onClick={() => choose(f.key)}>
          <span className="sk-item-top">
            <span className="mem-item-name">
              {a ? <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={22} /> : <Icon name="agency" size={16} />}
              <span className="sk-item-name">{f.title}</span>
            </span>
            <span className={'mono sk-item-used' + (f.notes ? ' used' : '')}>{f.notes ? plural(f.notes, 'note') : 'Empty'}</span>
          </span>
          <span className="hint sk-item-desc mono">{f.file}</span>
        </button>
      </li>
    )
  }

  return (
    <div className="sk-page">
      <section className="sk-list" aria-label="Memory files">
        <div className="sk-list-head"><h1>Memory</h1></div>
        <p className="hint" style={{ margin: 0 }}>What your agents always remember in {agencyName}. Plain files in the agency's <span className="mono">memory</span> folder, also in Drive.</p>
        {shared.length > 0 && (
          <div className="sk-group">
            <span className="eyebrow">Shared</span>
            <ul className="sk-items">{shared.map(item)}</ul>
          </div>
        )}
        {people.length > 0 && (
          <div className="sk-group">
            <span className="eyebrow">Agents</span>
            <ul className="sk-items">{people.map(item)}</ul>
          </div>
        )}
      </section>

      <section className="sk-main" aria-label="Memory file">
        {current && (
          <form className="sk-editor" aria-labelledby="mem-title" onSubmit={(e) => { e.preventDefault(); void save() }}>
            <header className="sk-editor-head">
              <div className="sk-editor-title">
                <span className="eyebrow">{current.key === 'agency' ? 'Every agent in the agency reads this' : `Only ${current.title} reads this`}</span>
                <h2 id="mem-title">{current.title}</h2>
                <span className="hint mono">{current.file}{current.modifiedAt ? ` · changed ${when(current.modifiedAt)}` : ''}</span>
              </div>
              <div className="row">
                <button type="button" className="btn" onClick={addNote}><Icon name="plus" size={14} /> Add a note</button>
                {dirty && <button type="button" className="btn" disabled={busy} onClick={() => setText(loaded)}>Undo changes</button>}
                <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </header>
            {saved && !dirty && <span className="hint" role="status">Saved. Agents use it from their next run.</span>}
            {error && <div className="msg-error" role="alert">{error}</div>}
            <label className="sr-only" htmlFor="mem-body">{current.title} memory</label>
            <textarea id="mem-body" className="input textarea mono mem-body" value={text} spellCheck
              onChange={(e) => { setText(e.target.value); setSaved(false) }}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (dirty) void save() } }} />
            <div className="mem-help">
              <strong>How agents use this</strong>
              <span className="hint">
                Before every chat reply and card run, Tyslin adds the agency notes and the agent's own notes to its instructions
                (up to about 8,000 characters; the newest notes are kept when it's longer). Write one note per line starting with "- ",
                newest at the bottom. Text inside {'<!-- -->'} comments is left out. Soon agents will add notes here themselves.
              </span>
            </div>
          </form>
        )}
        {!current && error && <div className="msg-error" role="alert">{error}</div>}
      </section>
    </div>
  )
}
