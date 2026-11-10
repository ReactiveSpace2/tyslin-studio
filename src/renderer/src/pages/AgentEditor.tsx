import { useEffect, useState } from 'react'
import type { Agent, AgentInput, EngineId, EngineStatus, McpServerInfo, ProviderId, Skill } from '@shared/types'
import { ENGINE_NAMES, MAIN_ENGINES, engineListed } from '@shared/engines'
import { MODEL_SUGGESTIONS, PROVIDER_NAME } from '@shared/models'
import { HEADS } from '@shared/heads'
import { canUseOpenRouter, slugFits } from '@shared/openrouter'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { getDefaultModel } from '../defaultModel'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { OpenRouterModelPicker } from '../components/OpenRouterModelPicker'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const HINT = 'text-xs leading-snug text-muted-foreground'
const YOU = '__you'

interface Props {
  view: AgencyView
  /** null = a new worker. */
  agent: Agent | null
  agents: Agent[]
  onSaved: (a: Agent) => void
  onDeleted: () => void
  onBack: () => void
  onMemory: () => void
}

/** One agent: head, name, job, goal, instructions, what it runs on, who it reports to, file tools, connectors and skills. New mode creates a worker. */
export function AgentEditor({ view, agent, agents, onSaved, onDeleted, onBack, onMemory }: Props): JSX.Element {
  const isNew = !agent
  const team = [view.lead, ...view.workers].filter((a): a is Agent => !!a)
  const dm = getDefaultModel()
  const fresh = dm?.provider === 'openrouter' // a new worker on an adapter doesn't take OpenRouter from the default
  const [form, setForm] = useState<AgentInput>(agent ?? {
    kind: 'agent', name: '', description: '', instructions: '', shape: 'hex', tone: 'lime', provider: fresh ? 'anthropic' : dm?.provider ?? 'anthropic', model: fresh ? '' : dm?.model ?? '',
    skills: [], schedule: 'manual', engine: view.agency.adapter !== 'template' && (MAIN_ENGINES as string[]).includes(view.agency.adapter) ? (view.agency.adapter as EngineId) : 'claude-code', writeMode: 'ask', isMascot: false,
    projectId: view.project.id, leadId: view.lead?.id ?? null, agency: view.agency.id, tools: { read: true, write: true }, channels: { telegram: false }, head: HEADS.map(([id]) => id).find((h) => !team.some((a) => a.head === h)) ?? 'smile', goal: ''
  })
  const set = <K extends keyof AgentInput>(k: K, v: AgentInput[K]): void => setForm((f) => ({ ...f, [k]: v }))
  // OpenRouter (10 Nov 2026): Leads and built-in agents can pick it as a provider; Claude Code and Codex workers can run
  // on it ("Model and key"); Gemini CLI can't. A worker never inherits it from the default model.
  const [orKey, setOrKey] = useState(false)
  useEffect(() => { void window.tyslin.settings.get().then((s) => setOrKey(s.openrouterKeySet)).catch(() => undefined) }, [])
  const nativeProvider = (e: EngineId, p: ProviderId): ProviderId => e === 'claude-code' ? 'anthropic' : e === 'codex' ? 'openai' : e === 'gemini-cli' ? 'gemini' : p
  const pickEngine = (e: EngineId): void => setForm((f) => {
    if (e === 'builtin') return { ...f, engine: e }
    const keepOr = f.provider === 'openrouter' && canUseOpenRouter(e) && slugFits(e, f.model)
    return { ...f, engine: e, ...(f.provider === 'openrouter' && !keepOr ? { provider: nativeProvider(e, f.provider), model: '' } : {}) }
  })
  const adapterOr = form.engine !== 'builtin' && canUseOpenRouter(form.engine) && form.provider === 'openrouter'
  const [engines, setEngines] = useState<EngineStatus[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [servers, setServers] = useState<McpServerInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [headOpen, setHeadOpen] = useState(false)
  useEffect(() => {
    void window.tyslin.engines.list().then(setEngines)
    void window.tyslin.skills.list().then(setSkills)
    void window.tyslin.integrations.list().then(setServers).catch(() => setServers([]))
    if (isNew) void window.tyslin.settings.prefs().then((p) => set('writeMode', p.defaultWriteMode))
  }, [])
  const taken = new Set(team.filter((a) => a.id !== agent?.id).map((a) => a.head))
  const isLead = !!agent && view.lead?.id === agent.id
  const bosses = team.filter((a) => a.id !== agent?.id)
  const engineOptions: { id: EngineId; name: string }[] = [{ id: 'builtin', name: 'Tyslin (built-in model)' }, ...engines.filter((e) => engineListed(e.id, form.engine)).map((e) => ({ id: e.id as EngineId, name: e.name }))]

  const save = async (): Promise<void> => {
    if (!form.name.trim()) { setError('Give the agent a name.'); return }
    if ((form.engine === 'builtin' && form.provider === 'openrouter' || adapterOr) && !orKey) { setError('Add your OpenRouter key in Settings → Models first.'); return }
    if (adapterOr && canUseOpenRouter(form.engine) && !slugFits(form.engine, form.model.trim())) { setError(form.engine === 'claude-code' ? 'Pick an anthropic/ model: Claude Code only runs Claude models.' : 'Pick an OpenRouter model, written in full like openai/gpt-5.5.'); return }
    setBusy(true); setError('')
    try {
      const saved = await window.tyslin.agents.save({ ...form, name: form.name.trim(), description: form.description.trim() })
      onSaved(saved)
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const remove = async (): Promise<void> => { if (!agent) return; try { await window.tyslin.agents.remove(agent.id); onDeleted() } catch (e) { setError(errorText(e)) } }
  const toggleServer = async (s: McpServerInfo, on: boolean): Promise<void> => {
    if (!agent) return
    const ids = on ? [...s.agentIds, agent.id] : s.agentIds.filter((x) => x !== agent.id)
    try { const r = await window.tyslin.integrations.setAgents(s.id, ids); setServers((l) => l.map((x) => (x.id === r.id ? r : x))) } catch (e) { setError(errorText(e)) }
  }
  const avatarProps = { shape: form.shape, tone: form.tone, head: form.head ?? null }

  return (
    <div className="flex w-full max-w-[1180px] flex-col gap-5 px-10 pt-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-muted-foreground"><button type="button" className="hover:text-foreground" onClick={onBack}>{view.agency.name}</button><span>/</span><button type="button" className="hover:text-foreground" onClick={onBack}>Team</button><span>/</span><strong className="text-foreground">{isNew ? 'New worker' : firstName(agent!.name)}</strong></span>
        <span className="flex gap-2"><Button variant="ghost" onClick={onBack}>Cancel</Button><Button onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create' : 'Save'}</Button></span>
      </div>
      {error && <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <Popover open={headOpen} onOpenChange={setHeadOpen}>
              <PopoverTrigger asChild>
                <button type="button" aria-label="Change the head" className="rounded-[14px] border border-border bg-card p-1.5 outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40"><Avatar {...avatarProps} size={56} /></button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[300px] rounded-xl p-2.5">
                <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Head">
                  {HEADS.map(([id]) => {
                    const isTaken = taken.has(id)
                    return (
                      <button key={id} type="button" role="radio" aria-checked={form.head === id} aria-label={`${id}${isTaken ? ' (taken in this agency)' : ''}`} disabled={isTaken} onClick={() => { set('head', id); setHeadOpen(false) }}
                        className={cn('grid size-11 place-items-center rounded-lg border bg-card outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-35', form.head === id ? 'border-foreground ring-1 ring-foreground' : 'border-border')}>
                        <Avatar shape={form.shape} tone={form.tone} head={id} size={34} />
                      </button>
                    )
                  })}
                </div>
                <span className={cn(HINT, 'mt-2 block')}>20 heads. Each one once per agency.</span>
              </PopoverContent>
            </Popover>
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5"><Label htmlFor="ae-name">Name</Label><Input id="ae-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Lena (Frontend)" autoFocus={isNew} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="ae-job">Job</Label><Input id="ae-job" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Frontend" /></div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="ae-goal">Goal</Label><Input id="ae-goal" value={form.goal ?? ''} maxLength={300} onChange={(e) => set('goal', e.target.value)} placeholder="One line: what good work from this agent looks like." /><span className={HINT}>The agency's goal and rules (Agency → Goals) sit above this.</span></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="ae-inst">Instructions</Label><Textarea id="ae-inst" rows={10} className="resize-y" value={form.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Written in plain words. The Lead adds the team and the task on top of this." /></div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium">Skills</span>
            <div className="flex flex-wrap gap-1.5">
              {form.skills.map((n) => <Badge key={n} variant="outline" className="h-7 gap-1.5 bg-card pr-1 font-mono font-normal">{n}<button type="button" aria-label={`Remove ${n}`} className="grid size-5 place-items-center rounded-sm hover:bg-accent" onClick={() => set('skills', form.skills.filter((x) => x !== n))}><Icon name="close" size={11} /></button></Badge>)}
              <Popover>
                <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-7"><Icon name="plus" size={11} /> Add</Button></PopoverTrigger>
                <PopoverContent align="start" className="flex max-h-[320px] w-[320px] flex-col gap-0.5 overflow-y-auto rounded-xl p-1.5">
                  {skills.filter((s) => !form.skills.includes(s.name)).map((s) => <button key={s.id} type="button" className="flex flex-col rounded-md px-2.5 py-2 text-left hover:bg-accent" onClick={() => set('skills', [...form.skills, s.name])}><span className="font-mono text-[13px]">{s.name}</span><span className={HINT}>{s.description}</span></button>)}
                  {skills.filter((s) => !form.skills.includes(s.name)).length === 0 && <span className={cn(HINT, 'px-2.5 py-2')}>Every skill is already attached.</span>}
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Card className="gap-0 px-4 py-1">
            <div className="flex flex-col gap-2 border-b border-border py-3">
              <Label htmlFor="ae-engine" className="text-sm font-semibold">Runs on</Label>
              <Select value={form.engine} onValueChange={(v) => pickEngine(v as EngineId)} disabled={isLead}>
                <SelectTrigger id="ae-engine" className="bg-card"><SelectValue /></SelectTrigger>
                <SelectContent position="popper">{engineOptions.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
              {form.engine === 'builtin' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Select value={form.provider} onValueChange={(v) => { const p = v as ProviderId; setForm((f) => ({ ...f, provider: p, model: p === 'openrouter' ? '' : MODEL_SUGGESTIONS[p][0] ?? '' })) }}>
                    <SelectTrigger aria-label="Provider" className="bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper">{(['anthropic', 'openai', 'gemini', 'openrouter'] as ProviderId[]).map((p) => <SelectItem key={p} value={p}>{PROVIDER_NAME[p]}</SelectItem>)}</SelectContent>
                  </Select>
                  {form.provider === 'openrouter'
                    ? <OpenRouterModelPicker value={form.model} onChange={(m) => set('model', m)} />
                    : <>
                        <Input aria-label="Model" className="font-mono text-xs" value={form.model} onChange={(e) => set('model', e.target.value)} list="ae-models" />
                        <datalist id="ae-models">{(MODEL_SUGGESTIONS[form.provider] ?? []).map((m) => <option key={m} value={m} />)}</datalist>
                      </>}
                </div>
              ) : canUseOpenRouter(form.engine) ? (
                <div className="flex flex-col gap-2">
                  <Select value={adapterOr ? 'openrouter' : 'own'} onValueChange={(v) => setForm((f) => (v === 'openrouter' ? { ...f, provider: 'openrouter', model: '' } : { ...f, provider: nativeProvider(f.engine, f.provider), model: '' }))}>
                    <SelectTrigger aria-label="Model and key" className="bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="own">Its own model, your {form.engine === 'codex' ? 'OpenAI' : 'Claude'} key or account</SelectItem>
                      <SelectItem value="openrouter">A model on OpenRouter, your OpenRouter key</SelectItem>
                    </SelectContent>
                  </Select>
                  {adapterOr
                    ? <><OpenRouterModelPicker value={form.model} onChange={(m) => set('model', m)} engine={form.engine as 'claude-code' | 'codex'} />
                        <span className={HINT}>{form.engine === 'claude-code' ? 'Claude Code runs only Claude models (anthropic/…).' : 'Codex takes any model with tool calls; OpenAI models work best.'} Runs in a Tyslin-owned {form.engine === 'claude-code' ? 'Claude' : 'Codex'} folder, so your own sign-in isn't used or changed.{!orKey && ' Add your OpenRouter key in Settings → Models first.'}</span></>
                    : <span className={HINT}>{ENGINE_NAMES[form.engine]} uses its own model and your key or account (Settings → Accounts).</span>}
                </div>
              ) : <span className={HINT}>{ENGINE_NAMES[form.engine]} uses its own model and your key or account (Settings → Accounts).{form.engine === 'gemini-cli' && ' It has no OpenRouter option.'}</span>}
              {isLead && <span className={HINT}>The Lead always runs on the built-in model.</span>}
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-border py-3">
              <Label htmlFor="ae-boss" className="text-sm font-semibold">Reports to</Label>
              <Select value={form.leadId ?? YOU} onValueChange={(v) => set('leadId', v === YOU ? null : v)} disabled={isLead}>
                <SelectTrigger id="ae-boss" className="w-[170px] bg-card"><SelectValue /></SelectTrigger>
                <SelectContent position="popper"><SelectItem value={YOU}>You</SelectItem>{bosses.map((b) => <SelectItem key={b.id} value={b.id}>{firstName(b.name)}{b.id === view.lead?.id ? ' (Lead)' : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-2"><Label htmlFor="ae-read" className="text-sm font-semibold">Can read files</Label><Switch id="ae-read" checked={form.tools?.read ?? true} onCheckedChange={(v) => set('tools', { read: v, write: v && (form.tools?.write ?? true) })} /></div>
            <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-2"><span className="flex flex-col"><Label htmlFor="ae-write" className="text-sm font-semibold">Can change files</Label><span className={HINT}>{form.writeMode === 'ask' ? 'Each change waits for your review.' : 'Written straight to disk.'}</span></span><Switch id="ae-write" checked={form.tools?.write ?? true} disabled={!(form.tools?.read ?? true)} onCheckedChange={(v) => set('tools', { read: form.tools?.read ?? true, write: v })} /></div>
            <div className="flex flex-col gap-1.5 py-3">
              <span className="text-sm font-semibold">Connectors</span>
              {!agent && <span className={HINT}>Create the worker first, then switch connectors on.</span>}
              {agent && form.engine === 'builtin' && <span className={HINT}>Built-in-model agents can't use connectors yet.</span>}
              {agent && form.engine !== 'builtin' && servers.length === 0 && <span className={HINT}>None in this organization. Add one under Agency → Connectors.</span>}
              {agent && form.engine !== 'builtin' && servers.map((s) => <span key={s.id} className="flex min-h-9 items-center justify-between gap-3 text-sm"><span>{s.title || s.name}</span><Switch checked={s.agentIds.includes(agent.id)} aria-label={`${s.title || s.name}`} onCheckedChange={(v) => void toggleServer(s, v)} /></span>)}
            </div>
          </Card>
          {agent && <Card className="gap-2 px-4 py-3.5"><span className="flex items-center justify-between"><strong className="text-sm font-semibold">Memory</strong><Button variant="link" size="sm" className="h-7 px-1" onClick={onMemory}>Open</Button></span><span className={HINT}>What {firstName(agent.name)} always remembers, in the agency's memory folder.</span></Card>}
          {agent && !isLead && <Button variant="ghost" size="sm" className="self-start text-destructive hover:bg-destructive-soft hover:text-destructive" onClick={() => setConfirm(true)}><Icon name="trash" size={12} /> Remove {firstName(agent.name)} from the agency</Button>}
        </div>
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove {agent ? firstName(agent.name) : ''}?</AlertDialogTitle><AlertDialogDescription>Its chats and scheduled tasks are deleted. Cards it was given stay on the board unassigned.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void remove()}>Remove</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
