import type { AgencyView } from '../agencies'
import { ScheduleList } from '../agency/ScheduleTab'

/** Every scheduled task across agencies: on or off, run now, edit, delete, and a form to add one. */
export function ScheduledPage({ agencies, onOpenTask }: { agencies: AgencyView[]; onOpenTask: (sessionId: string, agentId: string) => void }): JSX.Element {
  return (
    <div className="flex w-full max-w-[1100px] flex-col gap-5 px-10 pt-7 pb-12">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-semibold tracking-tight">Scheduled</h1>
        <p className="text-sm text-muted-foreground">Tasks that run on their own while the app is open. Each run becomes a task you can open.</p>
      </div>
      <ScheduleList agencies={agencies} onOpenTask={onOpenTask} />
    </div>
  )
}
