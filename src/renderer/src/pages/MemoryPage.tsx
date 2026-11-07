import { useEffect, useState } from 'react'
import type { Agent, MemoryFile } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

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
        <button type="button" aria-current={on ? 'true' : undefined} onClick={() => choose(f.key)}
          className={cn(
            'flex min-h-11 w-full cursor-pointer flex-col gap-1 rounded-lg border border-transparent px-3 py-2.5 text-left text-foreground outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
            on ? 'border-border bg-card shadow-xs' : 'hover:bg-accent'
          )}>
          <span className="flex w-full items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              {a ? <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={22} />
                : <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-lime text-on-lime"><Icon name="agency" size={14} /></span>}
              <span className="truncate text-sm font-medium">{f.title}</span>
            </span>
            <Badge variant={f.notes ? 'soft' : 'secondary'} className="font-mono">{f.notes ? plural(f.notes, 'note') : 'Empty'}</Badge>
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">{f.file}</span>
        </button>
      </li>
    )
  }

  const group = (label: string, list: MemoryFile[]): JSX.Element | null => list.length === 0 ? null : (
    <div className="flex flex-col gap-1.5">
      <span className="px-1 text-xs font-medium text-muted-foreground">{label}</span>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">{list.map(item)}</ul>
    </div>
  )
  const errorBox = (text: string): JSX.Element => <div role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">{text}</div>

  return (
    <div className="tw flex h-full min-h-0 bg-background text-foreground">
      <section aria-label="Memory files" className="flex w-[340px] flex-none flex-col gap-3.5 overflow-y-auto border-r border-border px-3.5 pt-5 pb-7">
        <div className="px-1">
          <h1 className="m-0 text-xl font-semibold tracking-tight">Memory</h1>
          <p className="mt-1 mb-0 text-xs leading-normal text-muted-foreground">What your agents always remember in {agencyName}. Plain files in the agency's <span className="font-mono">memory</span> folder, also in Drive.</p>
        </div>
        {group('Shared', shared)}
        {group('Agents', people)}
      </section>

      <section aria-label="Memory file" className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-7 pt-6 pb-12">
        {current && (
          <form className="flex max-w-[980px] flex-col gap-4" aria-labelledby="mem-title" onSubmit={(e) => { e.preventDefault(); void save() }}>
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">{current.key === 'agency' ? 'Every agent in the agency reads this' : `Only ${current.title} reads this`}</span>
                <h2 id="mem-title" className="m-0 text-[22px] font-semibold tracking-tight [overflow-wrap:anywhere]">{current.title}</h2>
                <span className="font-mono text-xs text-muted-foreground">{current.file}{current.modifiedAt ? ` · changed ${when(current.modifiedAt)}` : ''}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={addNote}><Icon name="plus" size={14} /> Add a note</Button>
                {dirty && <Button type="button" variant="outline" disabled={busy} onClick={() => setText(loaded)}>Undo changes</Button>}
                <Button type="submit" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</Button>
              </div>
            </header>
            {saved && !dirty && <span className="text-[13px] text-muted-foreground" role="status">Saved. Agents use it from their next run.</span>}
            {error && errorBox(error)}
            <label className="sr-only" htmlFor="mem-body">{current.title} memory</label>
            <Textarea id="mem-body" className="min-h-[360px] font-mono text-[13px] leading-[1.7]" value={text} spellCheck
              onChange={(e) => { setText(e.target.value); setSaved(false) }}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (dirty) void save() } }} />
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-panel px-4 py-3.5">
              <strong className="text-[13px] font-semibold">How agents use this</strong>
              <span className="text-[13px] leading-normal text-muted-foreground">
                Before every chat reply and card run, Tyslin adds the agency notes and the agent's own notes to its instructions
                (up to about 8,000 characters; the newest notes are kept when it's longer). Write one note per line starting with "- ",
                newest at the bottom. Text inside {'<!-- -->'} comments is left out. Soon agents will add notes here themselves.
              </span>
            </div>
          </form>
        )}
        {!current && error && errorBox(error)}
      </section>
    </div>
  )
}
