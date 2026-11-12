import { useEffect, useRef, useState } from 'react'
import type { Agent, ChannelMessage, KanbanCard, Message, PendingChange } from '@shared/types'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { AttachmentChip } from '../components/Composer'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Markdown } from '../components/Markdown'
import { Pose } from '../components/Pose'
import { ChannelCard, needsYou } from './ChannelCard'
import { PermissionCard } from './PermissionCard'
import { PlanCard } from './PlanCard'
import { PreviewCard, useMadeFiles } from './PreviewCard'
import { SkillSuggestCard, ToolSetupCard, ToolSuggestCard, type NeedHandlers } from './ToolCards'
import { connectedTool, skillHint, toolById, toolHint, type ToolDef } from '@shared/toolCatalog'
import type { McpServerInfo, Skill } from '@shared/types'
import { StatusTable } from './StatusTable'
import { WorkerWork } from './WorkerWork'
import { activityLabel, type Task } from './useTask'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const clock = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
/** Card runs and briefs send long generated prompts; show their start and fold the rest. */
const LONG_USER = 420
/** Markdown replies: the `md` styles plus list markers (Preflight removes them). */
const MD = 'max-w-full text-[15px] leading-[1.65] text-foreground [&_ol]:list-decimal [&_ul]:list-disc'

/** Prompts Tyslin writes into the chat on the user's behalf (an answer delivered, a card handed out), not the user's own words. */
// "Every planned card has run" is cards.ts REVIEW_PROMPT, the Lead's automatic review (QA, 10 Nov 2026: it showed as "You").
const SYSTEM_PROMPT = /^(The boss answered your|Work on this card from the|Read the Inbox and Review columns|Every planned card has run)/
const systemLabel = (text: string): string => /^The boss answered/.test(text) ? 'Your answer, delivered by Tyslin'
  : /^Work on this card/.test(text) ? 'Card handed out by Tyslin'
  : /^Every planned card has run/.test(text) ? 'Review of the finished cards, asked by Tyslin' : 'Scheduled by Tyslin'

function UserMessage({ m }: { m: Message }): JSX.Element {
  const [open, setOpen] = useState(false)
  const long = m.content.length > LONG_USER
  const system = SYSTEM_PROMPT.test(m.content)
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[80%] flex-col items-end gap-1">
        <span className="text-xs text-muted-foreground">{system ? systemLabel(m.content) : 'You'} · <span className="font-mono">{clock(m.createdAt)}</span></span>
        {m.attachments?.length ? <div className="flex flex-wrap justify-end gap-1.5" aria-label="Attachments">{m.attachments.map((a) => <AttachmentChip key={a.id} a={a} />)}</div> : null}
        {m.content && (
          <div className={cn('max-w-full rounded-[14px_14px_4px_14px] px-4 py-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-foreground', system ? 'border border-dashed border-border bg-muted text-[14px] text-muted-foreground' : 'bg-accent', long && !open && 'text-foreground/75')}>
            {long && !open ? m.content.slice(0, LONG_USER).trimEnd() + '…' : m.content}
          </div>
        )}
        {long && <Button variant="link" size="sm" className="h-7 px-0.5 text-[13px] underline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Show less' : 'Show the full message'}</Button>}
      </div>
    </div>
  )
}

interface Props {
  task: Task
  agent: Agent
  view: AgencyView | null
  sessionId: string
  focus?: string
  /** When the agency's next task began (null = this is the newest): files changed after it belong to that task. */
  until: number | null
  /** Opens a made file full screen in Preview. */
  onPreview: (path: string) => void
  /** The organization's connectors, for the tool suggestion and setup cards. */
  servers: McpServerInfo[]
  /** A tool being set up in the thread (D on the canvas), and who should get it. */
  toolSetup: { tool: ToolDef; agentIds: string[] } | null
  onToolSetup: (setup: { tool: ToolDef; agentIds: string[] } | null) => void
  onToolConnected: (s: McpServerInfo) => void
  /** The skill library, for needs and the skill suggestion card. */
  skills: Skill[]
  onAgentsChanged: () => void
  onConnectors: () => void
  onReview: (changes: PendingChange[], from: { agent: Agent | null; card: KanbanCard | null; message: ChannelMessage | null; sessionId: string }) => void
  onAskLead: () => void
  onOpenAgency: () => void
  onSettings: () => void
  onChanged: () => void
}

/**
 * The conversation: your messages, the agent's replies, and for a Lead's task its messages to you, the
 * plan waiting for your OK, where each card stands, each worker's folded run, and anything asking for
 * permission or review, all in time order.
 */
