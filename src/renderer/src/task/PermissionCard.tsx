import type { Agent } from '@shared/types'
import { ENGINE_NAMES } from '@shared/engines'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import type { Permission } from './useTask'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** An external agent asking before it runs something; the buttons are the adapter's own choices. */
export function PermissionCard({ p, agent, onAnswer }: { p: Permission; agent: Agent | null; onAnswer: (p: Permission, choiceId: string | null) => void }): JSX.Element {
  const engine = agent && agent.engine !== 'builtin' ? ENGINE_NAMES[agent.engine] : null
  return (
    <div className="flex items-start gap-3">
      {agent && <span className="flex-none"><Avatar shape={agent.shape} tone={agent.tone} head={agent.head} size={32} /></span>}
      <Card className="max-w-[560px] min-w-0 flex-1 gap-2.5 border-green px-4 py-3.5" role="group" aria-label="Permission request">
        <span className="flex items-start gap-2">
          <span className="mt-0.5 flex-none text-green"><Icon name="warning" size={16} /></span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <strong className="text-sm font-semibold break-words">{p.title}</strong>
            <span className="text-[13px] text-muted-foreground">{agent?.name ?? 'The agent'} is asking before it goes ahead</span>
          </span>
        </span>
        <span className="flex flex-wrap gap-2">
          {p.choices.map((c) => (
            <Button key={c.id} variant={c.kind.startsWith('allow') ? 'lime' : 'outline'} size="sm" className={cn('min-h-9', c.kind.startsWith('allow') && 'font-semibold')} onClick={() => onAnswer(p, c.id)}>{c.name}</Button>
          ))}
          {p.choices.length === 0 && <Button variant="outline" size="sm" className="min-h-9" onClick={() => onAnswer(p, null)}>Decline</Button>}
        </span>
        {engine && <span className="text-xs text-muted-foreground">These choices come from {engine} itself.</span>}
      </Card>
    </div>
  )
}
