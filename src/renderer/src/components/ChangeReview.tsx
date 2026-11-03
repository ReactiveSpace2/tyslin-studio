import { useEffect, useMemo, useState } from 'react'
import { diffHunks, type DiffPart } from '@shared/diff'
import type { PendingChange } from '@shared/types'
import { Icon } from './Icon'

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

/** Unchanged text trimmed to a few lines of context around each hunk. */
function Same({ text, first, last }: { text: string; first: boolean; last: boolean }): JSX.Element {
  const l = lines(text)
  const head = first ? [] : l.slice(0, CONTEXT)
  const tail = last ? [] : l.slice(Math.max(head.length, l.length - CONTEXT))
  const hidden = l.length - head.length - tail.length
  return (
    <>
      {head.map((t, i) => <div key={'h' + i} className="dl"><span className="dm"> </span>{t}</div>)}
      {hidden > 0 && <div className="dl gap">{hidden} unchanged line{hidden === 1 ? '' : 's'}</div>}
      {tail.map((t, i) => <div key={'t' + i} className="dl"><span className="dm"> </span>{t}</div>)}
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
        <div key={'h' + hunk} className={'hunk' + (editable && !on ? ' off' : '')}>
          <div className="hunk-head">
            <span className="mono">Change {hunk + 1} of {diffs[c.id].hunkCount}</span>
            {editable && (
              <div className="seg" role="group" aria-label={`Change ${hunk + 1}`}>
                <button type="button" aria-pressed={on} className={on ? 'on' : ''} onClick={() => toggle(c, hunk, true)}>
                  <Icon name="check" size={12} /> Accept
                </button>
                <button type="button" aria-pressed={!on} className={!on ? 'on' : ''} onClick={() => toggle(c, hunk, false)}>
                  <Icon name="close" size={12} /> Reject
                </button>
              </div>
            )}
          </div>
          {group.flatMap((g, gi) => lines(g.text).map((t, li) => (
            <div key={gi + '-' + li} className={'dl ' + g.kind}><span className="dm">{g.kind === 'add' ? '+' : '−'}</span>{t}</div>
          )))}
        </div>
      )
    }
    return out
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal review" role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={(e) => e.stopPropagation()}>
        <header className="review-head">
          <div>
            <span className="eyebrow">Review changes</span>
            <h2 id="review-title">{changes.length} file{changes.length === 1 ? '' : 's'} changed</h2>
          </div>
          <button type="button" className="btn icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </header>

        <div className="review-body">
          <ul className="review-files" aria-label="Files">
            {changes.map((c) => (
              <li key={c.id}>
                <button type="button" className={c.id === change?.id ? 'active' : ''} aria-current={c.id === change?.id} onClick={() => setSelected(c.id)}>
                  <Icon name="file" size={14} />
                  <span className="mono name" title={c.filePath}>{c.filePath}</span>
                  <span className={'badge' + (c.status === 'accepted' ? ' green' : '')}>{c.original === null && c.status === 'pending' ? 'New' : STATUS_LABEL[c.status]}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="diff" aria-label={change ? `Diff of ${change.filePath}` : 'Diff'}>
            {change && diff && (diff.hunkCount === 0
              ? <p className="hint">No differences.</p>
              : renderParts(change, diff.parts))}
          </div>
        </div>

        {pending.length > 0 ? (
          <footer className="review-foot">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="review-note">Note for the agent (optional)</label>
              <input id="review-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Keep the old function name" />
            </div>
            <div className="row">
              <button type="button" className="btn" disabled={busy} onClick={() => void submit(() => [])}>Reject all</button>
              <button type="button" className="btn" disabled={busy} onClick={() => void submit((c) => [...acceptedFor(c)])}>Apply selection</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit((c) => Array.from({ length: diffs[c.id].hunkCount }, (_, i) => i))}>Accept all</button>
            </div>
          </footer>
        ) : (
          <footer className="review-foot"><span className="hint">These changes have been reviewed.</span></footer>
        )}
        {error && <div className="msg-error" role="alert">{error}</div>}
      </div>
    </div>
  )
}
