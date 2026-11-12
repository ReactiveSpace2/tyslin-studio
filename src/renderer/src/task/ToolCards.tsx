import { useState } from 'react'
import type { Agent, McpServerInfo } from '@shared/types'
import { MCP_PRESETS } from '@shared/mcpPresets'
import type { ToolDef } from '@shared/toolCatalog'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const HINT = 'text-xs text-muted-foreground'
const toolCount = (n: number): string => `${n} tool${n === 1 ? '' : 's'}`

/** The tile with the tool's first letter (the Connectors tab's look). */
function Tile({ tool }: { tool: ToolDef }): JSX.Element {
  return <span className="grid size-9 flex-none place-items-center rounded-lg border border-border bg-muted text-xs font-bold">{tool.title.slice(0, 1)}</span>
}

/**
 * C on the canvas: an agent said it can't see, fetch or reach something, and a tool would fix that. One card in the
 * thread, in plain words; nothing is added without a click.
 */
export function ToolSuggestCard({ tool, agent, reason, onAdd, onDismiss }: { tool: ToolDef; agent: Agent | null; reason: string; onAdd: (whole: boolean) => void; onDismiss: () => void }): JSX.Element {
  // The Lead runs on a built-in model and can't use tools, so what it asked for goes to the workers.
  const worker = agent && agent.engine !== 'builtin' ? agent : null
  const who = worker ? firstName(worker.name) : 'the team'
  const Who = worker ? who : 'The team'
  return (
    <div className="flex items-start gap-3">
      <span className="flex-none">{agent ? <Avatar shape={agent.shape} tone={agent.tone} head={agent.head} size={32} /> : <span className="block size-8" />}</span>
      <Card className="max-w-[560px] min-w-0 flex-1 gap-3 border-green px-4 py-3.5" role="group" aria-label={`Give ${who} ${tool.title}`}>
        <span className="flex items-center gap-3">
          <Tile tool={tool} />
          <span className="flex min-w-0 flex-col"><strong className="text-sm font-semibold">Give {who} {tool.id === 'playwright' ? 'a browser' : tool.title}</strong><span className={HINT}>{tool.title} · {tool.needs.toLowerCase()}</span></span>
        </span>
        <p className="text-[13.5px] leading-relaxed text-foreground/85">{Who} {reason}. {tool.line} {worker ? `Only ${who} gets it unless you say otherwise.` : 'Every worker gets it.'}</p>
        <span className="flex flex-wrap items-center gap-2">
          <Button variant="lime" size="sm" className="min-h-9 font-semibold" onClick={() => onAdd(false)}>Add {tool.title}</Button>
          {worker && <Button variant="ghost" size="sm" className="min-h-9" onClick={() => onAdd(true)}>Give it to the whole team</Button>}
          <Button variant="ghost" size="sm" className="ml-auto min-h-9 text-muted-foreground" onClick={onDismiss}>Not now</Button>
        </span>
      </Card>
    </div>
  )
}

/**
 * D on the canvas: the setup as a card in the thread. A token for the token tools, who gets it, then Connect and test.
 * Once connected the card becomes one quiet line, so the task keeps a record of what the team was given.
 */
