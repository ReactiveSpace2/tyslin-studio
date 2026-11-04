import { useEffect, useRef, useState } from 'react'
import type { AppInfo, AuthStatus, EngineStatus, EngineTestResult, KeyProvider, Preferences, ProviderSettings, UpdateStatus, WriteMode } from '@shared/types'
import stacked from '../assets/logo-stacked.png'
import { AccountBox } from '../components/AccountBox'

export type SettingsTab = 'models' | 'engines' | 'agents' | 'account' | 'about'
type Tab = SettingsTab

const TABS: [Tab, string][] = [['models', 'Models'], ['engines', 'Agent engines'], ['agents', 'Agents'], ['account', 'Account'], ['about', 'About & updates']]

const KEY_FIELDS: [KeyProvider, string, string, keyof ProviderSettings][] = [
  ['anthropic', 'Anthropic (Claude)', 'sk-ant-…', 'anthropicKeySet'],
  ['openai', 'OpenAI', 'sk-…', 'openaiKeySet'],
  ['gemini', 'Google Gemini', 'From Google AI Studio', 'geminiKeySet']
]

const UPDATE_TEXT: Record<UpdateStatus['state'], string> = {
  idle: 'Update checks run in installed builds only.',
  checking: 'Checking…',
  none: 'You have the latest version.',
  available: 'A new version is ready to download.',
  downloading: 'Downloading the update…',
  ready: 'Update downloaded. Restart to install it.',
  error: 'Could not check for updates.'
}

function useFlash(): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  return [msg, (m) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2500)
  }]
}

function ModelsTab(): JSX.Element {
  const [s, setS] = useState<ProviderSettings | null>(null)
  const [keys, setKeys] = useState<Record<KeyProvider, string>>({ anthropic: '', openai: '', gemini: '' })
  const [ollama, setOllama] = useState('')
  const [saved, flash] = useFlash()

  const load = async (): Promise<void> => {
    const v = await window.tyslin.settings.get()
    setS(v)
    setOllama(v.ollamaUrl)
  }
  useEffect(() => { void load() }, [])

  return (
    <>
      <section className="box" aria-labelledby="keys-h">
        <div className="box-head">
          <h2 id="keys-h">API keys</h2>
          <p className="hint">Encrypted with your system keychain. A key only ever goes to its own provider.</p>
        </div>
        {KEY_FIELDS.map(([id, label, placeholder, flag]) => (
          <div className="field" key={id}>
            <label htmlFor={'k-' + id}>{label}</label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id={'k-' + id} type="password" className="input mono" placeholder={s?.[flag] ? '•••••••• saved' : placeholder}
                value={keys[id]} onChange={(e) => setKeys((k) => ({ ...k, [id]: e.target.value }))} />
              <button type="button" className="btn btn-primary" disabled={!keys[id]} onClick={async () => {
                await window.tyslin.settings.setKey(id, keys[id])
                setKeys((k) => ({ ...k, [id]: '' }))
                await load()
                flash(`${label} key saved`)
              }}>Save</button>
            </div>
          </div>
        ))}
      </section>
      <section className="box" aria-labelledby="local-h">
        <div className="box-head">
          <h2 id="local-h">Local models</h2>
          <p className="hint">Run models on this computer with Ollama. Nothing leaves your machine.</p>
        </div>
        <div className="field">
          <label htmlFor="k-ollama">Ollama URL</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="k-ollama" className="input mono" value={ollama} onChange={(e) => setOllama(e.target.value)} />
            <button type="button" className="btn" onClick={async () => { await window.tyslin.settings.setOllamaUrl(ollama); flash('Ollama URL saved') }}>Save</button>
          </div>
        </div>
      </section>
      {saved && <span className="ok" role="status">{saved}</span>}
    </>
  )
}

