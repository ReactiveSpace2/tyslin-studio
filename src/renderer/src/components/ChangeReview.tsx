import { useMemo, useState } from 'react'
import { diffHunks, type DiffPart } from '@shared/diff'
import { previewKind } from '@shared/preview'
import type { PendingChange } from '@shared/types'
import { Icon } from './Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

const CONTEXT = 3

export const CHANGE_STATUS_LABEL: Record<PendingChange['status'], string> = {
  pending: 'Waiting', accepted: 'Accepted', rejected: 'Rejected', partial: 'Partly accepted', expired: 'Expired'
}

function lines(text: string): string[] {
  const l = text.split('\n')
  if (l[l.length - 1] === '') l.pop()
  return l
}

/** One diff line: a marker column (+, − or blank) and the text, kept as is. */
function Line({ mark, text, kind, off }: { mark: string; text: string; kind?: 'add' | 'del'; off?: boolean }): JSX.Element {
  return (
    <div className={cn('px-2 whitespace-pre', kind === 'add' && 'bg-lime-soft text-green', kind === 'del' && 'bg-destructive-soft text-destructive', off && 'line-through opacity-45')}>
      <span className={cn('inline-block w-4 select-none', kind ? 'opacity-70' : 'text-muted-foreground')} aria-hidden="true">{mark}</span>{text}
    </div>
  )
}

/** Unchanged text trimmed to a few lines of context around each hunk. */
function Same({ text, first, last }: { text: string; first: boolean; last: boolean }): JSX.Element {
  const l = lines(text)
  const head = first ? [] : l.slice(0, CONTEXT)
  const tail = last ? [] : l.slice(Math.max(head.length, l.length - CONTEXT))
  const hidden = l.length - head.length - tail.length
  return (
    <>
      {head.map((t, i) => <Line key={'h' + i} mark=" " text={t} />)}
      {hidden > 0 && <div className="my-1.5 rounded-md bg-muted px-2 py-0.5 font-sans text-muted-foreground">{hidden} unchanged line{hidden === 1 ? '' : 's'}</div>}
      {tail.map((t, i) => <Line key={'t' + i} mark=" " text={t} />)}
    </>
  )
}

export interface ChangePicks {
  /** Accepted hunk indexes per change; everything starts picked. */
  acceptedFor: (c: PendingChange) => Set<number>
  toggle: (c: PendingChange, hunk: number, on: boolean) => void
  pickAll: () => void
  pickNone: () => void
  hunkCount: (c: PendingChange) => number
  /** Picked hunks across every pending change, and the total. */
  picked: number
  total: number
  /** Writes the picks: accepted hunks are applied, the rest rejected, with the note for the agent. */
  submit: (note: string) => Promise<void>
  busy: boolean
  error: string | null
}

/** The per-hunk picks of a review and the call that applies them (`changes.resolve` per pending change). */
export function useChangePicks(changes: PendingChange[], onResolved: () => void): ChangePicks {
  const [accepted, setAccepted] = useState<Record<string, Set<number>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const diffs = useMemo(() => Object.fromEntries(changes.map((c) => [c.id, diffHunks(c.original ?? '', c.proposed)])), [changes])
  const pending = changes.filter((c) => c.status === 'pending')
  const hunkCount = (c: PendingChange): number => diffs[c.id]?.hunkCount ?? 0
  const acceptedFor = (c: PendingChange): Set<number> => accepted[c.id] ?? new Set(Array.from({ length: hunkCount(c) }, (_, i) => i))
  const toggle = (c: PendingChange, hunk: number, on: boolean): void => {
    const next = new Set(acceptedFor(c))
    if (on) next.add(hunk); else next.delete(hunk)
    setAccepted((a) => ({ ...a, [c.id]: next }))
  }
  const pickAll = (): void => setAccepted({})
  const pickNone = (): void => setAccepted(Object.fromEntries(pending.map((c) => [c.id, new Set<number>()])))
  const picked = pending.reduce((n, c) => n + acceptedFor(c).size, 0)
  const total = pending.reduce((n, c) => n + hunkCount(c), 0)
  const submit = async (note: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      for (const c of pending) await window.tyslin.changes.resolve(c.id, [...acceptedFor(c)], note)
      onResolved()
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
      onResolved()
      throw err
    } finally {
      setBusy(false)
    }
  }
  return { acceptedFor, toggle, pickAll, pickNone, hunkCount, picked, total, submit, busy, error }
}