export function Thread({ task, agent, view, sessionId, focus, until, onPreview, servers, toolSetup, onToolSetup, onToolConnected, skills, onAgentsChanged, onConnectors, onReview, onAskLead, onOpenAgency, onSettings, onChanged }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const isLead = !!view && view.lead?.id === agent.id
  const team = view ? [view.lead, ...view.workers].filter((a): a is Agent => !!a) : [agent]
  const agentOf = (id: string | null | undefined): Agent | undefined => team.find((a) => a.id === id)

  // Files made during this task, each as a card where it was last changed (reloaded when a run ends or a change is answered).
  const made = useMadeFiles(view?.project.id ?? null, task.session?.createdAt ?? null, until,
    `${task.streaming === null}:${task.changes.map((c) => c.status).join('')}:${task.cards.map((c) => c.status ?? '-').join('')}:${Object.values(task.workerRuns).map((r) => (r.running ? 1 : 0)).join('')}`)

  // C on the canvas: the newest thing an agent said that a tool would solve, unless that tool is connected or the
  // suggestion was waved away for this task (localStorage).
  const teamIds = new Set(team.map((a) => a.id))
  const isConnected = (toolId: string): boolean => { const t = toolById(toolId); return !!t && !!connectedTool(t, servers, teamIds) }
  const [dismissed, setDismissed] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(`tyslin:toolhint:${sessionId}`) ?? '[]') as string[] } catch { return [] } })
  const dismiss = (toolId: string): void => { const next = [...dismissed, toolId]; setDismissed(next); try { localStorage.setItem(`tyslin:toolhint:${sessionId}`, JSON.stringify(next)) } catch { /* per-window */ } }
  const said: { at: number; text: string; agent: Agent | null }[] = [
    ...task.messages.filter((m) => m.role !== 'user').map((m) => ({ at: m.createdAt, text: m.content, agent })),
    ...task.cards.filter((c) => c.result).map((c) => ({ at: [...(c.log ?? [])].reverse()[0]?.at ?? c.createdAt, text: c.result!, agent: agentOf(c.assignee || c.agentId) ?? null })),
    ...Object.values(task.workerRuns).filter((r) => r.error).map((r) => ({ at: Date.now(), text: r.error!, agent: agentOf(r.agentId) ?? null }))
  ].sort((a, b) => b.at - a.at)
  const suggestion = (() => {
    for (const s of said) { const h = toolHint(s.text, isConnected); if (h && !dismissed.includes(h.toolId)) return { ...h, agent: s.agent, at: s.at } }
    return null
  })()
  const suggestedTool = suggestion ? toolById(suggestion.toolId) ?? null : null
  // The same for a skill: the newest "I don't have a checklist for…" that a library skill answers.
  const skillSuggestion = (() => {
    for (const s of said) {
      const attached = new Set(s.agent && s.agent.engine !== 'builtin' ? s.agent.skills : team.flatMap((a) => (a.engine !== 'builtin' ? a.skills : [])))
      const h = skillHint(s.text, skills, attached)
      if (h && !dismissed.includes('skill:' + h.name)) { const skill = skills.find((x) => x.name === h.name); if (skill) return { skill, reason: h.reason, agent: s.agent } }
    }
    return null
  })()
  const needHandlers: NeedHandlers = { team, servers, skills, onToolSetup: (tool, agentIds) => onToolSetup({ tool, agentIds }), onAgentsChanged, onFindTool: onConnectors, onFindSkill: onOpenAgency }

  // Follow the bottom while it is in view; a message to focus wins once.
  const focusDone = useRef<string | null>(null)
  useEffect(() => {
    if (focus && focusDone.current !== focus && task.channel.some((m) => m.id === focus)) {
      focusDone.current = focus
      requestAnimationFrame(() => document.getElementById(`cm-${focus}`)?.scrollIntoView({ block: 'center' }))
      return
    }
    if (atBottom) ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [task.messages, task.streaming, task.activity, task.changes, task.channel, task.cards, made.shown.length, toolSetup, focus])

  const planned = isLead && !view!.agency.autoRun ? task.cards.filter((c) => !c.status && task.board?.columns.some((col) => /planned/i.test(col.title) && col.cards.some((k) => k.id === c.id))) : []
  const active = task.cards.filter((c) => c.status || task.board?.columns.some((col) => /progress|review|done/i.test(col.title) && col.cards.some((k) => k.id === c.id)))
  const runningCard = task.cards.find((c) => c.status === 'running') ?? null
  const runs = task.cards.filter((c) => c.sessionId).sort((a, b) => (startOf(a) ?? a.createdAt) - (startOf(b) ?? b.createdAt))
  // Where the cards stand and each worker's run take their place in time (when the first card started), so a
  // newer reply from the Lead shows below them, not above (10 Nov 2026).
  const firstStart = runs.length ? (startOf(runs[0]) ?? runs[0].createdAt) : Date.now()
  const items: { at: number; node: JSX.Element }[] = [
    ...(active.length > 0 && view ? [{ at: firstStart - 1, node: <StatusTable key="status" view={view} board={task.board} cards={active} /> }] : []),
    ...runs.map((c) => ({
      at: startOf(c) ?? c.createdAt,
      node: (
        <WorkerWork key={c.id + (c.sessionId ?? '')} card={c} run={task.workerRuns[c.id]} agent={agentOf(c.assignee || c.agentId)}
          onReview={(changes, card) => onReview(changes, { agent: agentOf(card.assignee || card.agentId) ?? null, card, message: task.channel.find((m) => m.kind === 'review' && m.cardId === card.id && !m.reply) ?? null, sessionId: card.sessionId! })} />
      )
    })),
    ...task.messages.map((m) => ({
      at: m.createdAt,
      node: m.role === 'user' ? <UserMessage key={m.id} m={m} /> : (
        <div key={m.id} className="flex items-start gap-3">
          <span className="flex-none"><Avatar shape={agent.shape} tone={agent.tone} head={agent.head} size={32} /></span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[13px]"><strong className="font-semibold">{firstName(agent.name)}</strong><span className="text-muted-foreground">{isLead ? ' · Lead' : ''} · <span className="font-mono text-xs">{clock(m.createdAt)}</span></span></span>
            <Markdown className={MD} text={m.content} />
          </div>
        </div>
      )
    })),
    ...task.channel.map((m) => ({
      at: m.createdAt,
      node: (
        <div key={m.id} id={`cm-${m.id}`} className="flex scroll-mt-4 items-start gap-3">
          <span className="flex-none"><Avatar shape={agent.shape} tone={agent.tone} head={agent.head} size={32} /></span>
          <div className="max-w-[640px] min-w-0 flex-1">
            <ChannelCard m={m} lead={view?.lead ?? null} board={task.board} sessionId={sessionId} needs={needHandlers} onAnswered={() => { task.reloadChannel(); onChanged() }}
              onReview={(changes, card, message) => onReview(changes, { agent: agentOf(card.assignee || card.agentId) ?? null, card, message, sessionId: card.sessionId! })} />
          </div>
        </div>
      )
    })),
    ...made.shown.map((f) => ({ at: f.updatedAt, node: <PreviewCard key={'file:' + f.path} projectId={view!.project.id} file={f} onOpen={onPreview} /> }))
  ].sort((a, b) => a.at - b.at)

  const needs = task.channel.filter(needsYou)
  const runsWithChanges = [...new Set(task.changes.map((c) => c.runId))].filter((r) => r === task.liveRun || task.changes.some((c) => c.runId === r && c.status === 'pending'))
  const workerPermissions = Object.values(task.workerRuns).flatMap((r) => r.permissions.map((p) => ({ p, a: agentOf(r.agentId) ?? null })))
  const empty = task.messages.length === 0 && task.channel.length === 0 && task.streaming === null

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} className="h-full overflow-y-auto px-6 pt-6 pb-3" onScroll={(e) => { const el = e.currentTarget; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80) }}>
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
          {empty && (
            <div className="mt-16 flex flex-col items-center gap-3 text-center">
              <Pose pose={4} height={120} />
              <h2 className="text-lg font-semibold tracking-tight">{isLead ? `Tell ${firstName(agent.name)} what to do` : `Talking to ${firstName(agent.name)}`}</h2>
              <p className="max-w-[460px] text-[14px] text-muted-foreground">{isLead ? `${firstName(agent.name)} reads the folder, plans the work into cards and asks you before anything runs.` : agent.description}</p>
            </div>
          )}
          {items.map((it) => it.node)}
          {made.more > 0 && <p className="pl-11 text-xs text-muted-foreground">{made.more} more file{made.more === 1 ? '' : 's'} from this task in <Button variant="link" size="sm" className="h-auto p-0 text-xs underline" onClick={() => onPreview(made.shown[0].path)}>Preview</Button>.</p>}
          {planned.length > 0 && view && <PlanCard view={view} cards={planned} needs={needHandlers} workingOn={runningCard ? { title: runningCard.title, who: firstName(agentOf(runningCard.assignee || runningCard.agentId)?.name ?? 'the worker') } : null} onAskLead={onAskLead} onChanged={() => { task.reloadChannel(); onChanged() }} onOpenAgency={onOpenAgency} />}
          {task.streaming && (
            <div className="flex items-start gap-3">
              <span className="flex-none"><Avatar shape={agent.shape} tone={agent.tone} head={agent.head} size={32} /></span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-[13px]"><strong className="font-semibold">{firstName(agent.name)}</strong><span className="text-muted-foreground"> · now</span></span>
                <Markdown className={MD} text={task.streaming} />
              </div>
            </div>
          )}
          {task.streaming !== null && task.activity.length > 0 && (
            <ul className="flex flex-col gap-1 pl-11" aria-label="Tool calls">
              {task.activity.map((a) => (
                <li key={a.id} className={cn('flex items-center gap-2 text-xs', a.isError ? 'text-destructive' : 'text-muted-foreground')}>
                  <Icon name={a.isError ? 'warning' : a.done ? 'check' : 'file'} size={12} /><span className="font-mono">{activityLabel(a)}</span>
                </li>
              ))}
            </ul>
          )}
          {runsWithChanges.map((runId) => {
            const list = task.changes.filter((c) => c.runId === runId)
            const open = list.filter((c) => c.status === 'pending').length
            return (
              <div key={runId} className="flex items-start gap-3">
                <span className="flex-none"><Avatar shape={agent.shape} tone={agent.tone} head={agent.head} size={32} /></span>
                <Card className={cn('max-w-[560px] min-w-0 flex-1 gap-2.5 px-4 py-3.5', open && 'border-green')}>
                  {open > 0 && <span className="flex items-center gap-2 text-[13px]"><Badge variant="lime">Review</Badge></span>}
                  <span className="flex flex-col gap-0.5">
                    <strong className="text-sm font-semibold">{list.length} file{list.length === 1 ? '' : 's'} changed</strong>
                    <span className="text-[13px] text-muted-foreground">{open ? `${firstName(agent.name)} is waiting for your review` : 'Reviewed'}</span>
                  </span>
                  <span><Button variant={open ? 'lime' : 'outline'} size="sm" className={cn('min-h-9', open && 'font-semibold')} onClick={() => onReview(list, { agent, card: null, message: null, sessionId })}>{open ? 'Review the changes' : 'See the changes'}</Button></span>
                </Card>
              </div>
            )
          })}
          {suggestedTool && suggestion && !toolSetup && (
            <ToolSuggestCard tool={suggestedTool} agent={suggestion.agent} reason={suggestion.reason}
              onAdd={(whole) => onToolSetup({ tool: suggestedTool, agentIds: whole || !suggestion.agent || suggestion.agent.engine === 'builtin' ? team.filter((a) => a.engine !== 'builtin').map((a) => a.id) : [suggestion.agent.id] })}
              onDismiss={() => dismiss(suggestedTool.id)} />
          )}
          {skillSuggestion && !toolSetup && <SkillSuggestCard key={'skill:' + skillSuggestion.skill.name} skill={skillSuggestion.skill} agent={skillSuggestion.agent} reason={skillSuggestion.reason} team={team} onAdded={onAgentsChanged} onDismiss={() => dismiss('skill:' + skillSuggestion.skill.name)} />}
          {toolSetup && <ToolSetupCard key={toolSetup.tool.id} tool={toolSetup.tool} team={team} initialAgentIds={toolSetup.agentIds} onConnected={onToolConnected} onCancel={() => onToolSetup(null)} />}
          {task.permissions.map((p) => <PermissionCard key={p.id} p={p} agent={agent} onAnswer={task.answerPermission} />)}
          {workerPermissions.map(({ p, a }) => <PermissionCard key={p.id} p={p} agent={a} onAnswer={task.answerPermission} />)}
          {task.streaming !== null && !task.waiting && (
            <div className="flex items-center gap-2 pl-11 text-[13px] text-muted-foreground" role="status">
              <span className="inline-flex gap-[3px]" aria-hidden="true">{[0, 150, 300].map((d) => <i key={d} className="size-[5px] animate-dot rounded-full bg-green motion-reduce:animate-none motion-reduce:opacity-60" style={{ animationDelay: `${d}ms` }} />)}</span>
              {firstName(agent.name)} is working…
            </div>
          )}
          {task.stoppedAt && task.streaming === null && <p className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">Stopped by you · {clock(task.stoppedAt)}</p>}
          {task.error && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive-soft px-3.5 py-2.5 text-sm text-destructive" role="alert">
              {task.error}{' '}
              {/key/i.test(task.error) && <Button variant="outline" size="sm" onClick={onSettings}>Open Settings</Button>}
            </div>
          )}
        </div>
      </div>
      {needs.length > 0 && !atBottom && (
        <Button variant="lime" size="sm" className="absolute top-3 left-1/2 h-8 -translate-x-1/2 font-mono text-xs font-semibold shadow-md"
          onClick={() => document.getElementById(`cm-${needs[0].id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}>
          Needs you · {needs.length} · jump
        </Button>
      )}
      {!atBottom && (
        <Button variant="outline" size="sm" className="absolute right-6 bottom-3 h-8 shadow-md" onClick={() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }); setAtBottom(true) }}>
          <Icon name="arrowDown" size={12} /> Latest
        </Button>
      )}
    </div>
  )
}

const startOf = (c: KanbanCard): number | null => [...(c.log ?? [])].reverse().find((l) => /^Started with /.test(l.text))?.at ?? null
