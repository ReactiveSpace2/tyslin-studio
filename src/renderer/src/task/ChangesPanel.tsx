import { useState } from 'react'
import type { Agent, ChannelMessage, KanbanCard, PendingChange } from '@shared/types'
import { firstName } from '../boardStats'
import { ChangeReviewBody, useChangePicks } from '../components/ChangeReview'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface Review {
  changes: PendingChange[]
  /** The chat the changes came from (a worker's card chat, or this task). */
  sessionId: string
  agent: Agent | null
  card: KanbanCard | null
  /** The Lead's review message to answer once the picks are written. */
  message: ChannelMessage | null
}

/**
 * The right panel's Changes: every file and hunk of one run with a checkbox each. "Accept picked" asks
 * once more, because accepted hunks are written to disk straight away; the rest go back to the agent
 * with your note. When the run came through the Lead as a review, the Lead gets the outcome too.
 */
export function ChangesPanel({ review, taskSessionId, onResolved, onPreview }: { review: Review; taskSessionId: string; onResolved: () => void; onPreview?: (path: string) => void }): JSX.Element {
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState<'accept' | 'back' | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const picks = useChangePicks(review.changes, onResolved)
  const pending = review.changes.filter((c) => c.status === 'pending')
  const who = review.agent ? firstName(review.agent.name) : 'the agent'

  const finish = async (mode: 'accept' | 'back'): Promise<void> => {
    if (mode === 'back') picks.pickNone()
    const accepted = mode === 'back' ? 0 : picks.picked
    const rejected = picks.total - accepted
    try {
      await picks.submit(note)
      if (review.message && !review.message.reply) {
        const text = accepted === 0 ? `Sent back: ${note.trim() || 'needs changes.'}` : rejected === 0 ? 'Accepted.' : `Accepted ${accepted} of ${picks.total} changes. ${note.trim()}`.trim()
        await window.tyslin.channels.reply(review.message.id, text, taskSessionId)
      }
      setDone(accepted === 0 ? `Sent ${rejected} change${rejected === 1 ? '' : 's'} back to ${who}.` : `Accepted ${accepted} change${accepted === 1 ? '' : 's'}${rejected ? `; ${rejected} went back to ${who}` : ''}.`)
    } catch { /* picks.error shows it */ } finally { setConfirm(null) }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none flex-col gap-0.5 border-b border-border px-4 py-3">
        <strong className="text-sm font-semibold">{review.agent ? `${firstName(review.agent.name)} · ` : ''}{review.card?.title ?? 'This task'}</strong>
        <span className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{review.changes.length} file{review.changes.length === 1 ? '' : 's'}{pending.length ? ` · ${picks.picked} of ${picks.total} changes picked` : ' · reviewed'}</span>
          {pending.length > 0 && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={picks.picked === picks.total ? picks.pickNone : picks.pickAll}>{picks.picked === picks.total ? 'Pick none' : 'Pick all'}</Button>}
        </span>
      </div>
      <ChangeReviewBody changes={review.changes} picks={picks} onPreview={onPreview} />
      {pending.length > 0 ? (
        <div className="flex flex-none flex-col gap-2.5 border-t border-border px-4 py-3">
          {confirm ? (
            <>
              <p className="text-[13.5px]">{confirm === 'accept' ? `Writes ${picks.picked} change${picks.picked === 1 ? '' : 's'} to the folder now; ${picks.total - picks.picked ? `${picks.total - picks.picked} go${picks.total - picks.picked === 1 ? 'es' : ''} back to ${who}` : 'nothing goes back'}.` : `${picks.total === 1 ? 'Sends the change' : `Sends all ${picks.total} changes`} back to ${who}. Nothing is written.`} This can't be undone.</p>
              <span className="flex gap-2"><Button variant={confirm === 'accept' ? 'lime' : 'default'} size="sm" className="min-h-9 font-semibold" disabled={picks.busy} onClick={() => void finish(confirm)}>Confirm</Button><Button variant="outline" size="sm" className="min-h-9" disabled={picks.busy} onClick={() => setConfirm(null)}>Back</Button></span>
            </>
          ) : (
            <>
              <span className="flex flex-col gap-1.5">
                <Label htmlFor="cp-note" className="text-xs">Note for {who} (goes with what you send back)</Label>
                <Input id="cp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. keep the old function name" className="h-9" />
              </span>
              <span className="flex flex-wrap gap-2">
                <Button variant="lime" size="sm" className="min-h-9 font-semibold" disabled={picks.busy || picks.picked === 0} onClick={() => setConfirm('accept')}>Accept picked ({picks.picked})</Button>
                <Button variant="outline" size="sm" className="min-h-9" disabled={picks.busy} onClick={() => setConfirm('back')}>{picks.total === 1 ? 'Send it back' : 'Send all back'}</Button>
              </span>
            </>
          )}
          {picks.error && <p className="text-[13px] text-destructive" role="alert">{picks.error}</p>}
        </div>
      ) : (
        <div className="flex-none border-t border-border px-4 py-3 text-[13px] text-muted-foreground" role="status">{done ?? 'These changes have been reviewed.'}</div>
      )}
    </div>
  )
}
