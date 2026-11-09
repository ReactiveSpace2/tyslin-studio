import { useEffect, useRef, useState } from 'react'
import type { Agent, McpServerInfo, McpServerInput, RegistryServer } from '@shared/types'
import { AGENCY_INTEGRATIONS } from '@shared/agencyIntegrations'
import { MCP_PRESETS, type McpPreset } from '@shared/mcpPresets'
import { ENGINE_NAMES, engineListed } from '@shared/engines'
import { Avatar } from '../components/Avatar'
import { runsOnLabel } from '../components/RunsOnBadge'
import { Icon } from '../components/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ChevronRightIcon } from 'lucide-react'

interface Props {
  agents: Agent[]
  /** The open agency: its agents get a switch per integration. */
  team?: { name: string; members: Agent[] }
  /** The open agency's template: its suggested integrations come first. */
  templateId?: string | null
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const initials = (s: string): string => s.replace(/[^a-z0-9]/gi, '').slice(0, 2).replace(/^./, (c) => c.toUpperCase()) || '··'
const titleOf = (s: McpServerInfo): string => s.title || (MCP_PRESETS.find((p) => p.id === s.preset)?.title ?? s.name)
/** The verified namespace of a registry name: "io.github.owner/x" → "github.com/owner", "com.example/x" → "example.com". */
const publisher = (name: string): string => {
  const ns = name.split('/')[0] ?? ''
  if (ns.startsWith('io.github.')) return 'github.com/' + ns.slice('io.github.'.length)
  return ns.split('.').reverse().join('.')
}
const KIND: Record<NonNullable<RegistryServer['install']>['kind'], string> = { remote: 'Remote', npm: 'npm', pypi: 'Python', docker: 'Docker' }
const canUse = (a: Agent): boolean => a.engine !== 'builtin'
const ADAPTERS = (['claude-code', 'codex', 'gemini-cli', 'goose'] as const).filter((id) => engineListed(id)).map((id) => ENGINE_NAMES[id]).join(', ')

type Draft = {
  id?: string; preset: McpPreset | null; name: string; transport: 'http' | 'stdio'; url: string; commandLine: string; token: string; headers: string; env: string; keepSecrets: boolean
  /** Installing from the MCP Registry: the server and the values typed for its fields (by field key). */
  registry?: RegistryServer; values: Record<string, string>
}
const blank = (preset: McpPreset | null): Draft => ({ preset, name: preset?.name ?? '', transport: 'http', url: '', commandLine: '', token: '', headers: '', env: '', keepSecrets: false, values: {} })
const slugOf = (s: string): string => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
const fieldKey = (f: { target: string; name: string; header?: string }): string => `${f.target}:${f.header ?? ''}:${f.name}`

/** A registry draft → the save input. Throws a readable message when a required value is missing. */
function registryInput(d: Draft): McpServerInput {
  const r = d.registry!
  const inst = r.install!
  const val = (f: { target: string; name: string; header?: string; defaultValue?: string }): string => (d.values[fieldKey(f)] ?? '').trim() || f.defaultValue || ''
  for (const f of inst.fields) if (f.required && !val(f)) throw new Error(`Fill in ${f.name}.`)
  if (inst.transport === 'http') {
    let url = inst.url ?? ''
    for (const f of inst.fields.filter((x) => x.target === 'url-var')) url = url.split(`{${f.name}}`).join(val(f))
    const lines: string[] = []
    for (const f of inst.fields.filter((x) => x.target === 'header')) {
      const v = val(f)
      if (v) lines.push(`${f.name}: ${f.name.toLowerCase() === 'authorization' && !/^\S+\s/.test(v) ? 'Bearer ' + v : v}`)
    }
    const templated = new Map<string, string>()
    for (const f of inst.fields.filter((x) => x.target === 'header-var')) {
      const t = templated.get(f.header!) ?? f.template!
      templated.set(f.header!, t.split(`{${f.name}}`).join(val(f)))
    }
    for (const [h, v] of templated) if (!/\{[^}]+\}/.test(v) && v.trim()) lines.push(`${h}: ${v}`)
    return { name: d.name, title: r.title, source: r.name, preset: '', transport: 'http', url, headers: lines.join('\n') }
  }
  const env = inst.fields.filter((x) => x.target === 'env' && val(x)).map((f) => `${f.name}=${val(f)}`)
  return { name: d.name, title: r.title, source: r.name, preset: '', transport: 'stdio', commandLine: inst.commandLine, env: env.join('\n') }
}

