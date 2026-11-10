import { useEffect, useState } from 'react'
import type { Agent, ClaudeSkill, Skill, SkillInput, SkillPack, SkillPackSearch } from '@shared/types'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const errorText = (err: unknown): string => (err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
const toSlug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 64)
const CLAUDE_PACK = 'anthropic-skills'
const HINT = 'text-xs text-muted-foreground'
const BLANK: SkillInput = { name: '', description: '', body: '' }

type Open = { kind: 'skill'; skill: SkillInput } | { kind: 'packs' } | null

/** Skills: the ones this agency's agents use, then every other skill; Open edits one in a sheet, Browse opens the packs. */
export function SkillsTab({ view, agents, onAgentsChanged }: { view: AgencyView; agents: Agent[]; onAgentsChanged: () => void }): JSX.Element {
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [open, setOpen] = useState<Open>(null)
  const [notice, setNotice] = useState('')
  const team = [view.lead, ...view.workers].filter((a): a is Agent => !!a)
  const load = (): void => { void window.tyslin.skills.list().then(setSkills) }
  useEffect(load, [])
  const users = (s: Skill): Agent[] => team.filter((a) => a.skills.includes(s.name))
  const used = (skills ?? []).filter((s) => users(s).length > 0)
  const rest = (skills ?? []).filter((s) => users(s).length === 0)
  const importFiles = async (): Promise<void> => {
    try { const r = await window.tyslin.skills.importFiles(); setNotice(r.imported.length ? `Imported ${r.imported.length}.${r.skipped.length ? ` Skipped: ${r.skipped.join('; ')}` : ''}` : r.skipped.join('; ')); load() } catch (e) { setNotice(errorText(e)) }
  }
  const row = (s: Skill): JSX.Element => (
    <div key={s.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span className="flex min-w-[220px] flex-1 flex-col gap-0.5"><strong className="font-mono text-[13.5px] font-medium">{s.name}</strong><span className={HINT}>{s.description}</span></span>
      <span className="flex items-center">{users(s).map((a, i) => <span key={a.id} className={cn(i > 0 && '-ml-1')} title={a.name}><Avatar shape={a.shape} tone={a.tone} head={a.head} size={22} /></span>)}</span>
      {s.packId && <Badge variant="secondary" className="font-mono text-[10.5px]">{s.packId === CLAUDE_PACK ? 'Claude' : 'pack'}</Badge>}
      <Button variant="ghost" size="sm" onClick={() => setOpen({ kind: 'skill', skill: s })}>Open</Button>
    </div>
  )
  return (
    <div className="flex flex-col gap-4">
      {used.length > 0 && <Card className="gap-0 overflow-hidden py-0">{used.map(row)}</Card>}
      {rest.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Not used in {view.agency.name} yet</span>
          <Card className="gap-0 overflow-hidden py-0">{rest.map(row)}</Card>
        </div>
      )}
      {skills && skills.length === 0 && <p className="text-[13px] text-muted-foreground">No skills yet.</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen({ kind: 'skill', skill: BLANK })}><Icon name="plus" size={12} /> New skill</Button>
        <Button variant="ghost" size="sm" onClick={() => void importFiles()}>Import a .md file</Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen({ kind: 'packs' })}>Browse skill packs</Button>
      </div>
      {notice && <p className={HINT} role="status">{notice}</p>}
      <Sheet open={!!open} onOpenChange={(o) => { if (!o) { setOpen(null); load() } }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[720px]">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle className="sr-only">Skills</SheetTitle>
            <SheetDescription className="sr-only">Edit a skill or browse skill packs.</SheetDescription>
            <TabsList aria-label="Skills"><TabsTrigger active={open?.kind === 'skill'} onClick={() => setOpen((o) => (o?.kind === 'skill' ? o : { kind: 'skill', skill: BLANK }))}>Skill</TabsTrigger><TabsTrigger active={open?.kind === 'packs'} onClick={() => setOpen({ kind: 'packs' })}>Skill packs</TabsTrigger></TabsList>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {open?.kind === 'skill' && <SkillEditor key={open.skill.id ?? 'new'} skill={open.skill} team={team} agencyName={view.agency.name} onSaved={(s) => { setOpen({ kind: 'skill', skill: s }); load() }} onDeleted={() => { setOpen(null); load() }} onAgentsChanged={onAgentsChanged} />}
            {open?.kind === 'packs' && <Packs installed={new Map((skills ?? []).map((s) => [s.name, s]))} onChanged={load} onEdit={(s) => setOpen({ kind: 'skill', skill: s })} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

/** The skill edited in place: name, use, Markdown body (40,000 cap), who uses it (saves straight away), export, delete. */
function SkillEditor({ skill, team, agencyName, onSaved, onDeleted, onAgentsChanged }: { skill: SkillInput; team: Agent[]; agencyName: string; onSaved: (s: Skill) => void; onDeleted: () => void; onAgentsChanged: () => void }): JSX.Element {
  const [form, setForm] = useState<SkillInput>(skill)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [agentsLocal, setAgentsLocal] = useState(team)
  const dirty = form.name !== skill.name || form.description !== skill.description || form.body !== skill.body
  const save = async (): Promise<void> => {
    setBusy(true); setError('')
    try { onSaved(await window.tyslin.skills.save({ ...form, name: form.name.replace(/-+$/, '') })) } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const remove = async (): Promise<void> => {
    if (!skill.id || !window.confirm(`Delete ${skill.name}?`)) return
    setBusy(true); setError('')
    try { await window.tyslin.skills.remove(skill.id); onDeleted() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const toggle = async (a: Agent): Promise<void> => {
    if (!skill.id) return
    const on = a.skills.includes(skill.name)
    const next = { ...a, skills: on ? a.skills.filter((n) => n !== skill.name) : [...a.skills, skill.name] }
    setAgentsLocal((l) => l.map((x) => (x.id === a.id ? next : x)))
    try { await window.tyslin.agents.save(next); onAgentsChanged() } catch (e) { setError(errorText(e)) }
  }
  return (
    <form className="flex flex-col gap-4 px-5 py-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <h2 className="font-mono text-lg font-medium">{form.name || 'New skill'}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="sk-name">Name</Label><Input id="sk-name" className="font-mono" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: toSlug(e.target.value) }))} placeholder="meeting-notes" autoFocus={!skill.id} /><span className={HINT}>Lower case and dashes.</span></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="sk-desc">When to use it</Label><Input id="sk-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What this skill helps an agent do" /></div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between"><Label htmlFor="sk-body">Instructions (Markdown)</Label><span className="font-mono text-xs text-muted-foreground">{form.body.length.toLocaleString()} / 40,000</span></span>
        <Textarea id="sk-body" rows={12} className="font-mono text-[12.5px]" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder={'What to produce, in what structure, and what to avoid.'} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium">Who uses it in {agencyName}</span>
        {agentsLocal.map((a) => (
          <span key={a.id} className="flex min-h-9 items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2"><Avatar shape={a.shape} tone={a.tone} head={a.head} size={22} />{firstName(a.name)} <span className={HINT}>{a.description}</span></span>
            <Switch checked={!!skill.id && a.skills.includes(skill.name)} disabled={!skill.id || dirty} aria-label={`${a.name} uses this skill`} onCheckedChange={() => void toggle(a)} />
          </span>
        ))}
        <span className={HINT}>{!skill.id ? 'Save the skill first, then switch it on.' : dirty ? 'Save your changes to switch agents on or off.' : 'Switches save straight away.'}</span>
      </div>
      {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
        <span className="flex gap-1">{skill.id && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void window.tyslin.skills.exportFile(skill.id!)}>Export .md</Button>}{skill.id && <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => void remove()}>Delete</Button>}</span>
        <Button type="submit" disabled={busy || !form.name || !form.body.trim() || (!!skill.id && !dirty)}>{busy ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  )
}

/** Featured packs, Anthropic's catalogue by licence, and GitHub repos tagged agent-skills. Install, update, uninstall. */
function Packs({ installed, onChanged, onEdit }: { installed: Map<string, Skill>; onChanged: () => void; onEdit: (s: Skill) => void }): JSX.Element {
  const [packs, setPacks] = useState<SkillPack[] | null>(null)
  const [catalog, setCatalog] = useState<ClaudeSkill[] | null>(null)
  const [found, setFound] = useState<SkillPackSearch | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    void window.tyslin.skillPacks.list().then(setPacks)
    void window.tyslin.skillPacks.check().then(setPacks).catch(() => undefined)
    void window.tyslin.skillPacks.claudeCatalog().then(setCatalog).catch((e) => setError(errorText(e)))
  }, [])
  const act = async (id: string, fn: () => Promise<unknown>): Promise<void> => { setBusy(id); setError(''); try { await fn(); setPacks(await window.tyslin.skillPacks.list()); onChanged() } catch (e) { setError(errorText(e)) } finally { setBusy(null) } }
  const search = async (): Promise<void> => { try { setFound(await window.tyslin.skillPacks.discover(q.trim(), 1)) } catch (e) { setError(errorText(e)) } }
  const packCard = (p: SkillPack): JSX.Element => (
    <Card key={p.id} className="gap-2 px-4 py-3.5">
      <span className="flex items-start justify-between gap-2"><strong className="text-sm font-semibold">{p.name}</strong><Badge variant="outline">{p.license || 'no licence'}</Badge></span>
      <span className={HINT}>{[p.author, p.stars !== undefined && `${p.stars} stars`, p.installed && `${p.skillCount} installed`].filter(Boolean).join(' · ')}</span>
      {p.description && <span className="line-clamp-2 text-[13px]">{p.description}</span>}
      {p.blockedReason && <span className={HINT}>{p.blockedReason}</span>}
      <span className="flex items-center gap-1.5">
        {p.installed && <Badge variant="soft">Installed</Badge>}
        {!p.installed && p.installable && <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => void act(p.id, () => window.tyslin.skillPacks.install(p.id))}>Install</Button>}
        {p.installed && p.updateAvailable && <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => void act(p.id, () => window.tyslin.skillPacks.install(p.id))}>Update</Button>}
        {p.installed && <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => void act(p.id, () => window.tyslin.skillPacks.uninstall(p.id))}>Uninstall</Button>}
        <a href={p.url} target="_blank" rel="noreferrer" className="ml-auto text-xs text-green underline-offset-2 hover:underline">GitHub</a>
      </span>
    </Card>
  )
  const featured = (packs ?? []).filter((p) => p.featured && p.group !== 'claude')
  return (
    <div className="flex flex-col gap-5 px-5 py-4">
      <div className="flex flex-col gap-2"><span className="font-mono text-[11px] tracking-[0.08em] text-green uppercase">Featured packs · installed from GitHub, not bundled</span><div className="grid gap-2.5 sm:grid-cols-2">{featured.map(packCard)}</div></div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] tracking-[0.08em] text-green uppercase">Claude skills · github.com/anthropics/skills</span>
        {!catalog && !error && <span className={HINT}>Loading from GitHub…</span>}
        {catalog && (
          <Card className="gap-0 overflow-hidden py-0">
            {catalog.map((c) => {
              const mine = installed.get(c.name)
              return (
                <div key={c.folder} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                  <span className="min-w-[160px] flex-1 font-mono text-[13px]">{c.name}</span>
                  <Badge variant={c.license === 'Apache-2.0' ? 'outline' : 'secondary'}>{c.license === 'Apache-2.0' ? 'Apache 2.0' : c.license === 'source-available' ? 'Source-available' : 'No licence'}</Badge>
                  {mine ? <Button size="sm" variant="ghost" onClick={() => onEdit(mine)}>Installed · edit</Button> : c.installable ? <span className={HINT}>Installs with the pack above</span> : <a href={c.url} target="_blank" rel="noreferrer" className="text-xs text-green underline-offset-2 hover:underline">View on GitHub</a>}
                </div>
              )
            })}
          </Card>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] tracking-[0.08em] text-green uppercase">More on GitHub · repos tagged agent-skills</span>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void search() }}><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search repos tagged agent-skills…" aria-label="Search GitHub" /><Button type="submit" variant="outline">Search</Button></form>
        {found && <div className="grid gap-2.5 sm:grid-cols-2">{found.packs.map(packCard)}</div>}
        {found && found.packs.length === 0 && <span className={HINT}>Nothing found.</span>}
      </div>
      {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
    </div>
  )
}
