import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { AccountEngine, AccountStatus, KeyProvider, OpenRouterAccount, OpenRouterModel, ProviderId, ProviderSettings } from '@shared/types'
import { MODEL_SUGGESTIONS, PROVIDER_NAME } from '@shared/models'
import { refreshDefaultModel } from '../defaultModel'
import { Mark, type MarkKey } from './RunsOnBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/** OpenRouter: hidden 7 Nov 2026, shown again 10 Nov 2026 (owner) as a provider card like the others, for Leads and for Claude Code / Codex workers. */
export const SHOW_OPENROUTER = true
/** Ollama (local models) is hidden for now: no card, and not in the default-model picker unless already chosen. Code kept. */
export const SHOW_OLLAMA = false

/** Providers with an API key: where to get one, and (for the big three) the adapter that signs in with the user's own account. */
export const KEY_PROVIDERS: {
  id: KeyProvider; label: string; maker: string; line: string; placeholder: string; flag: keyof ProviderSettings; getKey: string
  signIn?: { plan: string; engine: AccountEngine; engineName: string; account: string }
}[] = [
  { id: 'openrouter', label: 'OpenRouter', maker: 'One key, hundreds of models', line: 'Claude, GPT, Gemini, DeepSeek and more with one key, paid as you go on openrouter.ai. For Leads, and for Claude Code and Codex workers you set to OpenRouter.', placeholder: 'sk-or-…', flag: 'openrouterKeySet', getKey: 'https://openrouter.ai/keys' },
  { id: 'anthropic', label: 'Claude', maker: 'Anthropic', line: 'Strong at planning, writing and code. Billed per use on your Anthropic account.', placeholder: 'sk-ant-…', flag: 'anthropicKeySet', getKey: 'https://console.anthropic.com/settings/keys', signIn: { plan: 'a Claude Pro or Max plan', engine: 'claude-code', engineName: 'Claude Code', account: 'Claude' } },
  { id: 'openai', label: 'ChatGPT', maker: 'OpenAI', line: 'GPT models for chat, writing and code. Billed per use on your OpenAI platform account.', placeholder: 'sk-…', flag: 'openaiKeySet', getKey: 'https://platform.openai.com/api-keys', signIn: { plan: 'a ChatGPT plan', engine: 'codex', engineName: 'Codex', account: 'ChatGPT' } },
  { id: 'gemini', label: 'Gemini', maker: 'Google', line: 'Fast models with long context. Keys from Google AI Studio, with a free tier.', placeholder: 'From Google AI Studio', flag: 'geminiKeySet', getKey: 'https://aistudio.google.com/apikey', signIn: { plan: 'a Google account', engine: 'gemini-cli', engineName: 'Gemini CLI', account: 'Google' } }
]

/** Whether a provider can run: a key is saved (Ollama needs none). First run uses it to pick a connected default. */
export const hasKey = (s: ProviderSettings | null, p: ProviderId): boolean =>
  p === 'ollama' || !!(s && s[KEY_PROVIDERS.find((k) => k.id === p)!.flag])

const money = (n: number): string => '$' + (n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString())

/** Shared look for native selects (no shadcn Select here: the native one keeps keyboard and screen-reader behaviour). */
const selectCls = 'w-full min-w-0 bg-card dark:bg-card dark:hover:bg-card'
const hintCls = 'text-[13px] leading-relaxed text-muted-foreground'
const errorCls = 'text-[13px] text-destructive'
const linkCls = 'self-start text-[13px] text-green underline-offset-4 hover:underline'
const sectionCls = 'flex flex-col gap-2.5 border-t border-border pt-3.5'
const sectionLabelCls = 'text-[13px] font-medium'

function Status({ on, text }: { on: boolean; text?: string }): JSX.Element {
  return (
    <Badge variant={on ? 'soft' : 'secondary'} className="h-6 px-2">
      {on && <span className="size-1.5 rounded-full bg-green" aria-hidden="true" />}
      {text ?? (on ? 'Connected' : 'Not connected')}
    </Badge>
  )
}

