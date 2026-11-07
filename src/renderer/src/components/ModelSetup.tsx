import { useEffect, useMemo, useState } from 'react'
import type { AccountEngine, AccountStatus, EngineStatus, KeyProvider, OpenRouterAccount, OpenRouterModel, ProviderId, ProviderSettings } from '@shared/types'
import { MODEL_SUGGESTIONS, PROVIDER_NAME } from '@shared/models'
import { refreshDefaultModel } from '../defaultModel'
import { Mark } from './RunsOnBadge'
import { track } from '../activity'

/** OpenRouter is hidden for now (owner, 7 Nov 2026). Its sign-in, card and model search stay in the code; set true to show them. */
export const SHOW_OPENROUTER = false

/** Providers with an API key: where to get one, and (for the big three) the adapter that signs in with the user's own account. */
export const KEY_PROVIDERS: {
  id: KeyProvider; label: string; maker: string; line: string; placeholder: string; flag: keyof ProviderSettings; getKey: string
  signIn?: { plan: string; engine: AccountEngine; engineName: string; account: string }
}[] = [
  { id: 'openrouter', label: 'OpenRouter', maker: 'One account, hundreds of models', line: 'Claude, GPT, Gemini, DeepSeek, Llama and more through a single sign-in. Pay as you go on openrouter.ai.', placeholder: 'sk-or-…', flag: 'openrouterKeySet', getKey: 'https://openrouter.ai/keys' },
  { id: 'anthropic', label: 'Claude', maker: 'Anthropic', line: 'Strong at planning, writing and code. Billed per use on your Anthropic account.', placeholder: 'sk-ant-…', flag: 'anthropicKeySet', getKey: 'https://console.anthropic.com/settings/keys', signIn: { plan: 'a Claude Pro or Max plan', engine: 'claude-code', engineName: 'Claude Code', account: 'Claude' } },
  { id: 'openai', label: 'ChatGPT', maker: 'OpenAI', line: 'GPT models for chat, writing and code. Billed per use on your OpenAI platform account.', placeholder: 'sk-…', flag: 'openaiKeySet', getKey: 'https://platform.openai.com/api-keys', signIn: { plan: 'a ChatGPT plan', engine: 'codex', engineName: 'Codex', account: 'ChatGPT' } },
  { id: 'gemini', label: 'Gemini', maker: 'Google', line: 'Fast models with long context. Keys from Google AI Studio, with a free tier.', placeholder: 'From Google AI Studio', flag: 'geminiKeySet', getKey: 'https://aistudio.google.com/apikey', signIn: { plan: 'a Google account', engine: 'gemini-cli', engineName: 'Gemini CLI', account: 'Google' } }
]

const hasKey = (s: ProviderSettings | null, p: ProviderId): boolean =>
  p === 'ollama' || !!(s && s[KEY_PROVIDERS.find((k) => k.id === p)!.flag])

const money = (n: number): string => '$' + (n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString())

function Status({ on, text }: { on: boolean; text?: string }): JSX.Element {
  return <span className={'status-pill' + (on ? ' ready' : '')}>{on && <span className="provider-dot" aria-hidden="true" />}{text ?? (on ? 'Connected' : 'Not connected')}</span>
}

