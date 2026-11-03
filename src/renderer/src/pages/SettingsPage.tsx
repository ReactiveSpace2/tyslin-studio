import { useEffect, useState } from 'react'
import type { AppInfo, KeyProvider, Preferences, ProviderSettings, UpdateStatus, WriteMode } from '@shared/types'
import stacked from '../assets/logo-stacked.png'

type Tab = 'models' | 'agents' | 'about'

const TABS: [Tab, string][] = [['models', 'Models'], ['agents', 'Agents'], ['about', 'About & updates']]

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
          <span role="status">{update ? (update.state === 'error' ? `${UPDATE_TEXT.error} ${update.error ?? ''}` : UPDATE_TEXT[update.state]) : '…'}
            {update?.version && update.state !== 'none' && <span className="mono"> v{update.version}</span>}</span>
        </div>
        <div className="row">
          <button type="button" className="btn" disabled={update?.state === 'checking'} onClick={() => void window.tyslin.updates.check().then(setUpdate)}>Check now</button>
          {update?.state === 'ready' && <button type="button" className="btn btn-lime" onClick={() => void window.tyslin.updates.install()}>Restart to update</button>}
          {update?.state === 'available' && <button type="button" className="btn btn-lime" onClick={() => void window.tyslin.updates.openDownload()}>Download</button>}
        </div>
      </section>
      <section className="box" aria-labelledby="data-h">
        <div className="box-head">
          <h2 id="data-h">Your data</h2>
          <p className="hint">Agents, chats, projects and skills live in one local database. Tyslin sends nothing anywhere except your messages to the model providers you set up.</p>
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
        <span className="hint">Every agent you run. One studio. · <a href="https://tyslin.ai" target="_blank" rel="noreferrer">tyslin.ai</a> · <a href="https://github.com/Umar-Abbas/tyslin-studio/issues" target="_blank" rel="noreferrer">Report an issue</a></span>
      </section>
    </>
  )
}

export function SettingsPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('models')

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
        {tab === 'about' && <AboutTab />}
      </div>
    </div>
  )
}
