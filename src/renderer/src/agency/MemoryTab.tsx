import { useEffect, useState } from 'react'
import type { Agent, MemoryFile } from '@shared/types'
import type { AgencyView } from '../agencies'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useConfirm } from '../components/useConfirm'

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`

/**
 * Memory: the agency's notes (every agent reads them) and one file per agent, plain Markdown in the
 * agency folder's memory/ (so it's in Files and syncs with Google Drive). Notes are lines starting "- ".
 */
export function MemoryTab({ view, agents, initial }: { view: AgencyView; agents: Agent[]; initial?: string }): JSX.Element {
  const agencyId = view.agency.id
  const [files, setFiles] = useState<MemoryFile[] | null>(null)
  const [sel, setSel] = useState(initial ?? 'agency')
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const dirty = text !== loaded

  useEffect(() => { window.tyslin.memory.list(agencyId).then(setFiles).catch((e) => { setError(errText(e)); setFiles([]) }) }, [agencyId])
  useEffect(() => {
    let live = true
    setSaved(false)
    void window.tyslin.memory.read(agencyId, sel).then((t) => { if (live) { setText(t); setLoaded(t) } }).catch((e) => setError(errText(e)))
    return () => { live = false }
  }, [agencyId, sel])
  const [confirmEl, confirm] = useConfirm()
  const choose = async (key: string): Promise<void> => {
    if (key === sel) return
    if (dirty && !(await confirm({ title: 'Leave without saving?', description: 'Your edits to this memory file are lost.', action: 'Leave', destructive: true }))) return
    setError(''); setSel(key)
  }
  const save = async (): Promise<void> => {
    setBusy(true); setError('')
    try {
      const f = await window.tyslin.memory.write(agencyId, sel, text)
      const fresh = await window.tyslin.memory.read(agencyId, sel)
      setText(fresh); setLoaded(fresh); setSaved(true)
      setFiles((l) => (l ?? []).map((x) => (x.key === f.key ? f : x)))
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  const addNote = (): void => {
    setText((t) => (t.endsWith('\n') || !t ? t : t + '\n') + '- ')
    setTimeout(() => { const el = document.getElementById('mem-body') as HTMLTextAreaElement | null; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }, 0)
  }
  const current = files?.find((f) => f.key === sel)
  const agentOf = (f: MemoryFile): Agent | undefined => agents.find((a) => a.id === f.agentId)

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      {confirmEl}
      <Card className="gap-0 self-start overflow-hidden py-0">
        {(files ?? []).map((f) => {
          const a = agentOf(f)
          const on = f.key === sel
          return (
            <button key={f.key} type="button" aria-current={on ? 'true' : undefined} onClick={() => void choose(f.key)}
              className={cn('flex min-h-11 w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left text-sm outline-none last:border-b-0 focus-visible:ring-[3px] focus-visible:ring-ring/40', on ? 'bg-muted' : 'hover:bg-accent/60')}>
              {a ? <Avatar shape={a.shape} tone={a.tone} head={a.head} size={22} /> : <span className="grid size-[22px] flex-none place-items-center rounded-md bg-lime text-on-lime"><Icon name="agency" size={13} /></span>}
              <span className="min-w-0 flex-1 truncate">{f.key === 'agency' ? 'Whole agency' : f.title}</span>
              <Badge variant={f.notes ? 'soft' : 'secondary'} className="h-5 font-mono text-[10.5px]">{f.notes ? plural(f.notes, 'note') : 'empty'}</Badge>
            </button>
          )
        })}
        {files && files.length === 0 && <span className="px-3 py-3 text-[13px] text-muted-foreground">No memory files yet.</span>}
      </Card>
      <Card className="gap-3 px-5 py-[18px]">
        {current && (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void save() }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <Label htmlFor="mem-body" className="text-sm font-semibold">{current.key === 'agency' ? 'Notes for every agent' : `Notes for ${current.title}`}</Label>
                <span className="font-mono text-xs text-muted-foreground">{current.file}</span>
              </span>
              <span className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={addNote}><Icon name="plus" size={12} /> Add a note</Button><Button type="submit" size="sm" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</Button></span>
            </div>
            <Textarea id="mem-body" rows={12} className="font-mono text-[13px] leading-[1.7]" value={text} onChange={(e) => { setText(e.target.value); setSaved(false) }}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (dirty) void save() } }} />
            <span className="text-xs text-muted-foreground">One note per line starting with "- ", newest at the bottom. Added to the agent's instructions before every run (about 8,000 characters; the newest are kept).{saved && !dirty ? ' Saved.' : ''}</span>
            {error && <span className="text-[13px] text-destructive" role="alert">{error}</span>}
          </form>
        )}
      </Card>
    </div>
  )
}
