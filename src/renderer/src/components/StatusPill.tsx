import type { AgentStatus } from '@shared/types'
import { STATUS_LABEL } from '../agentStatus'
import { WorkingDots } from './Working'

/** Agent status with its reason on hover; never colour alone (label always shown). */
export function StatusPill({ status }: { status?: AgentStatus }): JSX.Element | null {
  if (!status) return null
  return (
    <span className={'status-pill ' + status.state} title={status.reason}>
      {STATUS_LABEL[status.state]}
      {status.state === 'working' && <WorkingDots />}
    </span>
  )
}
