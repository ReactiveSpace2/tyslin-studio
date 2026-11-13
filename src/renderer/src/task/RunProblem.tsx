import { useEffect, useState } from 'react'
import type { Agent, ExternalEngineId, ProviderSettings } from '@shared/types'
import { ENGINE_NAMES } from '@shared/engines'
import { refreshStatuses } from '../agentStatus'
import { firstName } from '../boardStats'
import { useAdapters } from '../components/AdapterSetup'
import { ModelKeys } from '../components/ModelSetup'
import { refreshDefaultModel } from '../defaultModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Fix = 'install' | 'signin' | 'key' | null

/** What would fix a failed run, read from its error text; null when nothing here can. */
export function fixFor(error: string, agent: Agent | null | undefined): Fix {
  const adapter = !!agent && agent.engine !== 'builtin'
  if (adapter && /isn't installed|is not installed|can't find "/i.test(error)) return 'install'
  if (adapter && /sign in first|Authentication required|logged out|Failed to authenticate/i.test(error)) return 'signin'
  if (/\bkey\b/i.test(error)) return 'key'
  return null
}

/** Model keys in a dialog, so a missing or refused key is fixed without leaving the task. */
export function KeysDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [settings, setSettings] = useState<ProviderSettings | null>(null)
  const [note, setNote] = useState('')
  const load = async (): Promise<void> => { setSettings(await window.tyslin.settings.get()); void refreshDefaultModel(); refreshStatuses() }
  useEffect(() => { void load().catch(() => undefined) }, [])
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100%-48px)] w-[720px] max-w-[calc(100%-32px)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[calc(100%-32px)]">
        <DialogHeader className="px-6 pt-6 pb-2 text-left">
          <DialogTitle className="text-xl">Model keys</DialogTitle>
          <DialogDescription>Add or replace a key, or sign in with your own account. Keys stay on this computer.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
          <ModelKeys settings={settings} onSaved={async (msg) => { await load(); setNote(msg) }} />
          {note && <p className="text-[13px] text-muted-foreground" role="status">{note}</p>}
        </div>
        <DialogFooter className="border-t border-border px-6 py-4"><Button onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The buttons that fix a failed run right in the task: install the adapter, sign in, add a key, or change the agent. */
export function RunFix({ error, agent, onOpenAgent }: { error: string; agent: Agent | null | undefined; onOpenAgent?: (a: Agent) => void }): JSX.Element | null {
  const { engines, open, dialog } = useAdapters()
  const [keys, setKeys] = useState(false)
  const fix = fixFor(error, agent)
  if (!fix || !agent) return null
  const name = agent.engine === 'builtin' ? '' : ENGINE_NAMES[agent.engine]
  const canInstall = fix === 'install' && !!engines.find((e) => e.id === agent.engine)?.install
  return (
    <span className="flex flex-wrap items-center gap-2">
      {canInstall && <Button variant="outline" size="sm" onClick={() => open(agent.engine as ExternalEngineId)}>Install {name}</Button>}
      {fix === 'signin' && <Button variant="outline" size="sm" onClick={() => open(agent.engine as ExternalEngineId, 'signin')}>Sign in to {name}</Button>}
      {(fix === 'key' || fix === 'signin') && <Button variant="outline" size="sm" onClick={() => setKeys(true)}>{fix === 'key' ? 'Add or replace a key' : 'Use a key instead'}</Button>}
      {onOpenAgent && <Button variant="ghost" size="sm" onClick={() => onOpenAgent(agent)}>Change what {firstName(agent.name)} runs on</Button>}
      {dialog}
      {keys && <KeysDialog onClose={() => setKeys(false)} />}
    </span>
  )
}
