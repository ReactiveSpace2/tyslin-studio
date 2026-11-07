import type { AgentStatus } from '@shared/types'
import { STATUS_LABEL } from '../agentStatus'
import { cn } from '@/lib/utils'
import { WorkingDots } from './Working'

const STATE: Record<AgentStatus['state'], string> = {
  ready: 'border-green text-green',
  working: 'border-green bg-lime-soft text-foreground',
  setup: 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  failed: 'border-destructive bg-destructive-soft text-destructive',
  paused: ''
}

/** Agent status with its reason on hover; never colour alone (label always shown). */
export function StatusPill({ status }: { status?: AgentStatus }): JSX.Element | null {
  if (!status) return null
  return (
    <span className={cn('inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground', STATE[status.state])} title={status.reason}>
      {STATUS_LABEL[status.state]}
      {status.state === 'working' && <WorkingDots />}
    </span>
  )
}
