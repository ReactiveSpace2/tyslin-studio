import { useEffect, useRef, useState } from 'react'
import type { Agent, McpServerInfo, McpServerInput, RegistryServer } from '@shared/types'
import { AGENCY_INTEGRATIONS } from '@shared/agencyIntegrations'
import { MCP_PRESETS, type McpPreset } from '@shared/mcpPresets'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const HINT = 'text-xs text-muted-foreground'
const titleOf = (s: McpServerInfo): string => s.title || (MCP_PRESETS.find((p) => p.id === s.preset)?.title ?? s.name)
/** The verified namespace of a registry name: "io.github.owner/x" → "github.com/owner", "com.example/x" → "example.com". */
const publisher = (name: string): string => { const ns = name.split('/')[0] ?? ''; return ns.startsWith('io.github.') ? 'github.com/' + ns.slice('io.github.'.length) : ns.split('.').reverse().join('.') }
const canUse = (a: Agent): boolean => a.engine !== 'builtin'
const slugOf = (s: string): string => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
const when = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** Connectors: the MCP servers this agency's workers can call, with their test state. Add opens the dialog; Edit the sheet-like dialog. */
export function ConnectorsTab({ view }: { view: AgencyView }): JSX.Element {
  const [list, setList] = useState<McpServerInfo[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<McpServerInfo | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const team = [view.lead, ...view.workers].filter((a): a is Agent => !!a)
  const load = (): void => { void window.tyslin.integrations.list().then(setList).catch((e) => setError(errText(e))) }
  useEffect(load, [])
  const mine = (list ?? []).filter((s) => s.agentIds.some((id) => team.some((a) => a.id === id)) || s.agentIds.length === 0)
  const test = async (id: string): Promise<void> => { setTesting(id); try { const r = await window.tyslin.integrations.test(id); setList((l) => (l ?? []).map((x) => (x.id === r.id ? r : x))) } catch (e) { setError(errText(e)) } finally { setTesting(null) } }

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-0 overflow-hidden py-0">
        {list === null && <span className="px-4 py-3 text-[13px] text-muted-foreground">Loading…</span>}
        {list !== null && mine.length === 0 && <span className="px-4 py-4 text-[13px] text-muted-foreground">No connectors yet. Workers on Claude Code, Codex or Gemini CLI can use them; the Lead can't yet.</span>}
        {mine.map((s) => {
          const t = s.lastTest
          const who = team.filter((a) => s.agentIds.includes(a.id))
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <span className="grid size-9 flex-none place-items-center rounded-lg border border-border bg-muted text-xs font-bold">{titleOf(s).slice(0, 1).toUpperCase()}</span>
              <span className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                <strong className="text-sm font-semibold">{titleOf(s)}</strong>
                <span className={cn(HINT, t && !t.ok && 'text-destructive')}>{t ? (t.ok ? `${t.tools?.length ?? 0} tools · tested ${when(t.at)}` : `Test failed: ${t.error ?? 'no answer'}`) : s.transport === 'http' ? s.url : [s.command, ...s.args].join(' ')}</span>
              </span>
              <span className="w-[140px] truncate text-xs text-muted-foreground">{who.length ? who.map((a) => firstName(a.name)).join(', ') : 'Nobody yet'}</span>
              {t ? <Badge variant={t.ok ? 'soft' : 'destructive'}>{t.ok ? 'Connected' : 'Test failed'}</Badge> : <Badge variant="secondary">Not tested</Badge>}
              <Button variant="ghost" size="sm" disabled={testing === s.id} onClick={() => void test(s.id)}>{testing === s.id ? 'Testing…' : t && !t.ok ? 'Test again' : 'Test'}</Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>Edit</Button>
            </div>
          )
        })}
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}><Icon name="plus" size={12} /> Add a connector</Button>
        <span className={HINT}>GitHub, Linear, Stripe, anything from the MCP registry, or your own server. Each needs your token; nothing is connected for you.</span>
      </div>
      {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
      {adding && <ConnectorDialog view={view} team={team} onClose={() => setAdding(false)} onSaved={(s) => { setAdding(false); setList((l) => [...(l ?? []), s]); void test(s.id) }} />}
      {editing && <EditConnectorDialog server={editing} team={team} onClose={() => setEditing(null)} onChanged={(s) => { if (s) setList((l) => (l ?? []).map((x) => (x.id === s.id ? s : x))); else setList((l) => (l ?? []).filter((x) => x.id !== editing.id)); setEditing(null) }} />}
    </div>
  )
}

