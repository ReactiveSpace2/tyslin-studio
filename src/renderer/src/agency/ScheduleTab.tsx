import { useEffect, useState } from 'react'
import type { Agent, ScheduledTask } from '@shared/types'
import { describeSchedule } from '@shared/schedule'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { ScheduleForm } from '../components/ScheduleForm'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const when = (ms: number | null): string => (ms ? new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '')

/** The scheduled tasks for one agency (or all of them), with switch, run now, edit and delete. */
export function ScheduleList({ agencies, only, agentId, onOpenTask }: { agencies: AgencyView[]; only?: AgencyView | null; /** One agent's routines (the task's agent panel). */ agentId?: string; onOpenTask: (sessionId: string, agentId: string) => void }): JSX.Element {
  const [tasks, setTasks] = useState<ScheduledTask[] | null>(null)
  const [form, setForm] = useState<{ task: ScheduledTask | null } | null>(null)
  const [confirm, setConfirm] = useState<ScheduledTask | null>(null)
  const [error, setError] = useState('')
  const load = (): void => { void window.tyslin.tasks.list().then(setTasks).catch((e) => setError(errorText(e))) }
  useEffect(() => { load(); return window.tyslin.tasks.onChanged(load) }, [])
  const agentOf = (t: ScheduledTask): { a: Agent; v: AgencyView } | null => {
    for (const v of agencies) { const a = [v.lead, ...v.workers].find((x) => x?.id === t.agentId); if (a) return { a, v } }
    return null
  }
  const rows = (tasks ?? []).map((t) => ({ t, who: agentOf(t) })).filter(({ t, who }) => !!who && (!only || who.v.agency.id === only.agency.id) && (!agentId || t.agentId === agentId))
  const run = async (fn: () => Promise<unknown>): Promise<void> => { setError(''); try { await fn(); load() } catch (e) { setError(errorText(e)) } }

  return (
    <div className="flex flex-col gap-4">
      {form && <ScheduleForm agencies={agencies} task={form.task} agencyId={only?.agency.id ?? null} agentId={agentId ?? null} onSaved={() => { setForm(null); load() }} onCancel={() => setForm(null)} />}
      <Card className="gap-0 overflow-hidden py-0">
        {tasks === null && <span className="px-4 py-3 text-[13px] text-muted-foreground">Loading…</span>}
        {tasks !== null && rows.length === 0 && <span className="px-4 py-4 text-[13px] text-muted-foreground">Nothing scheduled{only ? ` for ${only.agency.name}` : ''}. Agencies made from a template get the Lead's weekly digest.</span>}
        {rows.map(({ t, who }) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <Avatar shape={who!.a.shape} tone={who!.a.tone} head={who!.a.head} size={30} />
            <span className="flex min-w-[220px] flex-1 flex-col gap-0.5">
              <strong className="text-sm font-semibold">{t.name}</strong>
              <span className="text-xs text-muted-foreground">{firstName(who!.a.name)}{only ? '' : ` · ${who!.v.agency.name}`}{t.lastStatus === 'error' ? ` · last run failed: ${t.lastError.slice(0, 80)}` : t.lastRunAt ? ` · last ran ${when(t.lastRunAt)}` : ''}</span>
            </span>
            <span className="w-[170px] font-mono text-xs text-muted-foreground">{describeSchedule(t.schedule)}</span>
            <span className="w-[120px] text-xs text-muted-foreground">{t.enabled ? `next ${when(t.nextRunAt)}` : 'off'}</span>
            <Switch checked={t.enabled} aria-label={`${t.name} on or off`} onCheckedChange={(v) => void run(() => window.tyslin.tasks.save({ id: t.id, name: t.name, prompt: t.prompt, agentId: t.agentId, projectId: t.projectId, schedule: t.schedule, enabled: v }))} />
            <Button variant="ghost" size="sm" onClick={() => void run(async () => { const sid = await window.tyslin.tasks.runNow(t.id); onOpenTask(sid, t.agentId) })}><Icon name="play" size={12} /> Run now</Button>
            <Button variant="ghost" size="sm" onClick={() => setForm({ task: t })}>Edit</Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirm(t)}>Delete</Button>
          </div>
        ))}
      </Card>
      {!form && <Button variant="outline" size="sm" className="self-start" onClick={() => setForm({ task: null })}><Icon name="plus" size={12} /> Schedule a task</Button>}
      {error && <span className="text-[13px] text-destructive" role="alert">{error}</span>}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete “{confirm?.name}”?</AlertDialogTitle><AlertDialogDescription>It stops running. Tasks it already made stay in Recents.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { if (confirm) void run(() => window.tyslin.tasks.remove(confirm.id)); setConfirm(null) }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function ScheduleTab({ view, agencies, onOpenTask }: { view: AgencyView; agencies: AgencyView[]; onOpenTask: (sessionId: string, agentId: string) => void }): JSX.Element {
  return <ScheduleList agencies={agencies} only={view} onOpenTask={onOpenTask} />
}
