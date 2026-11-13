import { useState } from 'react'
import type { Agent, ExternalEngineId } from '@shared/types'
import { KeysDialog } from './RunProblem'
import { useAgentStatuses } from '../agentStatus'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { useAdapters } from '../components/AdapterSetup'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'

/**
 * Above the composer when someone on the team can't work yet: one row per agent with what is missing and the
 * button that fixes it (install the adapter here, add a model key, or pick another adapter or model).
 */
export function SetupCard({ team, onOpenAgent }: { team: Agent[]; onOpenAgent: (a: Agent) => void }): JSX.Element | null {
  const statuses = useAgentStatuses()
  const { engines, open, dialog } = useAdapters()
  const [keys, setKeys] = useState(false)
  const stuck = team.filter((a) => statuses.get(a.id)?.state === 'setup')
  if (!stuck.length) return <>{dialog}{keys && <KeysDialog onClose={() => setKeys(false)} />}</>
  return (
    <Card className="gap-1 px-4 py-3" role="status" aria-label="Setup needed">
      <span className="text-[13.5px] font-semibold">{stuck.length === 1 ? `${firstName(stuck[0].name)} can't work yet` : `${stuck.length} agents can't work yet`}</span>
      <span className="text-xs text-muted-foreground">Set them up here, or give them another adapter or model.</span>
      <div className="mt-1 flex flex-col">
        {stuck.map((a) => {
          const engine = a.engine === 'builtin' ? undefined : engines.find((e) => e.id === a.engine)
          const canInstall = !!engine && !engine.resolvedPath && !!engine.install
          return (
            <Item key={a.id} size="sm" className="px-0">
              <ItemMedia><Avatar shape={a.shape} tone={a.tone} head={a.head ?? null} size={28} /></ItemMedia>
              <ItemContent>
                <ItemTitle>{firstName(a.name)}</ItemTitle>
                <ItemDescription>{statuses.get(a.id)?.reason}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button variant="ghost" size="sm" onClick={() => onOpenAgent(a)}>Change</Button>
                {canInstall
                  ? <Button size="sm" onClick={() => open(a.engine as ExternalEngineId)}>Install {engine.name}</Button>
                  : a.engine === 'builtin' && <Button size="sm" onClick={() => setKeys(true)}>Add a key</Button>}
              </ItemActions>
            </Item>
          )
        })}
      </div>
      {dialog}
      {keys && <KeysDialog onClose={() => setKeys(false)} />}
    </Card>
  )
}
