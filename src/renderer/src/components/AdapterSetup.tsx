import { useCallback, useEffect, useState } from 'react'
import type { AccountEngine, AccountStatus, EngineId, EngineModels, EngineStatus, ExternalEngineId } from '@shared/types'
import { ENGINE_NAMES } from '@shared/engines'
import { refreshStatuses } from '../agentStatus'
import { InstallDialog } from '../settings/InstallDialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const HINT = 'text-xs leading-normal text-muted-foreground'
const OWN = '__none'
const ACCOUNT_NAME: Record<AccountEngine, string> = { 'claude-code': 'Claude', codex: 'ChatGPT', 'gemini-cli': 'Google' }
const isAccountEngine = (id: string): id is AccountEngine => id === 'claude-code' || id === 'codex' || id === 'gemini-cli'

/** Install state and sign-in state of the adapters, plus the one dialog that installs or signs in. */
export function useAdapters(): {
  engines: EngineStatus[]
  accounts: AccountStatus[]
  reload: () => void
  /** Opens the install (or sign-in) dialog for one adapter. */
  open: (id: ExternalEngineId, start?: 'install' | 'signin') => void
  /** Render this once; it is the dialog, or null. */
  dialog: JSX.Element | null
} {
  const [engines, setEngines] = useState<EngineStatus[]>([])
  const [accounts, setAccounts] = useState<AccountStatus[]>([])
  const [target, setTarget] = useState<{ id: ExternalEngineId; start: 'install' | 'signin' } | null>(null)
  const reload = useCallback((): void => {
    void window.tyslin.engines.list().then(setEngines).catch(() => undefined)
    void window.tyslin.accounts.status().then(setAccounts).catch(() => undefined)
    refreshStatuses()
  }, [])
  useEffect(reload, [reload])
  const engine = target ? engines.find((e) => e.id === target.id) : undefined
  const dialog = target && engine
    ? <InstallDialog engine={engine} account={accounts.find((a) => a.engine === engine.id)} start={target.start} onChange={reload} onClose={() => { setTarget(null); reload() }} />
    : null
  return { engines, accounts, reload, open: (id, start = 'install') => setTarget({ id, start }), dialog }
}

/**
 * Under "Runs on" for an adapter: Install when it isn't on this computer, Sign in when it says it needs one,
 * else a Select of the models the adapter itself offers ('' = the adapter's own choice).
 */
export function AdapterModelField({ engine, value, onChange, disabled }: { engine: EngineId; value: string; onChange: (model: string) => void; disabled?: boolean }): JSX.Element | null {
  const { engines, reload, open, dialog } = useAdapters()
  const [models, setModels] = useState<EngineModels | null>(null)
  const status = engines.find((e) => e.id === engine)
  const installed = !!status?.resolvedPath
  useEffect(() => {
    setModels(null)
    if (engine === 'builtin' || !installed) return
    let live = true
    void window.tyslin.engines.models(engine as ExternalEngineId).then((m) => { if (live) setModels(m) }).catch((e: unknown) => { if (live) setModels({ models: [], current: null, error: e instanceof Error ? e.message : String(e) }) })
    return () => { live = false }
  }, [engine, installed, status?.resolvedPath])
  if (engine === 'builtin') return null
  const name = ENGINE_NAMES[engine]
  const id = engine as ExternalEngineId

  let body: JSX.Element
  if (!status) body = <Skeleton className="h-9 w-full" />
  else if (!installed) {
    body = (
      <Alert>
        <AlertTitle>{name} is not installed</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>This agent can't work until {name} is on this computer.</span>
          {status.install
            ? <Button type="button" size="sm" onClick={() => open(id)}>Install {name}</Button>
            : <span>Install it from its own guide, then come back.</span>}
        </AlertDescription>
      </Alert>
    )
  } else if (!models) body = <><Skeleton className="h-9 w-full" /><span className={HINT}>Asking {name} for its models…</span></>
  else if (models.error) {
    body = (
      <Alert>
        <AlertTitle>{models.needsSignIn ? `${name} needs a sign-in` : `Couldn't read ${name}'s models`}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>{models.needsSignIn ? `Sign in with your ${isAccountEngine(engine) ? ACCOUNT_NAME[engine] : name} account, or add its key in Settings → Models.` : models.error}</span>
          <span className="flex flex-wrap gap-2">
            {models.needsSignIn && isAccountEngine(engine) && <Button type="button" size="sm" onClick={() => open(id, 'signin')}>Sign in</Button>}
            <Button type="button" size="sm" variant="outline" onClick={reload}>Check again</Button>
          </span>
        </AlertDescription>
      </Alert>
    )
  } else if (!models.models.length) body = <span className={HINT}>{name} picks its own model and doesn't offer a choice here.</span>
  else {
    const want = value.trim().toLowerCase()
    const hit = models.models.find((m) => m.id === value) ?? models.models.find((m) => m.id.toLowerCase() === want || m.name.toLowerCase() === want)
    const own = models.models.find((m) => m.id === models.current)
    body = (
      <>
        <Label htmlFor="adapter-model" className="text-[13px]">Model</Label>
        <Select value={hit?.id ?? OWN} onValueChange={(v) => onChange(v === OWN ? '' : v)} disabled={disabled}>
          <SelectTrigger id="adapter-model" className="w-full bg-card"><SelectValue /></SelectTrigger>
          <SelectContent position="popper" className="max-h-[min(360px,var(--radix-select-content-available-height))]">
            <SelectItem value={OWN}>{name}'s own choice{own ? ` (${own.name})` : ''}</SelectItem>
            {models.models.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} <span className="font-mono text-xs text-muted-foreground">{m.id}</span></SelectItem>)}
          </SelectContent>
        </Select>
        <span className={HINT}>These are the models {name} offers with your key or account.</span>
      </>
    )
  }
  return <div className="flex flex-col gap-2">{body}{dialog}</div>
}