export function ToolSetupCard({ tool, team, initialAgentIds, onConnected, onCancel }: { tool: ToolDef; team: Agent[]; initialAgentIds: string[]; onConnected: (s: McpServerInfo) => void; onCancel: () => void }): JSX.Element {
  const preset = tool.presetId ? MCP_PRESETS.find((p) => p.id === tool.presetId) ?? null : null
  const canUse = team.filter((a) => a.engine !== 'builtin')
  const lead = team.find((a) => a.engine === 'builtin')
  const [token, setToken] = useState('')
  const [agentIds, setAgentIds] = useState<string[]>(initialAgentIds.filter((id) => canUse.some((a) => a.id === id)))
  const [busy, setBusy] = useState<'' | 'saving' | 'testing'>('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<McpServerInfo | null>(null)
  const connect = async (): Promise<void> => {
    setError('')
    if (preset && !token.trim()) { setError(`Paste your ${preset.title} ${preset.tokenLabel.toLowerCase()} first.`); return }
    if (!agentIds.length) { setError('Pick at least one agent.'); return }
    setBusy('saving')
    try {
      const saved = await window.tyslin.integrations.save(preset
        ? { name: tool.name, preset: preset.id, transport: 'http', url: preset.url, token, agentIds }
        : { name: tool.name, title: tool.title, source: tool.source ?? '', preset: '', transport: 'stdio', commandLine: tool.commandLine, env: '', agentIds })
      setBusy('testing')
      const tested = await window.tyslin.integrations.test(saved.id)
      if (tested.lastTest && !tested.lastTest.ok) {
        // Keep the connector (it can be fixed on the Connectors tab) but say plainly that it didn't answer.
        setError(`${tool.title} was added but the test failed: ${tested.lastTest.error ?? 'no answer'}. You can fix it on the agency's Connectors tab.`)
        setDone(tested); onConnected(tested); return
      }
      setDone(tested); onConnected(tested)
    } catch (e) { setError(errText(e)) } finally { setBusy('') }
  }
  const who = (ids: string[]): string => canUse.filter((a) => ids.includes(a.id)).map((a) => firstName(a.name)).join(', ')
  if (done) {
    return (
      <div className="pl-11">
        <div className="flex max-w-[560px] flex-col gap-1 rounded-lg bg-muted px-4 py-3">
          <span className="flex items-center gap-2 text-[13.5px]"><Icon name={done.lastTest?.ok ? 'check' : 'warning'} size={14} className={done.lastTest?.ok ? 'text-green' : 'text-destructive'} /><strong className="font-semibold">{tool.title} {done.lastTest?.ok ? 'connected' : 'added'}</strong><span className={HINT}>{done.lastTest?.ok ? `· ${toolCount(done.lastTest.tools?.length ?? 0)}` : ''} · {who(done.agentIds) || 'nobody yet'}</span></span>
          {done.lastTest?.ok && <span className={HINT}>{lead ? `${firstName(lead.name)} knows. ` : ''}{tool.id === 'playwright' ? 'Ask for screenshots of a page and they can take them now.' : `Say what to look up in ${tool.title} and they can read it now.`}</span>}
          {error && <span className="text-[13px] text-destructive" role="alert">{error}</span>}
        </div>
      </div>
    )
  }
  return (
    <div className="pl-11">
      <Card className="max-w-[560px] gap-4 px-4 py-4" role="group" aria-label={`Connect ${tool.title}`}>
        <span className="flex items-start justify-between gap-3">
          <span className="flex items-center gap-3"><Tile tool={tool} /><span className="flex min-w-0 flex-col"><strong className="text-sm font-semibold">Connect {tool.title}</strong><span className={HINT}>{tool.line}</span></span></span>
          <Button type="button" variant="ghost" size="icon" className="size-8 flex-none" aria-label="Close" onClick={onCancel} disabled={!!busy}><Icon name="close" size={14} /></Button>
        </span>
        {preset ? (
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between"><Label htmlFor="tool-token">Your {preset.title} {preset.tokenLabel.toLowerCase()}</Label><a href={preset.tokenUrl} target="_blank" rel="noreferrer" className="text-xs text-green underline-offset-2 hover:underline">Make one on {preset.title}</a></span>
            <Input id="tool-token" type="password" className="font-mono" autoComplete="off" value={token} placeholder={preset.tokenPlaceholder} onChange={(e) => setToken(e.target.value)} disabled={!!busy} />
            <span className={HINT}>{preset.tokenHint} It stays encrypted on this computer.</span>
          </div>
        ) : (
          <p className={HINT}>{tool.needs}. Tyslin starts it when an agent needs it: <span className="font-mono">{tool.commandLine}</span></p>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">Who gets it</span>
          <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {canUse.map((a) => (
              <span key={a.id} className="flex items-center gap-2 text-sm"><Switch checked={agentIds.includes(a.id)} disabled={!!busy} aria-label={`${a.name} gets ${tool.title}`} onCheckedChange={(v) => setAgentIds((ids) => (v ? [...ids, a.id] : ids.filter((x) => x !== a.id)))} /><Avatar shape={a.shape} tone={a.tone} head={a.head} size={20} />{firstName(a.name)}</span>
            ))}
            {lead && <span className={HINT}>{firstName(lead.name)} (Lead) can't use tools yet</span>}
          </span>
        </div>
        {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
        <span className="flex flex-wrap items-center gap-2">
          <Button variant="lime" size="sm" className="min-h-9 font-semibold" disabled={!!busy} onClick={() => void connect()}>{busy === 'saving' ? 'Connecting…' : busy === 'testing' ? 'Testing…' : 'Connect and test'}</Button>
          <Button variant="ghost" size="sm" className="min-h-9" disabled={!!busy} onClick={onCancel}>Cancel</Button>
          <span className={`ml-auto ${HINT}`}>Also on the agency's Connectors tab</span>
        </span>
      </Card>
    </div>
  )
}

// ---- Needs: what a card or the Lead says the team lacks (A and B on the canvas, 12 Nov 2026) -------------------

import type { CardNeed, Skill } from '@shared/types'
import { connectedTool, needLabel, resolveTool, serverIsTool } from '@shared/toolCatalog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export interface NeedItem extends CardNeed { /** Who should get it (the card's assignee, or every worker). */ forIds: string[] }

export interface NeedHandlers {
  team: Agent[]
  servers: McpServerInfo[]
  skills: Skill[]
  /** Opens the tool setup card in the thread. */
  onToolSetup: (tool: ToolDef, agentIds: string[]) => void
  onAgentsChanged: () => void
  /** The agency's Connectors tab, for a tool that isn't in the catalogue. */
  onFindTool: () => void
  /** The agency's Skills tab, for a skill that isn't in the library. */
  onFindSkill: () => void
}

/** Whether a need is met for the agents it is for. */
export function needMet(n: NeedItem, h: Pick<NeedHandlers, 'team' | 'servers'>): boolean {
  const who = h.team.filter((a) => n.forIds.includes(a.id) && a.engine !== 'builtin')
  if (n.kind === 'skill') return who.length > 0 && who.every((a) => a.skills.includes(n.name))
  const t = resolveTool(n.name)
  if (!t) return h.servers.some((s) => serverIsTool(s, n.name) && who.some((a) => s.agentIds.includes(a.id)))
  const c = connectedTool(t, h.servers, new Set(who.map((a) => a.id)))
  return !!c && who.every((a) => c.agentIds.length === 0 || c.agentIds.includes(a.id))
}

/** The list of needs with one button each; met ones show a tick. Used by the Plan card and the Lead's needs message. */
export function NeedList({ items, h, busy }: { items: NeedItem[]; h: NeedHandlers; busy?: boolean }): JSX.Element {
  const [working, setWorking] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const who = (ids: string[]): string => h.team.filter((a) => ids.includes(a.id) && a.engine !== 'builtin').map((a) => firstName(a.name)).join(', ') || 'the team'
  const addSkill = async (n: NeedItem): Promise<void> => {
    setWorking(n.kind + n.name); setErr('')
    try {
      for (const a of h.team) if (n.forIds.includes(a.id) && a.engine !== 'builtin' && !a.skills.includes(n.name)) await window.tyslin.agents.save({ ...a, skills: [...a.skills, n.name] })
      h.onAgentsChanged()
    } catch (e) { setErr(errText(e)) } finally { setWorking(null) }
  }
  return (
    <div className="flex flex-col">
      {items.map((n) => {
        const key = n.kind + n.name + n.forIds.join(',')
        const met = needMet(n, h)
        const tool = n.kind === 'tool' ? resolveTool(n.name) : undefined
        const skill = n.kind === 'skill' ? h.skills.find((s) => s.name === n.name) : undefined
        const known = n.kind === 'tool' ? !!tool : !!skill
        return (
          <span key={key} className="flex items-center gap-3 border-t border-border py-2 first:border-t-0">
            <span className={`grid size-8 flex-none place-items-center rounded-lg border border-border bg-muted text-[11px] font-bold ${n.kind === 'skill' ? 'font-mono' : ''}`}>{n.kind === 'skill' ? 'sk' : (tool?.title ?? n.name).slice(0, 1).toUpperCase()}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13.5px]">{n.kind === 'skill' ? <>The <span className="font-mono text-[13px]">{n.name}</span> skill, for {who(n.forIds)}</> : `${needLabel(n).replace(/^a /, 'A ')}, for ${who(n.forIds)}`}</span>
              <span className={HINT}>{met ? (n.kind === 'skill' ? 'Added' : 'Connected') : n.why ? n.why : n.kind === 'skill' ? (skill ? skill.description : 'Not in your library yet') : tool ? tool.needs : 'Not in the catalogue; find it under Connectors'}</span>
            </span>
            {met ? <span className="flex items-center gap-1 text-xs text-green"><Icon name="check" size={13} /> Done</span>
              : !known ? <Button variant="outline" size="sm" className="h-8" disabled={busy} onClick={n.kind === 'skill' ? h.onFindSkill : h.onFindTool}>Find</Button>
              : n.kind === 'skill' ? <Button variant="lime" size="sm" className="h-8 font-semibold" disabled={busy || working === n.kind + n.name} onClick={() => void addSkill(n)}>{working === n.kind + n.name ? 'Adding…' : 'Add'}</Button>
              : <Button variant={tool!.presetId ? 'outline' : 'lime'} size="sm" className={`h-8 ${tool!.presetId ? '' : 'font-semibold'}`} disabled={busy} onClick={() => h.onToolSetup(tool!, n.forIds)}>{tool!.presetId ? 'Connect' : 'Add'}</Button>}
          </span>
        )
      })}
      {err && <p className="pt-1 text-[13px] text-destructive" role="alert">{err}</p>}
    </div>
  )
}

/** D on the canvas, for a skill: an agent said it lacks a checklist for something the library has. Add is instant. */
export function SkillSuggestCard({ skill, agent, reason, team, onAdded, onDismiss }: { skill: Skill; agent: Agent | null; reason: string; team: Agent[]; onAdded: () => void; onDismiss: () => void }): JSX.Element {
  const worker = agent && agent.engine !== 'builtin' ? agent : null
  const who = worker ? firstName(worker.name) : 'the team'
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const add = async (whole: boolean): Promise<void> => {
    setBusy(true); setErr('')
    try {
      const targets = team.filter((a) => a.engine !== 'builtin' && (whole || !worker || a.id === worker.id))
      for (const a of targets) if (!a.skills.includes(skill.name)) await window.tyslin.agents.save({ ...a, skills: [...a.skills, skill.name] })
      setDone(targets.map((a) => firstName(a.name)).join(', ')); onAdded()
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  if (done) return <p className="flex items-center gap-2 pl-11 text-[13px] text-muted-foreground"><Icon name="check" size={13} className="text-green" /><span className="font-mono text-foreground">{skill.name}</span> added to {done}</p>
  return (
    <div className="flex items-start gap-3">
      <span className="flex-none">{agent ? <Avatar shape={agent.shape} tone={agent.tone} head={agent.head} size={32} /> : <span className="block size-8" />}</span>
      <Card className="max-w-[560px] min-w-0 flex-1 gap-3 border-green px-4 py-3.5" role="group" aria-label={`Give ${who} the ${skill.name} skill`}>
        <span className="flex items-center gap-3">
          <span className="grid size-9 flex-none place-items-center rounded-lg border border-border bg-muted font-mono text-[11px] font-bold">sk</span>
          <span className="flex min-w-0 flex-col"><strong className="text-sm font-semibold">Give {who} the <span className="font-mono">{skill.name}</span> skill</strong><span className={HINT}>In your library{team.some((a) => a.skills.includes(skill.name)) ? '' : ' · nobody on the team has it yet'}</span></span>
        </span>
        <p className="text-[13.5px] leading-relaxed text-foreground/85">{worker ? firstName(worker.name) : 'The team'} {reason}. {who === 'the team' ? 'Every worker' : firstName(worker!.name)} gets it on the next step; it costs nothing.</p>
        <Collapsible>
          <CollapsibleTrigger asChild><Button variant="link" size="sm" className="h-7 px-0 text-[13px]">Read the skill</Button></CollapsibleTrigger>
          <CollapsibleContent><pre className="mt-1 max-h-[200px] overflow-y-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">{skill.body}</pre></CollapsibleContent>
        </Collapsible>
        {err && <p className="text-[13px] text-destructive" role="alert">{err}</p>}
        <span className="flex flex-wrap items-center gap-2">
          <Button variant="lime" size="sm" className="min-h-9 font-semibold" disabled={busy} onClick={() => void add(false)}>{busy ? 'Adding…' : worker ? `Add to ${who}` : 'Add to the team'}</Button>
          {worker && <Button variant="ghost" size="sm" className="min-h-9" disabled={busy} onClick={() => void add(true)}>Add to the whole team</Button>}
          <Button variant="ghost" size="sm" className="ml-auto min-h-9 text-muted-foreground" onClick={onDismiss}>Not now</Button>
        </span>
      </Card>
    </div>
  )
}