/** The files and their hunks, each with a checkbox while the change is still pending. Fits a panel or a dialog. */
export function ChangeReviewBody({ changes, picks, className, onPreview }: { changes: PendingChange[]; picks: ChangePicks; className?: string; onPreview?: (path: string) => void }): JSX.Element {
  const [selected, setSelected] = useState(changes.find((c) => c.status === 'pending')?.id ?? changes[0]?.id)
  const diffs = useMemo(() => Object.fromEntries(changes.map((c) => [c.id, diffHunks(c.original ?? '', c.proposed)])), [changes])
  const change = changes.find((c) => c.id === selected) ?? changes[0]
  const diff = change && diffs[change.id]

  const renderParts = (c: PendingChange, parts: DiffPart[]): JSX.Element[] => {
    const out: JSX.Element[] = []
    const editable = c.status === 'pending'
    let i = 0
    while (i < parts.length) {
      const p = parts[i]
      if (p.hunk === null) { out.push(<Same key={'s' + i} text={p.text} first={i === 0} last={i === parts.length - 1} />); i++; continue }
      const hunk = p.hunk
      const group: DiffPart[] = []
      while (i < parts.length && parts[i].hunk === hunk) group.push(parts[i++])
      const on = picks.acceptedFor(c).has(hunk)
      const id = `hunk-${c.id}-${hunk}`
      out.push(
        <div key={'h' + hunk} className="my-2 overflow-hidden rounded-xl border border-border">
          <div className="flex items-center gap-2.5 border-b border-border bg-muted py-1.5 pr-2 pl-3 font-sans">
            {editable && <Checkbox id={id} checked={on} onCheckedChange={(v) => picks.toggle(c, hunk, v === true)} aria-label={`Accept change ${hunk + 1} of ${picks.hunkCount(c)} in ${c.filePath}`} className="size-[18px]" />}
            <label htmlFor={editable ? id : undefined} className="font-mono text-[11px] text-muted-foreground">Change {hunk + 1} of {picks.hunkCount(c)}</label>
          </div>
          {group.flatMap((g, gi) => lines(g.text).map((t, li) => (
            <Line key={gi + '-' + li} mark={g.kind === 'add' ? '+' : '−'} text={t} kind={g.kind === 'add' ? 'add' : 'del'} off={editable && !on} />
          )))}
        </div>
      )
    }
    return out
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <ul className="flex flex-none flex-col gap-0.5 border-b border-border bg-muted/60 p-2" aria-label="Files">
        {changes.map((c) => {
          const active = c.id === change?.id
          return (
            <li key={c.id}>
              <button type="button" aria-current={active} onClick={() => setSelected(c.id)}
                className={cn('flex min-h-9 w-full items-center gap-2 rounded-lg border px-2.5 py-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40', active ? 'border-border bg-card shadow-xs' : 'border-transparent hover:bg-accent')}>
                <Icon name="file" size={13} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={c.filePath}>{c.filePath}</span>
                <Badge variant={c.status === 'accepted' ? 'soft' : 'outline'} className="h-5 text-[10.5px]">{c.original === null && c.status === 'pending' ? 'New' : c.status === 'pending' ? `${picks.acceptedFor(c).size}/${picks.hunkCount(c)}` : CHANGE_STATUS_LABEL[c.status]}</Badge>
              </button>
              {onPreview && c.status === 'accepted' && previewKind(c.filePath) && <Button variant="ghost" size="sm" className="ml-7 h-6 px-1.5 text-[11px]" onClick={() => onPreview(c.filePath)} aria-label={`Preview ${c.filePath}`}><Icon name="eye" size={12} /> Preview</Button>}
            </li>
          )
        })}
      </ul>
      <div className="min-h-0 flex-1 overflow-auto bg-card px-3 py-3 font-mono text-xs leading-relaxed" aria-label={change ? `Diff of ${change.filePath}` : 'Diff'}>
        {change && diff && (diff.hunkCount === 0 ? <p className="font-sans text-sm text-muted-foreground">No differences.</p> : renderParts(change, diff.parts))}
      </div>
    </div>
  )
}
