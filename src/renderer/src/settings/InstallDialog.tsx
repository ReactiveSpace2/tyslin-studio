import { useEffect, useRef, useState } from 'react'
import type { AccountEngine, AccountStatus, EngineStatus, EngineTestResult } from '@shared/types'
import { track } from '../activity'
import { Mark } from '../components/RunsOnBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const HINT = 'text-[13px] leading-relaxed text-muted-foreground'
const ACCOUNT_NAME: Record<AccountEngine, string> = { 'claude-code': 'Claude', codex: 'ChatGPT', 'gemini-cli': 'Google' }
const isAccountEngine = (id: string): id is AccountEngine => id === 'claude-code' || id === 'codex' || id === 'gemini-cli'

type Step = 'confirm' | 'running' | 'failed' | 'done' | 'signing' | 'signed'

interface Props {
  engine: EngineStatus
  account: AccountStatus | undefined
  /** Open on the sign-in step straight away (the adapter is already installed). */
  start?: 'install' | 'signin'
  onChange: (e: EngineStatus, a?: AccountStatus) => void
  onClose: () => void
}

/**
 * Installing an adapter and signing in, in one dialog: the exact command first (nothing runs until Install),
 * the installer's output as it runs, a failure with a path field, a test, then key or account, waiting
 * for the browser, signed in. Sign-in uses the adapter's own login; Tyslin never stores it.
 */