function AgentsTab(): JSX.Element {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [draft, setDraft] = useState('')
  const [saved, flash] = useFlash()

  useEffect(() => {
    void window.tyslin.settings.prefs().then((p) => { setPrefs(p); setDraft(p.sharedInstructions) })
  }, [])
  if (!prefs) return <></>

  const save = async (p: Partial<Preferences>, msg: string): Promise<void> => {
    const next = await window.tyslin.settings.setPrefs(p)
    setPrefs(next)
    setDraft(next.sharedInstructions)
    flash(msg)
  }

  return (
    <>
      <section className="box" aria-labelledby="writes-h">
        <div className="box-head">
          <h2 id="writes-h">File changes for new agents</h2>
          <p className="hint">The starting choice when you build an agent. Each agent can still change it in its editor.</p>
        </div>
        <div className="choices" role="radiogroup" aria-labelledby="writes-h">
          {([
            ['ask', 'Ask before writing files', 'Review a diff, accept or reject each change.'],
            ['direct', 'Write directly', 'Changes go straight to disk.']
          ] as [WriteMode, string, string][]).map(([mode, title, hint]) => (
            <label key={mode} className={'choice' + (prefs.defaultWriteMode === mode ? ' on' : '')}>
              <input type="radio" name="default-write" value={mode} checked={prefs.defaultWriteMode === mode}
                onChange={() => void save({ defaultWriteMode: mode }, 'Default saved')} />
              <span><strong>{title}</strong><span className="hint">{hint}</span></span>
            </label>
          ))}
        </div>
      </section>
      <section className="box" aria-labelledby="shared-h">
        <div className="box-head">
          <h2 id="shared-h">Guidelines for every agent</h2>
          <p className="hint">Added to each agent's own instructions. Use it for house rules: tone, format, things to always or never do.</p>
        </div>
        <div className="field">
          <label htmlFor="shared-ins">Guidelines</label>
          <textarea id="shared-ins" className="textarea" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={'e.g.\nUse British English.\nKeep replies under 200 words unless asked for more.\nNever invent numbers; say when you are unsure.'} />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" disabled={!draft && !prefs.sharedInstructions} onClick={() => void save({ sharedInstructions: '' }, 'Guidelines cleared')}>Clear</button>
          <button type="button" className="btn btn-primary" disabled={draft.trim() === prefs.sharedInstructions} onClick={() => void save({ sharedInstructions: draft }, 'Guidelines saved')}>Save guidelines</button>
        </div>
      </section>
      {saved && <span className="ok" role="status">{saved}</span>}
    </>
  )
}