type Source = 'suggested' | 'registry' | 'own'

/** Add a connector: a suggested preset, a server from the MCP registry (publisher and repo shown), or your own; token, then which agents. */
function ConnectorDialog({ view, team, onClose, onSaved }: { view: AgencyView; team: Agent[]; onClose: () => void; onSaved: (s: McpServerInfo) => void }): JSX.Element {
  const suggested = AGENCY_INTEGRATIONS[view.agency.templateId]
  const presets = [...MCP_PRESETS].sort((a, b) => Number(suggested?.presets.includes(b.id) ?? 0) - Number(suggested?.presets.includes(a.id) ?? 0))
  const [source, setSource] = useState<Source>('suggested')
  const [preset, setPreset] = useState<McpPreset | null>(presets[0] ?? null)
  const [registry, setRegistry] = useState<RegistryServer | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [query, setQuery] = useState(suggested?.searches[0] ?? '')
  const [results, setResults] = useState<RegistryServer[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [own, setOwn] = useState<{ name: string; transport: 'http' | 'stdio'; url: string; commandLine: string; headers: string; env: string }>({ name: '', transport: 'http', url: '', commandLine: '', headers: '', env: '' })
  const [token, setToken] = useState('')
  const [agentIds, setAgentIds] = useState<string[]>(team.filter(canUse).map((a) => a.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (source !== 'registry') return
    const q = query.trim()
    if (!q) { setResults(null); return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setSearching(true); window.tyslin.integrations.search(q).then((r) => setResults(r.servers)).catch((e) => setError(errText(e))).finally(() => setSearching(false)) }, 350)
  }, [query, source])

  const input = (): McpServerInput => {
    if (source === 'suggested') { if (!preset) throw new Error('Pick a connector.'); return { name: preset.name, preset: preset.id, transport: 'http', url: preset.url, token, agentIds } }
    if (source === 'registry') {
      if (!registry?.install) throw new Error('Pick a server from the list.')
      const inst = registry.install
      const val = (f: { target: string; name: string; header?: string; defaultValue?: string }): string => (values[`${f.target}:${f.header ?? ''}:${f.name}`] ?? '').trim() || f.defaultValue || ''
      for (const f of inst.fields) if (f.required && !val(f)) throw new Error(`Fill in ${f.name}.`)
      const name = slugOf(registry.name.split('/').pop() ?? registry.title)
      if (inst.transport === 'http') {
        let url = inst.url ?? ''
        for (const f of inst.fields.filter((x) => x.target === 'url-var')) url = url.split(`{${f.name}}`).join(val(f))
        const lines: string[] = []
        for (const f of inst.fields.filter((x) => x.target === 'header')) { const v = val(f); if (v) lines.push(`${f.name}: ${f.name.toLowerCase() === 'authorization' && !/^\S+\s/.test(v) ? 'Bearer ' + v : v}`) }
        const templated = new Map<string, string>()
        for (const f of inst.fields.filter((x) => x.target === 'header-var')) { const t = templated.get(f.header!) ?? f.template!; templated.set(f.header!, t.split(`{${f.name}}`).join(val(f))) }
        for (const [h, v] of templated) if (!/\{[^}]+\}/.test(v) && v.trim()) lines.push(`${h}: ${v}`)
        return { name, title: registry.title, source: registry.name, preset: '', transport: 'http', url, headers: lines.join('\n'), agentIds }
      }
      const env = inst.fields.filter((x) => x.target === 'env' && val(x)).map((f) => `${f.name}=${val(f)}`)
      return { name, title: registry.title, source: registry.name, preset: '', transport: 'stdio', commandLine: inst.commandLine, env: env.join('\n'), agentIds }
    }
    if (!own.name.trim()) throw new Error('Name the server.')
    return { name: slugOf(own.name), preset: '', transport: own.transport, url: own.url, commandLine: own.commandLine, headers: own.headers, env: own.env, agentIds }
  }
  const save = async (): Promise<void> => { setBusy(true); setError(''); try { onSaved(await window.tyslin.integrations.save(input())) } catch (e) { setError(errText(e)); setBusy(false) } }
  const field = (f: RegistryServer['install'] extends infer I ? (I extends { fields: (infer F)[] } ? F : never) : never): JSX.Element => {
    const key = `${f.target}:${f.header ?? ''}:${f.name}`
    return (
      <div key={key} className="flex flex-col gap-1.5">
        <Label htmlFor={`rf-${key}`}>{f.name}{f.required ? '' : ' (optional)'}</Label>
        <Input id={`rf-${key}`} type={f.secret ? 'password' : 'text'} className={cn(f.secret && 'font-mono')} value={values[key] ?? ''} placeholder={f.placeholder ?? f.defaultValue} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
        {f.description && <span className={HINT}>{f.description}</span>}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100%-48px)] w-[680px] max-w-[calc(100%-32px)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[calc(100%-32px)]">
        <DialogHeader className="px-6 pt-6 pb-3 text-left"><DialogTitle className="text-xl">Add a connector</DialogTitle><DialogDescription className="sr-only">Connect an MCP server for this agency's agents.</DialogDescription>
          <TabsList aria-label="Where from" className="mt-2 self-start"><TabsTrigger active={source === 'suggested'} onClick={() => setSource('suggested')}>Suggested</TabsTrigger><TabsTrigger active={source === 'registry'} onClick={() => setSource('registry')}>Search the registry</TabsTrigger><TabsTrigger active={source === 'own'} onClick={() => setSource('own')}>Your own server</TabsTrigger></TabsList>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-2">
            {source === 'suggested' && (
              <>
                <span className={HINT}>Picked for {view.agency.name}. Each one is copied from the company's own docs and needs your token.</span>
                {presets.map((p) => (
                  <button key={p.id} type="button" aria-pressed={preset?.id === p.id} onClick={() => setPreset(p)} className={cn('flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40', preset?.id === p.id ? 'border-primary ring-1 ring-primary' : 'border-border')}>
                    <span className="grid size-9 flex-none place-items-center rounded-lg border border-border bg-muted text-xs font-bold">{p.title.slice(0, 1)}</span>
                    <span className="flex min-w-0 flex-1 flex-col"><strong className="text-sm font-semibold">{p.title}{suggested?.presets.includes(p.id) && <Badge variant="soft" className="ml-2 h-[18px] px-1.5 text-[10.5px]">Suggested</Badge>}</strong><span className={HINT}>{p.line}</span></span>
                    <span className="font-mono text-xs text-muted-foreground">{p.url.replace(/^https:\/\//, '')}</span>
                  </button>
                ))}
                {preset && (
                  <div className="flex flex-col gap-1.5"><span className="flex items-center justify-between"><Label htmlFor="cn-token">{preset.tokenLabel}</Label><a href={preset.tokenUrl} target="_blank" rel="noreferrer" className="text-xs text-green underline-offset-2 hover:underline">Create one</a></span><Input id="cn-token" type="password" className="font-mono" autoComplete="off" value={token} placeholder={preset.tokenPlaceholder} onChange={(e) => setToken(e.target.value)} /><span className={HINT}>{preset.tokenHint} Encrypted on this computer.</span></div>
                )}
              </>
            )}
            {source === 'registry' && (
              <>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the official MCP registry…" aria-label="Search the MCP registry" autoFocus />
                {suggested && <span className="flex flex-wrap items-center gap-1.5"><span className={HINT}>Try:</span>{suggested.searches.map((s) => <button key={s} type="button" className="rounded-md border border-border bg-card px-2 py-0.5 text-xs hover:border-border-strong" onClick={() => setQuery(s)}>{s}</button>)}</span>}
                {searching && <span className={HINT}>Searching…</span>}
                <div className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
                  {(results ?? []).map((r) => (
                    <button key={r.name} type="button" disabled={!r.install} aria-pressed={registry?.name === r.name} onClick={() => { setRegistry(r); setValues({}) }} className={cn('flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50', registry?.name === r.name ? 'border-primary ring-1 ring-primary' : 'border-border')}>
                      <span className="flex min-w-0 flex-1 flex-col"><strong className="text-sm font-semibold">{r.title}</strong><span className={HINT}>{r.description}</span><span className="text-xs">publisher <span className="font-mono">{publisher(r.name)}</span>{r.repoUrl && <> · <a href={r.repoUrl} target="_blank" rel="noreferrer" className="text-green underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>repository</a></>}</span></span>
                      <Badge variant="outline">{r.install ? r.install.kind : 'not installable'}</Badge>
                    </button>
                  ))}
                  {results && results.length === 0 && <span className={HINT}>Nothing matches.</span>}
                </div>
                <Alert className="border-transparent bg-destructive-soft text-[13px]"><AlertDescription><strong>Unreviewed.</strong> Registry servers are published by anyone. Check the publisher and the repository before you add a token.</AlertDescription></Alert>
                {registry?.install && registry.install.fields.map(field)}
                {registry && !registry.install && <span className={HINT}>{registry.note ?? "This server needs arguments Tyslin can't set up here."}</span>}
              </>
            )}
            {source === 'own' && (
              <>
                <TabsList aria-label="Kind" className="self-start"><TabsTrigger active={own.transport === 'http'} onClick={() => setOwn((o) => ({ ...o, transport: 'http' }))}>Remote address</TabsTrigger><TabsTrigger active={own.transport === 'stdio'} onClick={() => setOwn((o) => ({ ...o, transport: 'stdio' }))}>Command on this computer</TabsTrigger></TabsList>
                <div className="flex flex-col gap-1.5"><Label htmlFor="own-name">Name agents see</Label><Input id="own-name" className="font-mono" value={own.name} onChange={(e) => setOwn((o) => ({ ...o, name: e.target.value }))} placeholder="my-tools" /></div>
                {own.transport === 'http' ? (
                  <>
                    <div className="flex flex-col gap-1.5"><Label htmlFor="own-url">Address</Label><Input id="own-url" className="font-mono" value={own.url} onChange={(e) => setOwn((o) => ({ ...o, url: e.target.value }))} placeholder="https://mcp.example.com/mcp" /></div>
                    <div className="flex flex-col gap-1.5"><Label htmlFor="own-h">Headers, one per line</Label><Textarea id="own-h" rows={2} className="font-mono text-xs" value={own.headers} onChange={(e) => setOwn((o) => ({ ...o, headers: e.target.value }))} placeholder="Authorization: Bearer your-token" /></div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5"><Label htmlFor="own-cmd">Command</Label><Input id="own-cmd" className="font-mono" value={own.commandLine} onChange={(e) => setOwn((o) => ({ ...o, commandLine: e.target.value }))} placeholder="npx -y @acme/mcp-server" /><span className={HINT}>For example npx -y …, uvx …, or docker run -i --rm ….</span></div>
                    <div className="flex flex-col gap-1.5"><Label htmlFor="own-env">Environment variables, one per line</Label><Textarea id="own-env" rows={2} className="font-mono text-xs" value={own.env} onChange={(e) => setOwn((o) => ({ ...o, env: e.target.value }))} placeholder="API_TOKEN=your-token" /></div>
                  </>
                )}
              </>
            )}
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <span className="text-[13px] font-medium">Which agents can use it</span>
              {team.map((a) => {
                const ok = canUse(a)
                return (
                  <span key={a.id} className="flex min-h-9 items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2"><Avatar shape={a.shape} tone={a.tone} head={a.head} size={22} />{firstName(a.name)} <span className={HINT}>{ok ? a.description : 'Lead on the built-in model, no connectors yet'}</span></span>
                    <Switch checked={agentIds.includes(a.id)} disabled={!ok} aria-label={`${a.name} can use it`} onCheckedChange={(v) => setAgentIds((ids) => (v ? [...ids, a.id] : ids.filter((x) => x !== a.id)))} />
                  </span>
                )
              })}
            </div>
            {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
          </div>
          <DialogFooter className="border-t border-border px-6 py-4"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add and test'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Edit one connector: replace the token or headers, which agents use it, test, remove. */
function EditConnectorDialog({ server, team, onClose, onChanged }: { server: McpServerInfo; team: Agent[]; onClose: () => void; onChanged: (s: McpServerInfo | null) => void }): JSX.Element {
  const preset = MCP_PRESETS.find((p) => p.id === server.preset) ?? null
  const [token, setToken] = useState('')
  const [agentIds, setAgentIds] = useState(server.agentIds)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (): Promise<void> => {
    setBusy(true); setError('')
    try {
      let s = server
      if (token.trim()) s = await window.tyslin.integrations.save({ id: server.id, name: server.name, preset: server.preset, transport: server.transport, url: server.url, token: preset ? token : undefined, headers: !preset && server.transport === 'http' ? token : undefined, env: !preset && server.transport === 'stdio' ? token : undefined })
      s = await window.tyslin.integrations.setAgents(server.id, agentIds)
      onChanged(s)
    } catch (e) { setError(errText(e)); setBusy(false) }
  }
  const remove = async (): Promise<void> => { if (!window.confirm(`Remove ${titleOf(server)}? Agents stop using it and its saved token is deleted.`)) return; try { await window.tyslin.integrations.remove(server.id); onChanged(null) } catch (e) { setError(errText(e)) } }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[520px] max-w-[calc(100%-32px)] gap-4 rounded-2xl p-6 sm:max-w-[calc(100%-32px)]">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <DialogHeader className="text-left"><DialogTitle>{titleOf(server)}</DialogTitle><DialogDescription className="font-mono text-xs">{server.transport === 'http' ? server.url : [server.command, ...server.args].join(' ')}</DialogDescription></DialogHeader>
          <div className="flex flex-col gap-1.5"><Label htmlFor="ec-token">{preset ? preset.tokenLabel : server.transport === 'http' ? 'Headers, one per line' : 'Environment variables, one per line'}</Label>{preset || server.transport === 'stdio' ? <Input id="ec-token" type="password" className="font-mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder={server.secretNames.length ? '•••••• saved (type to replace)' : preset?.tokenPlaceholder} autoComplete="off" /> : <Textarea id="ec-token" rows={2} className="font-mono text-xs" value={token} onChange={(e) => setToken(e.target.value)} placeholder={server.secretNames.length ? 'Saved. Type to replace all.' : 'Authorization: Bearer your-token'} />}</div>
          <div className="flex flex-col gap-2"><span className="text-[13px] font-medium">Which agents can use it</span>{team.map((a) => <span key={a.id} className="flex min-h-9 items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Avatar shape={a.shape} tone={a.tone} head={a.head} size={22} />{firstName(a.name)}</span><Switch checked={agentIds.includes(a.id)} disabled={!canUse(a)} aria-label={`${a.name} can use it`} onCheckedChange={(v) => setAgentIds((ids) => (v ? [...ids, a.id] : ids.filter((x) => x !== a.id)))} /></span>)}</div>
          {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
          <DialogFooter className="justify-between sm:justify-between"><Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void remove()}>Remove</Button><span className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></span></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
