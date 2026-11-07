import { useMemo, useState } from 'react'
import { diffHunks, type DiffPart } from '@shared/diff'
import type { PendingChange } from '@shared/types'
import { Icon } from './Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const CONTEXT = 3

const STATUS_LABEL: Record<PendingChange['status'], string> = {
  pending: 'Waiting', accepted: 'Accepted', rejected: 'Rejected', partial: 'Partly accepted', expired: 'Expired'
}

interface Props {
  changes: PendingChange[]
  onClose: () => void
  onResolved: () => void
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

export function ChangeReview({ changes, onClose, onResolved }: Props): JSX.Element {
  const [selected, setSelected] = useState(changes.find((c) => c.status === 'pending')?.id ?? changes[0]?.id)
  // Accepted hunk indexes per change; everything starts accepted.
  const [accepted, setAccepted] = useState<Record<string, Set<number>>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const diffs = useMemo(() => Object.fromEntries(changes.map((c) => [c.id, diffHunks(c.original ?? '', c.proposed)])), [changes])
  const pending = changes.filter((c) => c.status === 'pending')
  const change = changes.find((c) => c.id === selected) ?? changes[0]
  const diff = change && diffs[change.id]

  const acceptedFor = (c: PendingChange): Set<number> =>
    accepted[c.id] ?? new Set(Array.from({ length: diffs[c.id].hunkCount }, (_, i) => i))

  const toggle = (c: PendingChange, hunk: number, on: boolean): void => {
    const next = new Set(acceptedFor(c))
    if (on) next.add(hunk)
    else next.delete(hunk)
    setAccepted((a) => ({ ...a, [c.id]: next }))
  }

  const submit = async (pick: (c: PendingChange) => number[]): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      for (const c of pending) await window.tyslin.changes.resolve(c.id, pick(c), note)
      onResolved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
      onResolved()
    } finally {
      setBusy(false)
    }
  }

  const renderParts = (c: PendingChange, parts: DiffPart[]): JSX.Element[] => {
    const out: JSX.Element[] = []
    const editable = c.status === 'pending'
    let i = 0
    while (i < parts.length) {
      const p = parts[i]
      if (p.hunk === null) {
        out.push(<Same key={'s' + i} text={p.text} first={i === 0} last={i === parts.length - 1} />)
        i++
        continue
      }
      const hunk = p.hunk
      const group: DiffPart[] = []
      while (i < parts.length && parts[i].hunk === hunk) group.push(parts[i++])
      const on = acceptedFor(c).has(hunk)
      out.push(
        <div key={'h' + hunk} className="my-2 overflow-hidden rounded-xl border border-border">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted py-1.5 pr-2 pl-3 font-sans">
            <span className="font-mono text-[11px] text-muted-foreground">Change {hunk + 1} of {diffs[c.id].hunkCount}</span>
            {editable && (
              <div className="inline-flex overflow-hidden rounded-md border border-border bg-card" role="group" aria-label={`Change ${hunk + 1}`}>
                {([true, false] as const).map((accept) => {
                  const pressed = accept ? on : !on
                  return (
                    <button key={String(accept)} type="button" aria-pressed={pressed} onClick={() => toggle(c, hunk, accept)}
                      className={cn('inline-flex h-9 items-center gap-1.5 px-3 text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40', !accept && 'border-l border-border',
                        pressed ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
                      <Icon name={accept ? 'check' : 'close'} size={12} /> {accept ? 'Accept' : 'Reject'}
                    </button>
                  )
                })}
              </div>
            )}
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false}
        className="flex h-[calc(100%-64px)] w-[1040px] max-w-[calc(100%-48px)] flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 text-foreground shadow-lg sm:max-w-[calc(100%-48px)]">
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-border px-5 py-4 text-left">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs tracking-wider text-green uppercase">Review changes</span>
            <DialogTitle className="text-lg font-semibold tracking-tight">{changes.length} file{changes.length === 1 ? '' : 's'} changed</DialogTitle>
            <DialogDescription className="sr-only">Accept or reject each change before it is written to the project folder.</DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close"><Icon name="close" /></Button>
          </DialogClose>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <ul className="flex w-[280px] flex-none flex-col gap-1 overflow-y-auto border-r border-border bg-muted p-2.5" aria-label="Files">
            {changes.map((c) => {
              const active = c.id === change?.id
              return (
                <li key={c.id}>
                  <button type="button" aria-current={active} onClick={() => setSelected(c.id)}
                    className={cn('flex min-h-11 w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                      active ? 'border-border bg-card shadow-xs' : 'border-transparent hover:bg-accent')}>
                    <Icon name="file" size={14} />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs" title={c.filePath}>{c.filePath}</span>
                    <Badge variant={c.status === 'accepted' ? 'soft' : 'outline'}>{c.original === null && c.status === 'pending' ? 'New' : STATUS_LABEL[c.status]}</Badge>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="min-w-0 flex-1 overflow-auto bg-card px-5 py-4 font-mono text-xs leading-relaxed" aria-label={change ? `Diff of ${change.filePath}` : 'Diff'}>
            {change && diff && (diff.hunkCount === 0
              ? <p className="font-sans text-sm text-muted-foreground">No differences.</p>
              : renderParts(change, diff.parts))}
          </div>
        </div>

        {pending.length > 0 ? (
          <footer className="flex flex-wrap items-end gap-4 border-t border-border px-5 py-4">
            <div className="flex min-w-[240px] flex-1 flex-col gap-2">
              <Label htmlFor="review-note">Note for the agent (optional)</Label>
              <Input id="review-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Keep the old function name" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void submit(() => [])}>Reject all</Button>
              <Button variant="outline" disabled={busy} onClick={() => void submit((c) => [...acceptedFor(c)])}>Apply selection</Button>
              <Button variant="lime" disabled={busy} onClick={() => void submit((c) => Array.from({ length: diffs[c.id].hunkCount }, (_, i) => i))}>Accept all</Button>
            </div>
          </footer>
        ) : (
          <footer className="border-t border-border px-5 py-4"><span className="text-sm text-muted-foreground">These changes have been reviewed.</span></footer>
        )}
        {error && <div className="mx-5 mb-4 rounded-lg bg-destructive-soft px-3.5 py-2.5 text-sm text-destructive" role="alert">{error}</div>}
      </DialogContent>
    </Dialog>
  )
}