function EngineCard({ engine, onChange }: { engine: EngineStatus; onChange: (e: EngineStatus) => void }): JSX.Element {
  const [command, setCommand] = useState(engine.command)
  const [test, setTest] = useState<EngineTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  // Install flow: closed → confirm (shows the exact command) → running → done
  const [install, setInstall] = useState<'closed' | 'confirm' | 'running' | 'done'>('closed')
  const [log, setLog] = useState('')
  const [installError, setInstallError] = useState<string | null>(null)
  const logRef = useRef<HTMLPreElement>(null)
  const id = 'eng-' + engine.id

  useEffect(() => window.tyslin.engines.onInstallOutput((o) => {
    if (o.id === engine.id) setLog((l) => (l + o.text).slice(-60_000))
  }), [engine.id])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [log])

  const runInstall = async (): Promise<void> => {
    setLog('')
    setInstallError(null)
    setInstall('running')
    const r = await window.tyslin.engines.install(engine.id)
    onChange(r.status)
    if (!r.ok) setInstallError(r.error ?? 'The install failed.')
    else if (!r.status.resolvedPath) setInstallError(`The installer finished, but Tyslin can't find ${engine.name} yet. Restart Tyslin, or set its full path in the Command field below.`)
    setInstall('done')
  }

  const save = async (): Promise<void> => {
    onChange(await window.tyslin.engines.setCommand(engine.id, command))
    setTest(null)
  }
  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTest(await window.tyslin.engines.test(engine.id))
    setTesting(false)
  }

  return (
    <section className="box" aria-labelledby={id + '-h'}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="box-head">
          <h2 id={id + '-h'}>{engine.name}</h2>
          <p className="hint">{engine.description} {engine.note}</p>
        </div>
        <span className={'badge' + (engine.resolvedPath ? ' green' : '')}>{engine.resolvedPath ? 'Installed' : engine.id === 'custom' && !engine.command ? 'Not set up' : 'Not installed'}</span>
      </div>
      {engine.resolvedPath && <span className="mono path-inline">{engine.resolvedPath}</span>}
      {engine.install && !engine.resolvedPath && install === 'closed' && (
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => setInstall('confirm')}>Install {engine.name}</button>
          <span className="hint">Runs the official installer from {engine.install.source}.</span>
        </div>
      )}
      {engine.install && install === 'confirm' && (
        <div className="install-confirm" role="group" aria-label={`Install ${engine.name}`}>
          <strong>This will run on your computer:</strong>
          <pre className="install-cmd">{engine.install.command}</pre>
          <span className="hint">
            It downloads {engine.name}'s official installer from {engine.install.source} and runs it with your user account.
            Tyslin doesn't check what the installer does; read the setup guide first if you're unsure.
          </span>
          <div className="row">
            <button type="button" className="btn" onClick={() => setInstall('closed')}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => void runInstall()}>Install</button>
          </div>
        </div>
      )}
      {(install === 'running' || install === 'done') && (
        <div className="install-confirm">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong role="status">{install === 'running' ? `Installing ${engine.name}…` : installError ? 'Install did not finish' : `${engine.name} is installed`}</strong>
            {install === 'running'
              ? <button type="button" className="btn btn-sm" onClick={() => void window.tyslin.engines.cancelInstall(engine.id)}>Stop</button>
              : <button type="button" className="btn btn-sm" onClick={() => setInstall('closed')}>Close</button>}
          </div>
          <pre className="install-log" ref={logRef} aria-label="Installer output" tabIndex={0}>{log || 'Starting…'}</pre>
          {install === 'done' && installError && <div className="msg-error" role="alert">{installError}</div>}
          {install === 'done' && !installError && engine.install && <span className="ok">Next: {engine.install.nextStep}</span>}
        </div>
      )}
      <div className="field">
        <label htmlFor={id}>Command</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input id={id} className="input mono" value={command} onChange={(e) => setCommand(e.target.value)}
            placeholder={engine.defaultCommand || 'my-agent --acp'} />
          <button type="button" className="btn" disabled={command.trim() === engine.command} onClick={() => void save()}>Save</button>
        </div>
        <span className="hint">{engine.defaultCommand ? `Leave empty to use "${engine.defaultCommand}". Use a full path if Tyslin can't find it.` : 'The program and its arguments.'}</span>
      </div>
      <div className="row">
        <button type="button" className="btn" disabled={testing || !engine.resolvedPath} onClick={() => void runTest()}>{testing ? 'Testing…' : 'Test connection'}</button>
        <a href={engine.docsUrl} target="_blank" rel="noreferrer">Install and setup guide</a>
      </div>
      {test && (test.ok
        ? <span className="ok" role="status">Connected to {test.agent ?? engine.name} over ACP v{test.protocolVersion}.{test.authMethods?.length ? ` It may ask you to sign in (${test.authMethods.join(', ')}).` : ''}</span>
        : <div className="msg-error" role="alert" style={{ whiteSpace: 'pre-wrap' }}>{test.error}</div>)}
    </section>
  )
}

function EnginesTab(): JSX.Element {
  const [engines, setEngines] = useState<EngineStatus[]>([])
  useEffect(() => { void window.tyslin.engines.list().then(setEngines) }, [])
  const replace = (e: EngineStatus): void => setEngines((list) => list.map((x) => (x.id === e.id ? e : x)))

  return (
    <>
      <p className="hint" style={{ margin: 0 }}>
        Run any agent below with an external agent instead of Tyslin's built-in models: pick it under "Runs on" in the agent's editor.
        Tyslin talks to them over the Agent Client Protocol (ACP). Install them yourself; Tyslin starts them when needed and stops them after each reply.
      </p>
      {engines.map((e) => <EngineCard key={e.id} engine={e} onChange={replace} />)}
    </>
  )
}