/** A password field with Save (Enter saves; no <form>, so it can sit inside one). Keys are encrypted in main and never come back to the window. */
function KeyField({ id, placeholder, label, onSave, onCancel }: { id: KeyProvider; placeholder: string; label: string; onSave: (key: string) => Promise<void>; onCancel?: () => void }): JSX.Element {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (): Promise<void> => {
    if (!value.trim()) return
    setBusy(true)
    try { await onSave(value); setValue('') } finally { setBusy(false) }
  }
  return (
    <div className="row provider-keyrow">
      <input id={'k-' + id} type="password" className="input mono" autoComplete="off" placeholder={placeholder} aria-label={label + ' API key'} value={value}
        onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save() } }} autoFocus={!!onCancel} />
      <button type="button" className="btn btn-primary" disabled={!value.trim() || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save key'}</button>
      {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
    </div>
  )
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const planName = (p?: string): string => p ? p.charAt(0).toUpperCase() + p.slice(1) + ' plan' : ''

/**
 * "Or sign in with your account": the provider's own adapter (Claude Code, Codex, Gemini CLI) signs in with the user's
 * account in the browser and keeps that login itself. Steps: install the adapter (official installer, command shown
 * first) → sign in → signed in, with a switch for whether agents on it use the account or the saved API key.
 */
function AccountSignIn({ info, status, engine, keySaved, onChange, onSaved, onOpenEngines }: {
  info: NonNullable<(typeof KEY_PROVIDERS)[number]['signIn']>
  status: AccountStatus | undefined
  engine: EngineStatus | undefined
  keySaved: boolean
  onChange: (s: AccountStatus) => void
  onSaved: (message: string) => void | Promise<void>
  onOpenEngines?: () => void
}): JSX.Element {
  const [step, setStep] = useState<'idle' | 'confirm' | 'installing' | 'signing'>('idle')
  const [error, setError] = useState('')
  const [url, setUrl] = useState('')
  const [lastLine, setLastLine] = useState('')
  useEffect(() => window.tyslin.accounts.onSignInUrl((o) => { if (o.engine === info.engine) setUrl(o.url) }), [info.engine])
  useEffect(() => window.tyslin.engines.onInstallOutput((o) => {
    if (o.id !== info.engine) return
    const line = o.text.trim().split('\n').filter(Boolean).pop()
    if (line) setLastLine(line.slice(0, 160))
  }), [info.engine])

  const refresh = async (): Promise<AccountStatus | undefined> => {
    const all = await window.tyslin.accounts.status()
    const mine = all.find((a) => a.engine === info.engine)
    if (mine) onChange(mine)
    return mine
  }
  const install = async (): Promise<void> => {
    setError('')
    setLastLine('')
    setStep('installing')
    try {
      const r = await track(`engine:${info.engine}`, `Installing ${info.engineName}`, () => window.tyslin.engines.install(info.engine))
      if (!r.ok) setError(r.error ?? 'The install failed.')
      else if (!r.status.resolvedPath) setError(`The installer finished, but Tyslin can't find ${info.engineName} yet. Restart Tyslin and try again.`)
      await refresh()
    } finally { setStep('idle') }
  }
  const signIn = async (): Promise<void> => {
    setError('')
    setUrl('')
    setStep('signing')
    try {
      const s = await track(`signin:${info.engine}`, `Signing in to ${info.account}`, () => window.tyslin.accounts.signIn(info.engine))
      onChange(s)
      await onSaved(`Signed in to ${info.account}${s.email ? ' as ' + s.email : ''}`)
    } catch (err) {
      const msg = errText(err)
      if (!/cancelled/i.test(msg)) setError(msg)
      await refresh()
    } finally { setStep('idle') }
  }
  const setUse = async (on: boolean): Promise<void> => {
    onChange(await window.tyslin.accounts.setUseAccount(info.engine, on))
    await onSaved(on ? `Agents on ${info.engineName} use your ${info.account} account` : `Agents on ${info.engineName} use your API key`)
  }

  let body: JSX.Element
  if (!status) body = <p className="hint">Checking {info.engineName}…</p>
  else if (step === 'installing') {
    body = (
      <div className="provider-wait-box" role="status">
        <div className="row provider-actions">
          <span className="provider-wait">Installing {info.engineName}…</span>
          <button type="button" className="btn" onClick={() => void window.tyslin.engines.cancelInstall(info.engine)}>Stop</button>
        </div>
        {lastLine && <span className="mono provider-logline">{lastLine}</span>}
      </div>
    )
  } else if (step === 'signing') {
    body = (
      <div className="provider-wait-box" role="status">
        <div className="row provider-actions">
          <span className="provider-wait">Finish signing in to {info.account} in your browser…</span>
          <button type="button" className="btn" onClick={() => void window.tyslin.accounts.cancelSignIn(info.engine)}>Cancel</button>
        </div>
        {url && <a className="provider-link" href={url} target="_blank" rel="noreferrer">Browser didn't open? Open the sign-in page</a>}
      </div>
    )
  } else if (!status.installed) {
    body = step === 'confirm' && engine?.install ? (
      <div className="install-confirm" role="group" aria-label={`Install ${info.engineName}`}>
        <strong>This will run on your computer:</strong>
        <pre className="install-cmd">{engine.install.command}</pre>
        <span className="hint">The official installer from {engine.install.source}, run with your user account.</span>
        <div className="row provider-actions">
          <button type="button" className="btn btn-primary" onClick={() => void install()}>Install</button>
          <button type="button" className="btn" onClick={() => setStep('idle')}>Cancel</button>
        </div>
      </div>
    ) : (
      <>
        <p className="hint">Have {info.plan}? Install {info.engineName}, then sign in with your {info.account} account. No key needed.</p>
        <div className="row provider-actions">
          {engine?.install
            ? <button type="button" className="btn provider-signin-btn" onClick={() => setStep('confirm')}>Install {info.engineName}</button>
            : onOpenEngines && <button type="button" className="btn provider-signin-btn" onClick={onOpenEngines}>Set up {info.engineName}</button>}
        </div>
      </>
    )
  } else if (!status.signedIn) {
    body = (
      <>
        <p className="hint">Have {info.plan}? Sign in once and agents that run on {info.engineName} use your account. No key needed.</p>
        <div className="row provider-actions">
          <button type="button" className="btn btn-primary provider-signin-btn" onClick={() => void signIn()}>Sign in with {info.account}</button>
        </div>
      </>
    )
  } else {
    body = (
      <>
        <div className="provider-account">
          <span className="provider-dot" aria-hidden="true" />
          <span>Signed in{status.email ? <> as <strong>{status.email}</strong></> : ''}</span>
          {status.plan && <span className="provider-plan mono">{planName(status.plan)}</span>}
        </div>
        <div className="provider-use" role="radiogroup" aria-label={`What agents on ${info.engineName} use`}>
          <span className="provider-use-label">Agents on {info.engineName} use</span>
          <div className="seg">
            <button type="button" role="radio" aria-checked={status.useAccount} className={status.useAccount ? 'on' : ''} onClick={() => void setUse(true)}>My {info.account} account</button>
            <button type="button" role="radio" aria-checked={!status.useAccount} className={!status.useAccount ? 'on' : ''} disabled={!keySaved}
              title={keySaved ? undefined : 'Save an API key above first'} onClick={() => void setUse(false)}>API key</button>
          </div>
        </div>
        <p className="hint">Pick {info.engineName} under "Runs on" for an agent. To sign out, use {info.engineName} itself; Tyslin never stores your sign-in.</p>
        {!keySaved && <p className="hint">Leads and the default model run on an API key, so save a {info.account === 'Google' ? 'Gemini' : info.account === 'ChatGPT' ? 'OpenAI' : 'Claude'} key above to use {info.account === 'Google' ? 'Gemini' : info.account} for them too.</p>}
      </>
    )
  }

  return (
    <div className="provider-section provider-signin">
      <span className="provider-label">Or sign in with your account</span>
      {body}
      {error && <p className="hint account-error" role="alert">{error}</p>}
    </div>
  )
}

/**
 * Every model provider as a card: OpenRouter first with "Connect with OpenRouter" (its OAuth sign-in), then Claude,
 * ChatGPT and Gemini with an API key plus the adapter that uses the user's own subscription sign-in, then Ollama.
 * `onOpenEngines` jumps to Settings → Agent engines; without it the path is named in text.
 */
export function ModelKeys({ settings, onSaved, onOpenEngines }: {
  settings: ProviderSettings | null
  onSaved: (message: string) => void | Promise<void>
  onOpenEngines?: () => void
}): JSX.Element {
  const [editing, setEditing] = useState<KeyProvider | null>(null)
  const [accounts, setAccounts] = useState<AccountStatus[]>([])
  const [engines, setEngines] = useState<EngineStatus[]>([])
  useEffect(() => {
    void window.tyslin.accounts.status().then(setAccounts).catch(() => setAccounts([]))
    void window.tyslin.engines.list().then(setEngines).catch(() => setEngines([]))
  }, [])
  const putAccount = (a: AccountStatus): void => {
    setAccounts((list) => [...list.filter((x) => x.engine !== a.engine), a])
    void window.tyslin.engines.list().then(setEngines).catch(() => undefined)
  }
  const [orAccount, setOrAccount] = useState<OpenRouterAccount | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [orError, setOrError] = useState('')
  const [ollama, setOllama] = useState(settings?.ollamaUrl ?? '')
  useEffect(() => { if (settings) setOllama(settings.ollamaUrl) }, [settings?.ollamaUrl])

  const orSet = !!settings?.openrouterKeySet
  useEffect(() => {
    if (!orSet || !SHOW_OPENROUTER) { setOrAccount(null); return }
    void window.tyslin.settings.openrouterAccount().then(setOrAccount).catch(() => setOrAccount(null))
  }, [orSet])

  const saveKey = async (id: KeyProvider, label: string, key: string): Promise<void> => {
    await window.tyslin.settings.setKey(id, key)
    setEditing(null)
    await refreshDefaultModel()
    await onSaved(`${label} key saved`)
  }
  const remove = async (id: KeyProvider, label: string): Promise<void> => {
    await window.tyslin.settings.removeKey(id)
    await refreshDefaultModel()
    await onSaved(`${label} disconnected`)
  }
  const connect = async (): Promise<void> => {
    setOrError('')
    setConnecting(true)
    try {
      await window.tyslin.settings.connectOpenRouter()
      await refreshDefaultModel()
      await onSaved('OpenRouter connected')
    } catch (err) {
      const msg = err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
      if (!/cancelled/i.test(msg)) setOrError(msg)
    } finally { setConnecting(false) }
  }

  const [or, ...rest] = KEY_PROVIDERS
  return (
    <div className="providers">
      {SHOW_OPENROUTER && <article className={'provider-card provider-featured' + (orSet ? ' on' : '')} aria-labelledby="pv-openrouter">
        <div className="provider-head">
          <Mark id="openrouter" size={40} />
          <div className="provider-title">
            <h3 id="pv-openrouter">{or.label}</h3>
            <span className="provider-maker">{or.maker}</span>
          </div>
          {!orSet && <span className="provider-tag">Easiest start</span>}
          <Status on={orSet && orAccount?.valid !== false} text={orSet && orAccount?.valid === false ? 'Key revoked' : undefined} />
        </div>
        <p className="provider-line">{or.line}</p>
        {orSet ? (
          <>
            {orAccount?.valid && (
              <dl className="provider-stats">
                {orAccount.label && <div><dt>Key</dt><dd className="mono">{orAccount.label}</dd></div>}
                <div><dt>Spent</dt><dd className="mono">{money(orAccount.usage)}</dd></div>
                <div><dt>Limit</dt><dd className="mono">{orAccount.limit === null ? 'None' : money(orAccount.limit)}</dd></div>
                {orAccount.freeTier && <div><dt>Plan</dt><dd>Free tier</dd></div>}
              </dl>
            )}
            {editing === 'openrouter'
              ? <KeyField id="openrouter" placeholder={or.placeholder} label={or.label} onSave={(k) => saveKey('openrouter', or.label, k)} onCancel={() => setEditing(null)} />
              : (
                <div className="row provider-actions">
                  {orAccount?.valid === false && <button type="button" className="btn btn-primary" onClick={() => void connect()} disabled={connecting}>Connect again</button>}
                  <a className="btn" href="https://openrouter.ai/settings/credits" target="_blank" rel="noreferrer">Credits and usage</a>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing('openrouter')}>Replace key</button>
                  <button type="button" className="btn btn-ghost" onClick={() => void remove('openrouter', or.label)}>Disconnect</button>
                </div>
              )}
          </>
        ) : (
          <>
            <div className="row provider-actions">
              {connecting ? (
                <>
                  <span className="provider-wait" role="status">Finish signing in on openrouter.ai in your browser…</span>
                  <button type="button" className="btn" onClick={() => void window.tyslin.settings.cancelOpenRouter()}>Cancel</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-primary provider-connect" onClick={() => void connect()}>Connect with OpenRouter</button>
                  {editing !== 'openrouter' && <button type="button" className="btn btn-ghost" onClick={() => setEditing('openrouter')}>Paste a key instead</button>}
                </>
              )}
            </div>
            {editing === 'openrouter' && !connecting && <KeyField id="openrouter" placeholder={or.placeholder} label={or.label} onSave={(k) => saveKey('openrouter', or.label, k)} onCancel={() => setEditing(null)} />}
            <p className="hint provider-fine">Opens openrouter.ai to sign in. OpenRouter makes a key for Tyslin that you can see, limit or revoke at any time on openrouter.ai/keys.</p>
          </>
        )}
        {orError && <p className="hint account-error" role="alert">{orError}</p>}
      </article>}

      <div className="provider-grid">
        {rest.map((k) => {
          const saved = !!settings?.[k.flag]
          const acct = k.signIn && accounts.find((x) => x.engine === k.signIn!.engine)
          const viaAccount = !!acct?.signedIn && acct.useAccount
          return (
            <article key={k.id} className={'provider-card' + (saved ? ' on' : '')} aria-labelledby={'pv-' + k.id}>
              <div className="provider-head">
                <Mark id={k.id} size={36} />
                <div className="provider-title">
                  <h3 id={'pv-' + k.id}>{k.label}</h3>
                  <span className="provider-maker">{k.maker}</span>
                </div>
                <Status on={saved || viaAccount} text={saved && viaAccount ? 'Key and account' : viaAccount ? 'Signed in' : undefined} />
              </div>
              <p className="provider-line">{k.line}</p>
              <div className="provider-section">
                <span className="provider-label">API key</span>
                {saved && editing !== k.id ? (
                  <div className="row provider-actions">
                    <span className="mono provider-masked" aria-label="Key saved">••••••••••••</span>
                    <button type="button" className="btn btn-ghost" onClick={() => setEditing(k.id)}>Replace</button>
                    <button type="button" className="btn btn-ghost" onClick={() => void remove(k.id, k.label)}>Remove</button>
                  </div>
                ) : (
                  <>
                    <KeyField id={k.id} placeholder={k.placeholder} label={k.label} onSave={(key) => saveKey(k.id, k.label, key)} onCancel={saved ? () => setEditing(null) : undefined} />
                    <a href={k.getKey} target="_blank" rel="noreferrer" className="provider-link">Get a {k.label} key</a>
                  </>
                )}
              </div>
              {k.signIn && (
                <AccountSignIn info={k.signIn} status={accounts.find((x) => x.engine === k.signIn!.engine)} engine={engines.find((e) => e.id === k.signIn!.engine)}
                  keySaved={saved} onChange={putAccount} onSaved={onSaved} onOpenEngines={onOpenEngines} />
              )}
            </article>
          )
        })}

        <article className="provider-card on-device" aria-labelledby="pv-ollama">
          <div className="provider-head">
            <Mark id="ollama" size={36} />
            <div className="provider-title">
              <h3 id="pv-ollama">Ollama</h3>
              <span className="provider-maker">On this computer</span>
            </div>
            <Status on={false} text="No key needed" />
          </div>
          <p className="provider-line">Run open models locally. Nothing leaves your machine.</p>
          <div className="provider-section">
            <label className="provider-label" htmlFor="k-ollama">Ollama URL</label>
            <div className="row provider-keyrow">
              <input id="k-ollama" className="input mono" value={ollama} onChange={(e) => setOllama(e.target.value)} />
              <button type="button" className="btn" disabled={!ollama.trim() || ollama.trim() === settings?.ollamaUrl}
                onClick={async () => { await window.tyslin.settings.setOllamaUrl(ollama); await onSaved('Ollama URL saved') }}>Save</button>
            </div>
            <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="provider-link">Get Ollama</a>
          </div>
        </article>
      </div>
    </div>
  )
}

const OTHER = '__other__'
const ctx = (n: number | null): string => n === null ? '' : n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`
const price = (m: OpenRouterModel): string => m.input === null || m.output === null ? '' : m.input === 0 && m.output === 0 ? 'Free' : `$${m.input} in · $${m.output} out per 1M tokens`

/** Provider and model for the default model. Providers without a key are marked; Ollama needs none. OpenRouter gets a search box and model details. */
export function DefaultModelPicker({ settings, value, onChange, idPrefix = 'dm' }: {
  settings: ProviderSettings | null
  value: { provider: ProviderId; model: string }
  onChange: (v: { provider: ProviderId; model: string }) => void
  idPrefix?: string
}): JSX.Element {
  // OpenRouter stays in the list only while it is shown, or when it is already the chosen provider.
  const providers: ProviderId[] = (['openrouter', 'anthropic', 'openai', 'gemini', 'ollama'] as ProviderId[])
    .filter((p) => p !== 'openrouter' || SHOW_OPENROUTER || value.provider === 'openrouter')
  // OpenRouter lists hundreds of models; load them once the provider is picked.
  const [orModels, setOrModels] = useState<OpenRouterModel[] | null>(null)
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (value.provider !== 'openrouter' || orModels) return
    void window.tyslin.settings.openrouterModels().then(setOrModels).catch(() => setOrModels([]))
  }, [value.provider, orModels])
  const isOr = value.provider === 'openrouter' && !!orModels && orModels.length > 0
  const all: OpenRouterModel[] = isOr ? orModels! : MODEL_SUGGESTIONS[value.provider].map((m) => ({ id: m, name: m, context: null, input: null, output: null }))
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!isOr || !q) return all
    const hits = all.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
    // Keep the chosen model in the list so the select never shows a blank value.
    return hits.some((m) => m.id === value.model) ? hits : [...all.filter((m) => m.id === value.model), ...hits]
  }, [all, query, isOr, value.model])
  const known = all.some((o) => o.id === value.model)
  const picked = all.find((m) => m.id === value.model)

  return (
    <div className="dm-picker">
      <div className="field">
        <label htmlFor={idPrefix + '-prov'}>Provider</label>
        <div className="dm-prov">
          <Mark id={value.provider} size={26} />
          <select id={idPrefix + '-prov'} className="select" value={value.provider}
            onChange={(e) => { const p = e.target.value as ProviderId; setQuery(''); onChange({ provider: p, model: MODEL_SUGGESTIONS[p][0] }) }}>
            {providers.map((p) => (
              <option key={p} value={p}>{PROVIDER_NAME[p]}{p === 'ollama' ? ' (on this computer)' : hasKey(settings, p) ? '' : ' (not connected)'}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={idPrefix + '-model'}>Model</label>
        {isOr && (
          <input type="search" className="input" aria-label="Search OpenRouter models" placeholder={`Search ${orModels!.length} models, e.g. sonnet, gpt-5, llama`}
            value={query} onChange={(e) => setQuery(e.target.value)} />
        )}
        <select id={idPrefix + '-model'} className="select mono" value={known ? value.model : OTHER}
          onChange={(e) => onChange({ ...value, model: e.target.value === OTHER ? '' : e.target.value })}>
          {shown.map((m) => <option key={m.id} value={m.id}>{m.name === m.id ? m.id : `${m.name} · ${m.id}`}</option>)}
          <option value={OTHER}>Other model…</option>
        </select>
        {isOr && query.trim() && shown.length === 0 && <span className="hint">No model matches "{query.trim()}".</span>}
        {!known && (
          <input className="input mono" aria-label="Model name" placeholder="Model name, e.g. gpt-4.1" value={value.model} spellCheck={false}
            onChange={(e) => onChange({ ...value, model: e.target.value })} autoFocus />
        )}
        {picked && (picked.context !== null || price(picked)) && (
          <div className="dm-meta mono">
            {picked.context !== null && <span>{ctx(picked.context)} context</span>}
            {price(picked) && <span>{price(picked)}</span>}
          </div>
        )}
      </div>
      {!hasKey(settings, value.provider) && <p className="hint account-error dm-note">Connect {PROVIDER_NAME[value.provider]} first, or this model can't answer.</p>}
    </div>
  )
}