export function InstallDialog({ engine, account, start = 'install', onChange, onClose }: Props): JSX.Element {
  const [step, setStep] = useState<Step>(start === 'signin' ? 'signing' : engine.resolvedPath ? 'done' : 'confirm')
  const [log, setLog] = useState('')
  const [error, setError] = useState('')
  const [path, setPath] = useState(engine.command)
  const [test, setTest] = useState<EngineTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [url, setUrl] = useState('')
  const logRef = useRef<HTMLPreElement>(null)
  const accountEngine = isAccountEngine(engine.id) ? engine.id : null
  useEffect(() => window.tyslin.engines.onInstallOutput((o) => { if (o.id === engine.id) setLog((l) => (l + o.text).slice(-60_000)) }), [engine.id])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [log])
  useEffect(() => window.tyslin.accounts.onSignInUrl((o) => { if (o.engine === engine.id) setUrl(o.url) }), [engine.id])
  useEffect(() => { if (start === 'signin') void signIn() }, [])

  const install = async (): Promise<void> => {
    setLog(''); setError(''); setStep('running')
    const r = await track(`engine:${engine.id}`, `Installing ${engine.name}`, () => window.tyslin.engines.install(engine.id))
    onChange(r.status)
    if (!r.ok) { setError(r.error ?? 'The install failed.'); setStep('failed'); return }
    if (!r.status.resolvedPath) { setError(`The installer finished, but Tyslin can't find ${engine.name} yet. Restart Tyslin, or point it at the program below.`); setStep('failed'); return }
    setStep('done')
  }
  const usePath = async (): Promise<void> => {
    setError('')
    try { const e = await window.tyslin.engines.setCommand(engine.id, path.trim()); onChange(e); if (e.resolvedPath) setStep('done'); else setError(`Still can't find ${engine.name} there.`) } catch (e) { setError(errText(e)) }
  }
  const runTest = async (): Promise<void> => { setTesting(true); try { setTest(await window.tyslin.engines.test(engine.id)) } finally { setTesting(false) } }
  async function signIn(): Promise<void> {
    if (!accountEngine) return
    setError(''); setUrl(''); setStep('signing')
    try {
      const s = await track(`signin:${engine.id}`, `Signing in to ${ACCOUNT_NAME[accountEngine]}`, () => window.tyslin.accounts.signIn(accountEngine))
      onChange(engine, s)
      setStep('signed')
    } catch (err) {
      const msg = errText(err)
      if (!/cancelled/i.test(msg)) setError(msg)
      setStep('done')
    }
  }
  const useKey = async (): Promise<void> => { if (!accountEngine) return; try { onChange(engine, await window.tyslin.accounts.setUseAccount(accountEngine, false)); onClose() } catch (e) { setError(errText(e)) } }

  const title: Record<Step, string> = { confirm: `Install ${engine.name}`, running: `Installing ${engine.name}…`, failed: 'Install failed', done: `${engine.name} is installed`, signing: 'Waiting for your browser…', signed: 'Signed in' }
  const foot: Record<Step, string> = { confirm: "The command is copied from the project's own docs.", running: 'Output streams here as it runs.', failed: 'Nothing else was changed.', done: accountEngine ? `Signing in uses ${engine.name}'s own login.` : '', signing: 'Cancel stops waiting; nothing is saved.', signed: `Sign out from ${engine.name} itself, not here.` }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && step !== 'running') onClose() }}>
      <DialogContent className="flex w-[620px] max-w-[calc(100%-32px)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[calc(100%-32px)]">
        <DialogHeader className="flex-row items-center gap-3 px-6 pt-6 pb-2 text-left"><Mark id={engine.id} size={32} /><div className="flex flex-col"><DialogTitle className="text-xl">{title[step]}</DialogTitle><DialogDescription className="sr-only">Install the adapter and sign in.</DialogDescription></div></DialogHeader>
        <div className="flex min-h-[220px] flex-col gap-3.5 px-6 py-3">
          {step === 'confirm' && engine.install && (
            <>
              <p className="text-[14.5px] leading-relaxed">Tyslin will run this command from {engine.install.source}. Nothing runs until you press Install.</p>
              <pre className="rounded-lg bg-primary px-3.5 py-3 font-mono text-xs break-all whitespace-pre-wrap text-primary-foreground">{engine.install.command}</pre>
              <span className={HINT}>Tyslin doesn't check what the installer does; read the setup guide first if you're unsure. <a href={engine.docsUrl} target="_blank" rel="noreferrer" className="text-green underline-offset-2 hover:underline">Setup guide</a></span>
            </>
          )}
          {step === 'confirm' && !engine.install && (
            <><p className={HINT}>Tyslin can't install {engine.name} on this computer. Install it yourself ({engine.docsUrl}) and point Tyslin at it:</p><div className="flex flex-col gap-1.5"><Label htmlFor="in-path">Command</Label><Input id="in-path" className="font-mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder={engine.defaultCommand || 'my-agent --acp'} /></div></>
          )}
          {(step === 'running' || step === 'failed') && (
            <>
              {step === 'failed' && <Alert variant="destructive" className="border-transparent bg-destructive-soft"><AlertTitle>Install failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
              <pre ref={logRef} tabIndex={0} aria-label="Installer output" className="max-h-[220px] min-h-[120px] overflow-auto rounded-lg bg-primary px-3.5 py-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-primary-foreground">{log || 'Starting…'}</pre>
              {step === 'failed' && <div className="flex flex-col gap-1.5"><Label htmlFor="in-path2">Or point Tyslin at a {engine.name} you already have</Label><Input id="in-path2" className="font-mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder={engine.defaultCommand || '/usr/local/bin/…'} /></div>}
            </>
          )}
          {step === 'done' && (
            <>
              <span className="flex items-center gap-2"><Badge variant="soft">Installed</Badge><span className="font-mono text-xs text-muted-foreground">{engine.resolvedPath}</span></span>
              <div className="flex items-center justify-between gap-3"><span className="text-sm">Test it</span><span className="flex items-center gap-2">{test && (test.ok ? <span className="text-xs text-green">Answered over ACP v{test.protocolVersion}</span> : <span className="text-xs text-destructive">{test.error}</span>)}<Button variant="outline" size="sm" disabled={testing} onClick={() => void runTest()}>{testing ? 'Testing…' : test ? 'Test again' : 'Test'}</Button></span></div>
              {accountEngine && (
                <>
                  <div className="h-px bg-border" />
                  <strong className="text-[14.5px] font-semibold">How should agents on {engine.name} pay?</strong>
                  {account?.signedIn ? <span className="text-sm">Signed in{account.email ? ` as ${account.email}` : ''} · using {account.useAccount ? 'the account' : 'your API key'}.</span> : null}
                  <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => void useKey()}>Use my {ACCOUNT_NAME[accountEngine] === 'Google' ? 'Gemini' : ACCOUNT_NAME[accountEngine] === 'ChatGPT' ? 'OpenAI' : 'Claude'} API key</Button><Button className="flex-1" onClick={() => void signIn()}>Sign in with {ACCOUNT_NAME[accountEngine]}</Button></div>
                </>
              )}
              {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
            </>
          )}
          {step === 'signing' && accountEngine && (
            <>
              <span className="flex items-center gap-2 text-[14.5px]"><span className="size-2 animate-blink rounded-full bg-green" aria-hidden="true" />Waiting for your browser…</span>
              <p className={HINT}>{engine.name} opened {ACCOUNT_NAME[accountEngine]}'s sign-in page. Finish there and come back. Tyslin never sees your password and doesn't store the login; {engine.name} keeps it.</p>
              {url && <a href={url} target="_blank" rel="noreferrer" className="text-[13.5px] text-green underline-offset-2 hover:underline">Didn't open? Open the sign-in page</a>}
            </>
          )}
          {step === 'signed' && accountEngine && (
            <><span className="flex items-center gap-2"><Badge variant="soft">Signed in</Badge><span className="text-xs text-muted-foreground">{account?.email ?? ''}</span></span><p className="text-sm leading-relaxed">Agents on {engine.name} now use your {ACCOUNT_NAME[accountEngine]} account. Leads and the default model still need an API key.</p></>
          )}
        </div>
        <DialogFooter className="justify-between border-t border-border px-6 py-4 sm:justify-between">
          <span className={HINT}>{foot[step]}</span>
          <span className="flex gap-2">
            {step === 'confirm' && <><Button variant="ghost" onClick={onClose}>Not now</Button>{engine.install ? <Button onClick={() => void install()}>Install</Button> : <Button disabled={!path.trim()} onClick={() => void usePath()}>Use this path</Button>}</>}
            {step === 'running' && <Button variant="outline" onClick={() => void window.tyslin.engines.cancelInstall(engine.id)}>Cancel</Button>}
            {step === 'failed' && <><Button variant="outline" onClick={() => void navigator.clipboard.writeText(engine.install?.command ?? '')}>Copy the command</Button><Button disabled={!path.trim()} onClick={() => void usePath()}>Use this path</Button></>}
            {step === 'done' && <Button variant="outline" onClick={onClose}>Done</Button>}
            {step === 'signing' && accountEngine && <Button variant="ghost" onClick={() => { void window.tyslin.accounts.cancelSignIn(accountEngine); setStep('done') }}>Cancel sign-in</Button>}
            {step === 'signed' && <Button onClick={onClose}>Done</Button>}
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