function AccountTab({ onAuthChange }: { onAuthChange?: (s: AuthStatus) => void }): JSX.Element {
  return (
    <section className="box" aria-labelledby="account-h">
      <div className="box-head">
        <h2 id="account-h">Google account</h2>
        <p className="hint">Your agents, chats and keys stay on this computer. Tyslin keeps only your name and email, and no Google tokens.</p>
      </div>
      <AccountBox onChange={onAuthChange} />
    </section>
  )
}

function AboutTab(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    void window.tyslin.app.info().then(setInfo)
    void window.tyslin.updates.status().then(setUpdate)
    return window.tyslin.updates.onStatus(setUpdate)
  }, [])

  return (
    <>
      <section className="box" aria-labelledby="upd-h">
        <div className="box-head">
          <h2 id="upd-h">Updates</h2>
          <p className="hint">Tyslin Studio checks GitHub Releases when it starts and every few hours.</p>
        </div>
        <div className="kv">
          <span>Installed</span><span className="mono">v{info?.version ?? '…'}</span>
          <span>Status</span>
          <span role="status">{update?.managedBy === 'snap' ? 'Updates install automatically from the Snap Store.' : update ? (update.state === 'error' ? `${UPDATE_TEXT.error} ${update.error ?? ''}` : UPDATE_TEXT[update.state]) : '…'}
            {update?.version && update.state !== 'none' && <span className="mono"> v{update.version}</span>}</span>
        </div>
        <div className="row">
          {update?.managedBy !== 'snap' && <button type="button" className="btn" disabled={update?.state === 'checking'} onClick={() => void window.tyslin.updates.check().then(setUpdate)}>Check now</button>}
          {update?.state === 'ready' && <button type="button" className="btn btn-lime" onClick={() => void window.tyslin.updates.install()}>Restart to update</button>}
          {update?.state === 'available' && <button type="button" className="btn btn-lime" onClick={() => void window.tyslin.updates.openDownload()}>Download</button>}
        </div>
      </section>
      <section className="box" aria-labelledby="data-h">
        <div className="box-head">
          <h2 id="data-h">Your data</h2>
          <p className="hint">Agents, chats, projects and skills live in one local database. Tyslin sends nothing anywhere except your messages to the model providers you set up, and Google when you choose to sign in.</p>
        </div>
        <div className="kv">
          <span>Location</span><span className="mono path-inline">{info?.dataPath ?? '…'}</span>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => void window.tyslin.app.openDataFolder()}>Open folder</button>
        </div>
      </section>
      <section className="box about" aria-label="About">
        <img src={stacked} alt="Tyslin" />
        <div className="kv">
          <span>Version</span><span className="mono">{info?.version ?? '…'}</span>
          <span>Electron</span><span className="mono">{info?.electron ?? '…'}</span>
          <span>Platform</span><span className="mono">{info?.platform ?? '…'}</span>
        </div>
        <span className="hint">Every agent you run. One studio. · <a href="https://tyslin.ai" target="_blank" rel="noreferrer">tyslin.ai</a> · <a href="https://github.com/ReactiveSpace2/tyslin-studio/issues" target="_blank" rel="noreferrer">Report an issue</a></span>
      </section>
    </>
  )
}

export function SettingsPage({ initialTab = 'models', onAuthChange }: { initialTab?: SettingsTab; onAuthChange?: (s: AuthStatus) => void }): JSX.Element {
  const [tab, setTab] = useState<Tab>(initialTab)

  return (
    <div className="page">
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="eyebrow">Settings</span>
        <h1>Your studio</h1>
      </header>
      <div className="tabs" role="tablist" aria-label="Settings sections">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={'tab-' + id} aria-selected={tab === id} aria-controls="settings-panel"
            className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="settings" role="tabpanel" id="settings-panel" aria-labelledby={'tab-' + tab}>
        {tab === 'models' && <ModelsTab />}
        {tab === 'agents' && <AgentsTab />}
        {tab === 'engines' && <EnginesTab />}
        {tab === 'account' && <AccountTab onAuthChange={onAuthChange} />}
        {tab === 'about' && <AboutTab />}
      </div>
    </div>
  )
}
