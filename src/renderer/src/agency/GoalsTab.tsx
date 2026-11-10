import { useState } from 'react'
import type { Agency } from '@shared/types'
import type { AgencyView } from '../agencies'
import { firstName, money } from '../boardStats'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { NOTIFY_LABEL } from '@shared/agencies'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const HINT = 'text-xs leading-normal text-muted-foreground'

/** Goals: what the agency is for, the rules every agent follows, and its limits (what the Lead sends, auto-run; the cap is on Budget). */
export function GoalsTab({ view, onChanged, onChannel, onBudget }: { view: AgencyView; onChanged: () => void; onChannel: () => void; onBudget: () => void }): JSX.Element {
  const { agency, lead } = view
  const [goal, setGoal] = useState(agency.goal)
  const [prompt, setPrompt] = useState(agency.prompt)
  const [notify, setNotify] = useState<Agency['notify']>(agency.notify)
  const [autoRun, setAutoRun] = useState(agency.autoRun)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const dirty = goal !== agency.goal || prompt !== agency.prompt || notify !== agency.notify || autoRun !== agency.autoRun
  const who = lead ? firstName(lead.name) : 'The Lead'

  const save = async (): Promise<void> => {
    setBusy(true); setError(''); setSaved(false)
    try { await window.tyslin.agencies.update(agency.id, { goal: goal.trim(), prompt: prompt.trim(), notify, autoRun }); setSaved(true); onChanged() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card className="gap-2 px-5 py-[18px]">
            <Label htmlFor="ag-goal" className="text-sm font-semibold">Goal</Label>
            <span className={HINT}>One paragraph. {who} reads it before every plan; workers see it on every card.</span>
            <Textarea id="ag-goal" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What this agency exists to do." />
          </Card>
          <Card className="gap-2 px-5 py-[18px]">
            <Label htmlFor="ag-rules" className="text-sm font-semibold">Rules for every agent</Label>
            <span className={HINT}>The agency's shared instructions, on top of each agent's own. Changes apply to new chats and new agents.</span>
            <Textarea id="ag-rules" rows={7} className="resize-y" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={'- Use pnpm, not npm.\n- Build UI only with the components in components/ui.\n- Ask before adding a dependency.'} />
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card className="gap-4 px-5 py-[18px]">
            <span className="text-sm font-semibold">Limits</span>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Spent this month</span>
              <span className="font-mono text-sm">{money(agency.spent)}{agency.budget !== null ? ` of ${money(agency.budget)}` : ''}</span>
            </div>
            <span className={HINT}>{agency.budget !== null ? `At the cap, new cards wait until you raise it or the month ends.` : 'No monthly cap yet.'} Cap, alerts and every run: <button type="button" className="text-green underline underline-offset-2" onClick={onBudget}>Budget</button>.</span>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="ag-notify" className="text-sm font-normal">{who} messages you about</Label>
              <Select value={notify} onValueChange={(v) => setNotify(v as Agency['notify'])}>
                <SelectTrigger id="ag-notify" className="min-w-[210px] bg-card"><SelectValue /></SelectTrigger>
                <SelectContent position="popper">{(['all', 'questions', 'digest'] as const).map((k) => <SelectItem key={k} value={k}>{NOTIFY_LABEL[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex min-h-9 items-center justify-between gap-3">
              <Label htmlFor="ag-auto" className="text-sm font-normal">Run the plan without asking</Label>
              <Switch id="ag-auto" checked={autoRun} onCheckedChange={setAutoRun} />
            </div>
            <span className={HINT}>{autoRun ? `${who} starts planned cards on its own.` : `Each plan waits for your OK in the task.`} Where messages go: {agency.channel.kind === 'none' ? 'the app only' : agency.channel.kind === 'telegram' ? 'Telegram' : 'Slack'} (<button type="button" className="text-green underline underline-offset-2" onClick={onChannel}>Channel</button>).</span>
          </Card>
          <span className={HINT}>{who}'s own instructions are on its page under Team. Memory is what the agents learn as they go, under Memory.</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</Button>
        {saved && !dirty && <span className={HINT} role="status">Saved.</span>}
        {error && <span className="text-[13px] text-destructive" role="alert">{error}</span>}
      </div>
    </form>
  )
}