/**
 * Integrations: MCP servers agents use as tools (GitHub, Linear, Stripe, or any server the user adds). Added once per
 * organization, switched on per agent. Works for agents on external adapters; built-in-model agents are marked.
 */
export function IntegrationsPage({ agents, team, templateId }: Props): JSX.Element {
  const [list, setList] = useState<McpServerInfo[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ q: string; servers: RegistryServer[]; next?: string } | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const formRef = useRef<HTMLElement>(null)
  const suggested = templateId ? AGENCY_INTEGRATIONS[templateId] : undefined

  // Search the MCP Registry as the user types (debounced); an empty box clears the results.
  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults(null); setSearchError(''); return }
    // A slower answer for an older query must not replace the results for what is typed now.
    let live = true
    const t = setTimeout(() => {
      setSearching(true)
      setSearchError('')
      window.tyslin.integrations.search(q)
        .then((r) => { if (live) setResults({ q, ...r }) })
        .catch((err) => { if (live) { setResults(null); setSearchError(errText(err)) } })
        .finally(() => { if (live) setSearching(false) })
    }, 350)
    return () => { live = false; clearTimeout(t); setSearching(false) }
  }, [query])
  const more = async (): Promise<void> => {
    if (!results?.next) return
    setSearching(true)
    try {
      const r = await window.tyslin.integrations.search(results.q, results.next)
      setResults({ q: results.q, servers: [...results.servers, ...r.servers.filter((x) => !results.servers.some((y) => y.name === x.name))], next: r.next })
    } catch (err) { setSearchError(errText(err)) } finally { setSearching(false) }
  }
  const openDraft = (d: Draft): void => {
    setError('')
    setDraft(d)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  /** The latest list, for handlers that run after an await (two quick switch flips must not undo each other). */
  const listRef = useRef<McpServerInfo[] | null>(null)
  listRef.current = list
  const load = async (): Promise<void> => setList(await window.tyslin.integrations.list())
  useEffect(() => { void load() }, [])
  const replace = (s: McpServerInfo): void => setList((l) => (l ?? []).some((x) => x.id === s.id) ? l!.map((x) => (x.id === s.id ? s : x)) : [...(l ?? []), s])

  const save = async (): Promise<void> => {
    if (!draft) return
    setBusy(true)
    setError('')
    try {
      const input: McpServerInput = draft.registry ? { ...registryInput(draft), agentIds: (team?.members ?? []).filter(canUse).map((a) => a.id) } : {
        id: draft.id, name: draft.name, preset: draft.preset?.id ?? '', transport: draft.preset ? 'http' : draft.transport,
        url: draft.url, commandLine: draft.commandLine,
        token: draft.preset && !(draft.keepSecrets && !draft.token.trim()) ? draft.token : undefined,
        headers: !draft.preset && !(draft.keepSecrets && !draft.headers.trim()) ? draft.headers : undefined,
        env: !draft.preset && !(draft.keepSecrets && !draft.env.trim()) ? draft.env : undefined,
        // A new integration starts on for the agency's agents that can use it.
        agentIds: draft.id ? undefined : (team?.members ?? []).filter(canUse).map((a) => a.id)
      }
      const saved = await window.tyslin.integrations.save(input)
      replace(saved)
      setDraft(null)
      void test(saved.id)
    } catch (err) { setError(errText(err)) } finally { setBusy(false) }
  }
  const test = async (id: string): Promise<void> => {
    setTesting(id)
    try {
      const r = await window.tyslin.integrations.test(id)
      // Removed while the test ran: don't bring it back.
      if (r) setList((l) => (l ?? []).map((x) => (x.id === r.id ? r : x)))
    } catch (err) { setError(errText(err)) } finally { setTesting((t) => (t === id ? null : t)) }
  }
  const remove = async (s: McpServerInfo): Promise<void> => {
    if (!window.confirm(`Remove ${titleOf(s)}? Agents stop using it and its saved token is deleted.`)) return
    try {
      await window.tyslin.integrations.remove(s.id)
      setList((l) => (l ?? []).filter((x) => x.id !== s.id))
      if (draft?.id === s.id) setDraft(null)
    } catch (err) { setError(errText(err)) }
  }
  const toggle = async (s: McpServerInfo, a: Agent): Promise<void> => {
    const cur = listRef.current?.find((x) => x.id === s.id)?.agentIds ?? s.agentIds
    const ids = cur.includes(a.id) ? cur.filter((x) => x !== a.id) : [...cur, a.id]
    // Show the flip straight away, so a second flip builds on it.
    const optimistic = { ...s, agentIds: ids }
    listRef.current = (listRef.current ?? []).map((x) => (x.id === s.id ? { ...x, agentIds: ids } : x))
    replace(listRef.current.find((x) => x.id === s.id) ?? optimistic)
    try { replace(await window.tyslin.integrations.setAgents(s.id, ids)) } catch (err) { setError(errText(err)); void load() }
  }
  const edit = (s: McpServerInfo): void => {
    setError('')
    openDraft({ ...blank(MCP_PRESETS.find((p) => p.id === s.preset) ?? null), id: s.id, name: s.name, transport: s.transport, url: s.url,
      commandLine: [s.command, ...s.args].map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' '), keepSecrets: s.secretNames.length > 0 })
  }

  const added = new Set((list ?? []).map((s) => s.preset).filter(Boolean))
  const addedSources = new Set((list ?? []).map((s) => s.source).filter(Boolean))
  // The agency's suggested presets first.
  const presets = [...MCP_PRESETS].sort((a, b) => Number(suggested?.presets.includes(b.id) ?? 0) - Number(suggested?.presets.includes(a.id) ?? 0))
  const q = results?.q.toLowerCase() ?? ''
  // Servers whose publisher namespace names the app (e.g. com.notion/…) first: most likely the official one.
  const ranked = results ? [...results.servers].sort((a, b) => Number(publisher(b.name).toLowerCase().includes(q.split(' ')[0])) - Number(publisher(a.name).toLowerCase().includes(q.split(' ')[0]))) : []

  const cols = 3 + (team ? team.members.length : 1)

  return (
    <div className="tw flex w-full max-w-[1180px] flex-col gap-6 px-7 pt-7 pb-10 font-sans text-foreground">
      <header className="flex flex-col gap-1.5">
        <span className="font-mono text-xs tracking-[0.08em] text-green uppercase">{team ? team.name : 'Organization'}</span>
        <h1 className="m-0 text-[26px] font-semibold tracking-tight">Integrations</h1>
        <p className="max-w-[680px] text-sm leading-relaxed text-muted-foreground">
          Give your agents tools from the apps you use, through MCP servers. Tokens are encrypted on this computer and only go to that app's server.
          Agents on {ADAPTERS} can use them.
        </p>
      </header>
      {!draft && error && <ErrorText>{error}</ErrorText>}

      {draft?.registry && draft.registry.install && (
        <section ref={formRef} className="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs" aria-labelledby="int-form-h">
          <div className="flex flex-col gap-1">
            <h2 id="int-form-h" className="m-0 text-base font-semibold">Install {draft.registry.title}</h2>
            <p className="text-sm text-muted-foreground">{draft.registry.description}</p>
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div className="flex flex-col gap-0.5"><dt className="text-xs text-muted-foreground">Publisher</dt><dd className="font-mono">{publisher(draft.registry.name)}</dd></div>
            <div className="flex flex-col gap-0.5"><dt className="text-xs text-muted-foreground">Type</dt><dd>{KIND[draft.registry.install.kind]}{draft.registry.version ? ` · ${draft.registry.version}` : ''}</dd></div>
            {draft.registry.repoUrl && <div className="flex flex-col gap-0.5"><dt className="text-xs text-muted-foreground">Source</dt><dd><a className="text-green underline-offset-4 hover:underline" href={draft.registry.repoUrl} target="_blank" rel="noreferrer">Repository</a></dd></div>}
          </dl>
          <span className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">{draft.registry.install.url ?? draft.registry.install.commandLine}</span>
          <div className="flex items-start gap-2.5 rounded-lg border border-border-strong bg-muted px-3.5 py-3 text-sm leading-relaxed" role="note">
            <span className="mt-0.5 shrink-0"><Icon name="warning" size={16} /></span>
            <span>From the public MCP Registry. The publisher's name is verified, but nobody, Tyslin included, has reviewed this server. {draft.registry.install.transport === 'stdio' ? 'It runs on this computer with your user account.' : 'Your agents send it data.'} Check the repository before connecting.</span>
          </div>
          <Field>
            <Label htmlFor="int-rname">Name your agents see</Label>
            <Input id="int-rname" className="font-mono" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          {draft.registry.install.fields.map((f) => (
            <Field key={fieldKey(f)}>
              <Label htmlFor={'int-f-' + fieldKey(f)} className="gap-1">
                <span className="font-mono">{f.name}</span>{f.target === 'header' ? ' header' : ''} {!f.required && <span className="font-normal text-muted-foreground">(optional)</span>}
              </Label>
              <Input id={'int-f-' + fieldKey(f)} className="font-mono" type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false}
                placeholder={f.placeholder ?? f.defaultValue ?? ''} value={draft.values[fieldKey(f)] ?? ''}
                onChange={(e) => setDraft({ ...draft, values: { ...draft.values, [fieldKey(f)]: e.target.value } })} />
              {f.description && <Hint>{f.description}</Hint>}
            </Field>
          ))}
          {draft.registry.install.fields.length === 0 && <Hint>It asks for nothing. If it needs a sign-in, the test below will say so.</Hint>}
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void save()}>{busy ? 'Installing…' : 'Install and test'}</Button>
            <Button variant="outline" onClick={() => { setDraft(null); setError('') }}>Cancel</Button>
          </div>
        </section>
      )}

      {draft && !draft.registry && (
        <section ref={formRef} className="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs" aria-labelledby="int-form-h">
          <div className="flex flex-col gap-1">
            <h2 id="int-form-h" className="m-0 text-base font-semibold">{draft.id ? `Edit ${draft.preset?.title ?? draft.name}` : draft.preset ? `Connect ${draft.preset.title}` : 'Add an MCP server'}</h2>
            <p className="text-sm text-muted-foreground">{draft.preset ? <>{draft.preset.line} <a className="text-green underline-offset-4 hover:underline" href={draft.preset.docsUrl} target="_blank" rel="noreferrer">Setup guide</a></> : 'Any MCP server: a remote address, or a command that runs on this computer.'}</p>
          </div>
          {draft.preset ? (
            <Field>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="int-token">{draft.preset.tokenLabel}</Label>
                <a href={draft.preset.tokenUrl} target="_blank" rel="noreferrer" className="text-xs text-green underline-offset-4 hover:underline">Create one</a>
              </div>
              <Input id="int-token" type="password" className="font-mono" autoComplete="off" autoFocus value={draft.token}
                placeholder={draft.keepSecrets ? '•••••••• saved (type to replace)' : draft.preset.tokenPlaceholder} onChange={(e) => setDraft({ ...draft, token: e.target.value })} />
              <Hint>{draft.preset.tokenHint}</Hint>
            </Field>
          ) : (
            <>
              <Field>
                <Label htmlFor="int-name">Name</Label>
                <Input id="int-name" className="font-mono" value={draft.name} placeholder="e.g. deepwiki" autoFocus onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <Hint>Your agents see its tools under this name. Lowercase letters, digits and dashes.</Hint>
              </Field>
              <ToggleGroup type="single" spacing={1} value={draft.transport} aria-label="How the server runs"
                onValueChange={(v) => { if (v) setDraft({ ...draft, transport: v as typeof draft.transport }) }}
                className="h-9 flex-wrap gap-0.5 rounded-lg bg-accent p-[3px] text-muted-foreground">
                {([['http', 'Remote address'], ['stdio', 'Command on this computer']] as const).map(([v, label]) => (
                  <ToggleGroupItem key={v} value={v}
                    className="h-full rounded-md px-3 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs">{label}</ToggleGroupItem>
                ))}
              </ToggleGroup>
              {draft.transport === 'http' ? (
                <>
                  <Field>
                    <Label htmlFor="int-url">Server address</Label>
                    <Input id="int-url" className="font-mono" value={draft.url} placeholder="https://example.com/mcp" onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
                  </Field>
                  <Field>
                    <Label htmlFor="int-headers" className="gap-1">Headers <span className="font-normal text-muted-foreground">(optional, one per line)</span></Label>
                    <Textarea id="int-headers" className="font-mono" rows={2} value={draft.headers} spellCheck={false}
                      placeholder={draft.keepSecrets ? 'Saved. Type to replace all headers.' : 'Authorization: Bearer your-token'} onChange={(e) => setDraft({ ...draft, headers: e.target.value })} />
                  </Field>
                </>
              ) : (
                <>
                  <Field>
                    <Label htmlFor="int-cmd">Command</Label>
                    <Input id="int-cmd" className="font-mono" value={draft.commandLine} placeholder="npx -y some-mcp-server" spellCheck={false} onChange={(e) => setDraft({ ...draft, commandLine: e.target.value })} />
                    <Hint>Runs with your user account each time an agent starts. Only add commands from sources you trust.</Hint>
                  </Field>
                  <Field>
                    <Label htmlFor="int-env" className="gap-1">Environment variables <span className="font-normal text-muted-foreground">(optional, one per line)</span></Label>
                    <Textarea id="int-env" className="font-mono" rows={2} value={draft.env} spellCheck={false}
                      placeholder={draft.keepSecrets ? 'Saved. Type to replace all variables.' : 'API_TOKEN=your-token'} onChange={(e) => setDraft({ ...draft, env: e.target.value })} />
                  </Field>
                </>
              )}
            </>
          )}
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : draft.id ? 'Save and test' : 'Connect and test'}</Button>
            <Button variant="outline" onClick={() => { setDraft(null); setError('') }}>Cancel</Button>
          </div>
        </section>
      )}

      {list && list.length > 0 && (
        <Card role="region" className="gap-0 overflow-hidden py-0" aria-labelledby="int-list-h">
          <div className="flex flex-col gap-1 px-5 pt-[18px] pb-3">
            <h2 id="int-list-h" className="m-0 text-base font-semibold">Connected</h2>
            <span className="text-xs text-muted-foreground">{team ? `Switch a server on for each agent in ${team.name} that should use it.` : 'Open an agency to switch a server on for its agents.'}</span>
          </div>
          <div className="overflow-x-auto">
            <Table aria-label="Connected integrations">
              <TableHeader className="bg-muted/60">
                <TableRow className="border-y border-border">
                  <TableHead scope="col" className={TH}>Server</TableHead>
                  <TableHead scope="col" className={TH}>Last test</TableHead>
                  {team ? team.members.map((a) => (
                    <TableHead key={a.id} scope="col" className={TH}>
                      <span className="flex items-center gap-2">
                        <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={24} />
                        <span className="flex flex-col">
                          <span className="font-medium text-foreground">{a.name}</span>
                          <span className="font-mono text-[11px] font-normal">{canUse(a) ? runsOnLabel(a) : 'Built-in model: not yet'}</span>
                        </span>
                      </span>
                    </TableHead>
                  )) : <TableHead scope="col" className={TH}>Used by</TableHead>}
                  <TableHead scope="col" className={cn(TH, 'w-px')}><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              {list.map((s) => {
                const t = s.lastTest
                const users = agents.filter((a) => s.agentIds.includes(a.id))
                const failed = t && !t.ok && testing !== s.id
                const tools = t?.ok && t.tools && t.tools.length > 0
                return (
                  <TableBody key={s.id} className="border-b border-border last:border-b-0">
                    <TableRow>
                      <TableCell className={TD}>
                        <span className="flex items-center gap-3">
                          <Tile>{initials(titleOf(s))}</Tile>
                          <span className="flex min-w-0 flex-col">
                            <strong id={'int-' + s.id} className="font-semibold">{titleOf(s)}</strong>
                            <span className="max-w-[340px] truncate font-mono text-xs text-muted-foreground">{s.source ? `${publisher(s.source)} · ` : ''}{s.transport === 'http' ? s.url : [s.command, ...s.args].join(' ')}</span>
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className={TD}>
                        {testing === s.id ? <Badge variant="soft">Testing…</Badge>
                          : !t ? <Badge variant="secondary">Not tested</Badge>
                          : t.ok ? <Badge variant="soft">Working · {t.tools?.length ?? 0} tools</Badge>
                          : <Badge variant="destructive">Not working</Badge>}
                      </TableCell>
                      {team ? team.members.map((a) => {
                        const on = s.agentIds.includes(a.id)
                        const ok = canUse(a)
                        return (
                          <TableCell key={a.id} className={TD}>
                            <Switch checked={on && ok} aria-label={`${a.name} uses ${titleOf(s)}`} disabled={!ok} onCheckedChange={() => void toggle(s, a)} />
                          </TableCell>
                        )
                      }) : (
                        <TableCell className={cn(TD, 'text-muted-foreground')}>{users.length ? `Used by ${users.map((a) => a.name).join(', ')}.` : 'Not used by any agent yet. Open an agency to switch it on for its agents.'}</TableCell>
                      )}
                      <TableCell className={TD}>
                        <span className="flex gap-1">
                          <Button variant="outline" size="sm" disabled={testing === s.id} onClick={() => void test(s.id)}>Test</Button>
                          <Button variant="ghost" size="sm" onClick={() => edit(s)}>Edit</Button>
                          <Button variant="ghost" size="sm" onClick={() => void remove(s)}>Remove</Button>
                        </span>
                      </TableCell>
                    </TableRow>
                    {(failed || tools) && (
                      <TableRow>
                        <TableCell colSpan={cols} className="px-4 pb-3">
                          {failed && <ErrorText>{t.error}</ErrorText>}
                          {tools && (
                            <Collapsible className="group">
                              <CollapsibleTrigger className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40">
                                <ChevronRightIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                                Tools it gives your agents
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 flex flex-wrap gap-1.5">{t.tools!.map((n) => <Badge key={n} variant="outline" className="font-mono">{n}</Badge>)}</CollapsibleContent>
                            </Collapsible>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                )
              })}
            </Table>
          </div>
          {team && team.members.some((a) => !canUse(a)) && (
            <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Agents on the built-in models don't use integrations yet.</p>
          )}
        </Card>
      )}

      <section aria-labelledby="int-add-h" className="flex flex-col gap-3">
        <h2 id="int-add-h" className="m-0 text-base font-semibold">{list && list.length ? 'Add another' : 'Add your first integration'}</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {presets.map((p) => (
            <button key={p.id} type="button" className={PRESET} disabled={added.has(p.id)} onClick={() => openDraft(blank(p))}>
              <span className="flex items-center justify-between gap-2">
                <Tile>{initials(p.title)}</Tile>
                {suggested?.presets.includes(p.id) && !added.has(p.id) && <Badge variant="soft">Suggested</Badge>}
              </span>
              <strong className="text-sm font-semibold">{p.title}</strong>
              <span className="text-[13px] leading-snug text-muted-foreground">{p.line}</span>
              <span className="mt-auto font-mono text-xs text-muted-foreground">{added.has(p.id) ? 'Connected' : `Needs ${p.tokenLabel.toLowerCase()}`}</span>
            </button>
          ))}
          <button type="button" className={cn(PRESET, 'border-dashed shadow-none')} onClick={() => openDraft(blank(null))}>
            <Tile><Icon name="plus" size={16} /></Tile>
            <strong className="text-sm font-semibold">Any MCP server</strong>
            <span className="text-[13px] leading-snug text-muted-foreground">A remote address or a local command, with its own headers or variables.</span>
            <span className="mt-auto font-mono text-xs text-muted-foreground">Custom</span>
          </button>
        </div>
      </section>

      <Card role="region" aria-labelledby="int-search-h" className="gap-3 p-5">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="int-search-h" className="m-0 text-base font-semibold">Search the MCP Registry</h2>
            <Badge variant="soft" className="font-mono">registry.modelcontextprotocol.io</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Thousands of servers published by companies and the community at registry.modelcontextprotocol.io. Most are community-made; check the publisher.</p>
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"><Icon name="search" size={16} /></span>
          <Input type="search" className="pl-9" aria-label="Search MCP servers" placeholder="Search an app, e.g. hubspot, notion, postgres" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {suggested && suggested.searches.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label={team ? `Suggested for ${team.name}` : 'Suggested'}>
            <span className="text-xs text-muted-foreground">{team ? `Suggested for ${team.name}:` : 'Suggested:'}</span>
            {suggested.searches.map((t) => {
              const on = query.trim().toLowerCase() === t
              return (
                <button key={t} type="button" aria-pressed={on} onClick={() => setQuery(t)}
                  className={cn('inline-flex h-8 items-center rounded-md border px-3 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40', on ? 'border-transparent bg-lime text-on-lime' : 'border-border bg-card hover:bg-accent')}>{t}</button>
              )
            })}
          </div>
        )}
        {searching && !results && <p className="text-sm text-muted-foreground" role="status">Searching…</p>}
        {searchError && <ErrorText>{searchError}</ErrorText>}
        {results && (
          results.servers.length === 0 ? <p className="text-sm text-muted-foreground">Nothing found for "{results.q}". Try the app's name, or add it as Any MCP server.</p> : (
            <ul className="flex flex-col gap-2" aria-label={`Results for ${results.q}`}>
              {ranked.map((r) => {
                const installed = addedSources.has(r.name)
                return (
                  <li key={r.name} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3.5 py-3 sm:flex-nowrap">
                    <Tile>{initials(r.title)}</Tile>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2"><strong className="text-sm font-semibold">{r.title}</strong>{r.install && <Badge variant="outline">{KIND[r.install.kind]}</Badge>}</span>
                      <span className="truncate font-mono text-xs text-muted-foreground">{publisher(r.name)}{r.version ? ` · ${r.version}` : ''}</span>
                      {r.description && <span className="line-clamp-2 text-[13px] text-muted-foreground">{r.description}</span>}
                      {!r.install && r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {r.repoUrl && <Button asChild variant="ghost" size="sm"><a href={r.repoUrl} target="_blank" rel="noreferrer">Source</a></Button>}
                      {installed ? <Badge variant="soft">Installed</Badge>
                        : <Button size="sm" disabled={!r.install} onClick={() => openDraft({ ...blank(null), registry: r, name: slugOf(r.title) || slugOf(r.name.split('/').pop() ?? '') })}>Install</Button>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        )}
        {results?.next && <Button variant="outline" className="self-start" disabled={searching} onClick={() => void more()}>{searching ? 'Loading…' : 'Show more'}</Button>}
      </Card>
    </div>
  )
}

const TH = 'h-auto px-4 py-2.5 align-bottom text-xs font-medium text-muted-foreground'
const TD = 'px-4 py-3 whitespace-normal'
const PRESET = 'flex min-h-[44px] flex-col items-stretch gap-2 rounded-xl border border-border bg-card p-4 text-left text-foreground shadow-xs outline-none transition-colors hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-default disabled:opacity-60 disabled:hover:border-border'

function Field({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="flex flex-col gap-1.5">{children}</div>
}
function Hint({ children }: { children: React.ReactNode }): JSX.Element {
  return <span className="text-xs leading-relaxed text-muted-foreground">{children}</span>
}
function ErrorText({ children }: { children: React.ReactNode }): JSX.Element {
  return <Alert variant="destructive" className="border-destructive/30 bg-destructive-soft py-2"><AlertDescription>{children}</AlertDescription></Alert>
}
/** A lettered tile standing in for an app's logo. */
function Tile({ children }: { children: React.ReactNode }): JSX.Element {
  return <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-muted text-sm font-bold text-foreground" aria-hidden="true">{children}</span>
}
