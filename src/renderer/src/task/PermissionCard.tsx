import { useState } from 'react'
import type { Agent } from '@shared/types'
import { describeCommand, looksLikeCommand } from '@shared/commandSummary'
import { ENGINE_NAMES } from '@shared/engines'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import type { Permission } from './useTask'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** The one lime button: the adapter's "allow once", else its first allow choice (two lime buttons read as equal). */
const primaryId = (p: { choices: { id: string; kind: string }[] }): string | undefined =>
  (p.choices.find((c) => c.kind === 'allow_once') ?? p.choices.find((c) => c.kind.startsWith('allow')))?.id

/** An external agent asking before it runs something; the buttons are the adapter's own choices. */
export function PermissionCard({ p, agent, onAnswer }: { p: Permission; agent: Agent | null; onAnswer: (p: Permission, choiceId: string | null) => void }): JSX.Element {
  // A shell command as the title: say what it is in plain words and fold the command itself (owner, 12 Nov 2026).
  const command = looksLikeCommand(p.title) ? describeCommand(p.title) : null
  const long = p.title.length > 160 || p.title.includes('\n')
  const [open, setOpen] = useState(false)
  const engine = agent && agent.engine !== 'builtin' ? ENGINE_NAMES[agent.engine] : null
  return (
    <div className="flex items-start gap-3">
      {agent && <span className="flex-none"><Avatar shape={agent.shape} tone={agent.tone} head={agent.head} size={32} /></span>}
      <Card className="max-w-[560px] min-w-0 flex-1 gap-2.5 border-green px-4 py-3.5" role="group" aria-label="Permission request">
        <span className="flex items-start gap-2">
          <span className="mt-0.5 flex-none text-green"><Icon name="warning" size={16} /></span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <strong className="text-sm font-semibold break-words">{command ? command.summary : p.title}</strong>
            <span className="text-[13px] text-muted-foreground">{agent?.name ?? 'The agent'} is asking before it goes ahead</span>
          </span>
        </span>
        {command && (
          <div className="flex flex-col gap-1.5">
            {command.notes.length > 0 && <ul className="flex flex-col gap-0.5 text-[13px] text-muted-foreground">{command.notes.map((n) => <li key={n} className="flex items-baseline gap-2"><span className="size-1 flex-none translate-y-[-3px] rounded-full bg-muted-foreground" aria-hidden="true" />{n}</li>)}</ul>}
            <pre className={cn('overflow-x-hidden rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-foreground', long && !open ? 'line-clamp-2' : 'max-h-[280px] overflow-y-auto')} aria-label="The command">{p.title}</pre>
            {long && <Button variant="link" size="sm" className="h-7 self-start px-0.5 text-[13px] underline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Show less' : 'Show the full command'}</Button>}
          </div>
        )}
        <span className="flex flex-wrap gap-2">
          {p.choices.map((c) => (
            <Button key={c.id} variant={c.id === primaryId(p) ? 'lime' : 'outline'} size="sm" className={cn('min-h-9', c.id === primaryId(p) && 'font-semibold')} onClick={() => onAnswer(p, c.id)}>{c.name}</Button>
          ))}
          {p.choices.length === 0 && <Button variant="outline" size="sm" className="min-h-9" onClick={() => onAnswer(p, null)}>Decline</Button>}
        </span>
        {engine && <span className="text-xs text-muted-foreground">These choices come from {engine} itself.</span>}
      </Card>
    </div>
  )
}
