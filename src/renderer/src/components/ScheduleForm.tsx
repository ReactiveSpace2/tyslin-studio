import { useState } from 'react'
import type { Agent, ScheduledTask, TaskInput, TaskSchedule } from '@shared/types'
import { nextRunAfter, WEEKDAY_NAMES } from '@shared/schedule'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const DAYS = [1, 2, 3, 4, 5, 6, 0]

interface Props {
  agencies: AgencyView[]
  /** Editing: the task; otherwise a new one. */
  task?: ScheduledTask | null
  /** The agency preselected for a new task. */
  agencyId?: string | null
  onSaved: (t: ScheduledTask) => void
  onCancel: () => void
}

/** New or edited scheduled task: what to do, which agency and agent, and when (daily, weekdays or weekly). */
export function ScheduleForm({ agencies, task, agencyId, onSaved, onCancel }: Props): JSX.Element {
  const agentOf = (id: string): AgencyView | undefined => agencies.find((v) => [v.lead, ...v.workers].some((a) => a?.id === id))
  const [agency, setAgency] = useState<string>(task ? agentOf(task.agentId)?.agency.id ?? agencies[0]?.agency.id ?? '' : agencyId ?? agencies[0]?.agency.id ?? '')
  const view = agencies.find((v) => v.agency.id === agency) ?? null
  const team = view ? [view.lead, ...view.workers].filter((a): a is Agent => !!a) : []
  const [agentId, setAgentId] = useState<string>(task?.agentId ?? view?.lead?.id ?? '')
  const [prompt, setPrompt] = useState(task?.prompt ?? '')
  const [schedule, setSchedule] = useState<TaskSchedule>(task?.schedule ?? { repeat: 'weekly', time: '09:00', day: 1 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const agent = team.find((a) => a.id === agentId) ?? team[0] ?? null
  const next = nextRunAfter(schedule, Date.now())

  const save = async (): Promise<void> => {
    if (!view || !agent || !prompt.trim()) return
    setBusy(true); setError('')
    try {
      const input: TaskInput = { id: task?.id, name: (task?.name && task.prompt === prompt ? task.name : prompt.trim().split('\n')[0].slice(0, 80)), prompt: prompt.trim(), agentId: agent.id, projectId: view.project.id, schedule, enabled: task?.enabled ?? true }
      onSaved(await window.tyslin.tasks.save(input))
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  return (
    <Card className="gap-4 px-5 py-[18px]">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <strong className="text-[15px] font-semibold">{task ? `Edit: ${task.name}` : 'New scheduled task'}</strong>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sf-prompt">What should happen</Label>
          <Textarea id="sf-prompt" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Every Friday, list the pull requests that waited more than two days and tell me." autoFocus={!task} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sf-agency">Agency</Label>
            <Select value={agency} onValueChange={(v) => { setAgency(v); const nv = agencies.find((x) => x.agency.id === v); setAgentId(nv?.lead?.id ?? '') }}>
              <SelectTrigger id="sf-agency" className="bg-card"><SelectValue placeholder="Pick an agency" /></SelectTrigger>
              <SelectContent position="popper">{agencies.map((v) => <SelectItem key={v.agency.id} value={v.agency.id}>{v.agency.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sf-agent">Who runs it</Label>
            <Select value={agent?.id ?? ''} onValueChange={setAgentId}>
              <SelectTrigger id="sf-agent" className="bg-card"><SelectValue placeholder="Pick an agent" /></SelectTrigger>
              <SelectContent position="popper">{team.map((a) => <SelectItem key={a.id} value={a.id}>{firstName(a.name)}{a.id === view?.lead?.id ? ' (Lead)' : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sf-repeat">Repeat</Label>
            <Select value={schedule.repeat} onValueChange={(v) => setSchedule((s) => ({ ...s, repeat: v as TaskSchedule['repeat'] }))}>
              <SelectTrigger id="sf-repeat" className="bg-card"><SelectValue /></SelectTrigger>
              <SelectContent position="popper"><SelectItem value="daily">Every day</SelectItem><SelectItem value="weekdays">Weekdays</SelectItem><SelectItem value="weekly">Every week</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {schedule.repeat === 'weekly' && (
            <ToggleGroup type="single" spacing={1} value={String(schedule.day ?? 1)} onValueChange={(v) => { if (v) setSchedule((s) => ({ ...s, day: Number(v) })) }} aria-label="Day of the week">
              {DAYS.map((d) => <ToggleGroupItem key={d} value={String(d)} className="h-9 w-11 rounded-md border border-border text-xs data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{WEEKDAY_NAMES[d].slice(0, 3)}</ToggleGroupItem>)}
            </ToggleGroup>
          )}
          <span className="flex items-center gap-2"><Label htmlFor="sf-time">at</Label><Input id="sf-time" type="time" value={schedule.time} onChange={(e) => setSchedule((s) => ({ ...s, time: e.target.value }))} className="w-[120px] font-mono" /></span>
          <span className="text-xs text-muted-foreground">Next run: {new Date(next).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Each run is a task you can open. Runs happen while the app is open; a missed one runs once at launch.</span>
          <span className="flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button><Button type="submit" size="sm" disabled={busy || !prompt.trim() || !agent}>{busy ? 'Saving…' : 'Save'}</Button></span>
        </div>
        {error && <span className="text-[13px] text-destructive" role="alert">{error}</span>}
      </form>
    </Card>
  )
}