/** A password field with Save (Enter saves; no <form>, so it can sit inside one). Keys are encrypted in main and never come back to the window. */
function KeyField({ id, placeholder, label, onSave, onCancel }: { id: KeyProvider; placeholder: string; label: string; onSave: (key: string) => Promise<void>; onCancel?: () => void }): JSX.Element {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (): Promise<void> => {
    if (!value.trim()) return
    setBusy(true); setError('')
    try { await onSave(value); setValue('') } catch (err) { setError((err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-1.5">
    <div className="flex items-center gap-2">
      <Input id={'k-' + id} type="password" className="flex-1 font-mono" autoComplete="off" placeholder={placeholder} aria-label={label + ' API key'} value={value}
        onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save() } }} autoFocus={!!onCancel} />
      <Button type="button" disabled={!value.trim() || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save key'}</Button>
      {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
    </div>
    {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
    </div>
  )
}


/** Logo tile, name, maker and status badge at the top of a provider card. */
function ProviderHead({ id, mark, title, maker, size = 40, children }: { id: string; mark: MarkKey; title: string; maker: string; size?: number; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <Mark id={mark} size={size} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 id={id} className="text-[15px] font-semibold">{title}</h3>
        <span className="text-[13px] text-muted-foreground">{maker}</span>
      </div>
      {children}
    </div>
  )
}

/**
 * Every model provider as a card: Claude, ChatGPT and Gemini with an API key plus the adapter that uses the user's own
 * subscription sign-in, then OpenRouter (key, checked in main before saving, or its OAuth sign-in), then Ollama.
 * `onOpenEngines` jumps to Settings → Agent engines; without it the path is named in text.
 */
export function ModelKeys({ settings, onSaved, onOpenEngines }: {
  settings: ProviderSettings | null
  onSaved: (message: string) => void | Promise<void>
  onOpenEngines?: () => void
}): JSX.Element {
  const [editing, setEditing] = useState<KeyProvider | null>(null)
  const [accounts, setAccounts] = useState<AccountStatus[]>([])
  useEffect(() => { void window.tyslin.accounts.status().then(setAccounts).catch(() => setAccounts([])) }, [])
  const [orAccount, setOrAccount] = useState<OpenRouterAccount | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [orError, setOrError] = useState('')
  const [ollama, setOllama] = useState(settings?.ollamaUrl ?? '')
  useEffect(() => { if (settings) setOllama(settings.ollamaUrl) }, [settings?.ollamaUrl])

  const orSet = !!settings?.openrouterKeySet
  // How many OpenRouter models can take tool calls (what agents need); null until loaded, 0 when offline.
  const [orModels, setOrModels] = useState<number | null>(null)
  useEffect(() => { if (SHOW_OPENROUTER) void window.tyslin.settings.openrouterModels().then((m) => setOrModels(m.filter((x) => x.tools).length)).catch(() => setOrModels(0)) }, [])
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

  const cardCls = (on: boolean): string => cn('flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs', on ? 'border-green' : 'border-border')
  const [or, ...rest] = KEY_PROVIDERS
  return (
    <div className="tw flex flex-col gap-4 text-foreground">

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {[...rest, ...(SHOW_OPENROUTER ? [or] : [])].map((k) => {
          const saved = !!settings?.[k.flag]
          const acct = k.signIn && accounts.find((x) => x.engine === k.signIn!.engine)
          const viaAccount = !!acct?.signedIn && acct.useAccount
          return (
            <article key={k.id} className={cardCls(saved)} aria-labelledby={'pv-' + k.id}>
              <ProviderHead id={'pv-' + k.id} mark={k.id} title={k.label} maker={k.maker}>
                <Status on={saved || viaAccount} text={saved && viaAccount ? 'Key and account' : viaAccount ? 'Signed in' : undefined} />
              </ProviderHead>
              <p className="text-sm leading-relaxed text-muted-foreground">{k.line}</p>
              <div className="flex flex-col gap-1.5">
                <span className={sectionLabelCls}>API key</span>
                {saved && editing !== k.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-9 min-w-0 flex-1 items-center rounded-md border border-border bg-muted px-3 font-mono text-sm tracking-[0.1em] text-muted-foreground" aria-label="Key saved">••••••••••••</span>
                    <Button type="button" variant="outline" onClick={() => setEditing(k.id)}>Replace</Button>
                    <Button type="button" variant="ghost" className="text-destructive" onClick={() => void remove(k.id, k.label)}>Remove</Button>
                  </div>
                ) : (
                  <>
                    <KeyField id={k.id} placeholder={k.placeholder} label={k.label} onSave={(key) => saveKey(k.id, k.label, key)} onCancel={saved ? () => setEditing(null) : undefined} />
                    <a href={k.getKey} target="_blank" rel="noreferrer" className={linkCls}>Get {/^[AEIOU]/i.test(k.label) ? 'an' : 'a'} {k.label} key</a>
                  </>
                )}
              </div>
              {k.id === 'openrouter' && (
                <div className="flex flex-col gap-2">
                  {saved && orAccount?.valid === false && <p className={errorCls} role="alert">OpenRouter no longer accepts this key. Replace it.</p>}
                  {saved && orAccount?.valid && (
                    <span className="font-mono text-xs text-muted-foreground">{money(orAccount.usage)} spent{orAccount.limit === null ? '' : ` of ${money(orAccount.limit)}`}{orAccount.freeTier ? ' · free tier' : ''}</span>
                  )}
                  {orModels !== null && <span className="text-xs text-muted-foreground">{orModels ? `${orModels} models with tool calls. Pick one for the default model, a Lead, or a Claude Code or Codex worker (Gemini CLI can't use OpenRouter).` : "Couldn't load OpenRouter's model list."}</span>}
                  <span className="flex flex-wrap items-center gap-2">
                    {saved
                      ? <Button asChild variant="outline" size="sm"><a href="https://openrouter.ai/settings/credits" target="_blank" rel="noreferrer">Credits and usage</a></Button>
                      : connecting
                        ? <><span className="text-sm" role="status">Finish signing in on openrouter.ai in your browser…</span><Button type="button" variant="outline" size="sm" onClick={() => void window.tyslin.settings.cancelOpenRouter()}>Cancel</Button></>
                        : <Button type="button" variant="ghost" size="sm" onClick={() => void connect()}>Or sign in with OpenRouter</Button>}
                  </span>
                  {orError && <p className={errorCls} role="alert">{orError}</p>}
                </div>
              )}
              {k.signIn && (
                // Adapters choose on their own since 14 Nov 2026: their own sign-in when they have one, else this key. Nothing to set here.
                <p className={cn(hintCls, sectionCls)}>
                  {viaAccount
                    ? <>{k.signIn.engineName} workers use your {k.signIn.account} sign-in{acct && acct.email ? <> ({acct.email})</> : ''}.</>
                    : <>{k.signIn.engineName} workers use this key, or your {k.signIn.account} sign-in when {k.signIn.engineName} has one.</>}
                </p>
              )}
            </article>
          )
        })}

        {SHOW_OLLAMA && <article className={cardCls(false)} aria-labelledby="pv-ollama">
          <ProviderHead id="pv-ollama" mark="ollama" title="Ollama" maker="On this computer">
            <Badge variant="secondary" className="h-6 px-2">No key needed</Badge>
          </ProviderHead>
          <p className="text-sm leading-relaxed text-muted-foreground">Run open models locally. Nothing leaves your machine.</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="k-ollama" className="text-[13px]">Ollama URL</Label>
            <div className="flex items-center gap-2">
              <Input id="k-ollama" className="flex-1 font-mono" value={ollama} onChange={(e) => setOllama(e.target.value)} />
              <Button type="button" variant="outline" disabled={!ollama.trim() || ollama.trim() === settings?.ollamaUrl}
                onClick={async () => { await window.tyslin.settings.setOllamaUrl(ollama); await onSaved('Ollama URL saved') }}>Save</Button>
            </div>
            <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className={linkCls}>Get Ollama</a>
          </div>
        </article>}
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
  const providers: ProviderId[] = (['anthropic', 'openai', 'gemini', 'openrouter', 'ollama'] as ProviderId[])
    .filter((p) => p !== 'openrouter' || SHOW_OPENROUTER || value.provider === 'openrouter')
    .filter((p) => p !== 'ollama' || SHOW_OLLAMA || value.provider === 'ollama')
  // OpenRouter lists hundreds of models; load them once the provider is picked.
  const [orModels, setOrModels] = useState<OpenRouterModel[] | null>(null)
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (value.provider !== 'openrouter' || orModels) return
    void window.tyslin.settings.openrouterModels().then(setOrModels).catch(() => setOrModels([]))
  }, [value.provider, orModels])
  const isOr = value.provider === 'openrouter' && !!orModels && orModels.length > 0
  const all: OpenRouterModel[] = isOr ? orModels!.filter((m) => m.tools) : MODEL_SUGGESTIONS[value.provider].map((m) => ({ id: m, name: m, context: null, input: null, output: null, tools: true }))
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
    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 text-foreground">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={idPrefix + '-prov'} className="text-[13px]">Provider</Label>
        <div className="flex items-center gap-2.5">
          <Mark id={value.provider} size={28} />
          <Select value={value.provider} onValueChange={(v) => { const p = v as ProviderId; setQuery(''); onChange({ provider: p, model: MODEL_SUGGESTIONS[p][0] }) }}>
            <SelectTrigger id={idPrefix + '-prov'} className={selectCls}><SelectValue /></SelectTrigger>
            <SelectContent position="popper">
              {providers.map((p) => (
                <SelectItem key={p} value={p}>{PROVIDER_NAME[p]}{p === 'ollama' ? ' (on this computer)' : hasKey(settings, p) ? '' : ' (not connected)'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={idPrefix + '-model'} className="text-[13px]">Model</Label>
        {isOr && (
          <Input type="search" aria-label="Search OpenRouter models" placeholder={`Search ${orModels!.length} models, e.g. sonnet, gpt-5, llama`}
            value={query} onChange={(e) => setQuery(e.target.value)} />
        )}
        <Select value={known ? value.model : OTHER} onValueChange={(v) => onChange({ ...value, model: v === OTHER ? '' : v })}>
          <SelectTrigger id={idPrefix + '-model'} className={cn(selectCls, 'font-mono')}><SelectValue /></SelectTrigger>
          <SelectContent position="popper" className="max-h-[min(360px,var(--radix-select-content-available-height))]">
            {shown.map((m) => <SelectItem key={m.id} value={m.id} className="font-mono">{m.name === m.id ? m.id : `${m.name} · ${m.id}`}</SelectItem>)}
            <SelectItem value={OTHER}>Other model…</SelectItem>
          </SelectContent>
        </Select>
        {isOr && query.trim() && shown.length === 0 && <span className={hintCls}>No model matches "{query.trim()}".</span>}
        {!known && (
          <Input className="font-mono" aria-label="Model name" placeholder="Model name, e.g. gpt-4.1" value={value.model} spellCheck={false}
            onChange={(e) => onChange({ ...value, model: e.target.value })} autoFocus />
        )}
        {picked && (picked.context !== null || price(picked)) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
            {picked.context !== null && <span>{ctx(picked.context)} context</span>}
            {price(picked) && <span>{price(picked)}</span>}
          </div>
        )}
      </div>
      {!hasKey(settings, value.provider) && <p className={cn(errorCls, 'col-span-full')}>Connect {PROVIDER_NAME[value.provider]} first, or this model can't answer.</p>}
    </div>
  )
}
