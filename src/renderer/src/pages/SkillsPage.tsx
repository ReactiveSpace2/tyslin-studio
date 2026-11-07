import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Agent, ClaudeSkill, Skill, SkillInput, SkillPack, SkillPackSearch } from '@shared/types'
import { Icon } from '../components/Icon'
import { Avatar } from '../components/Avatar'
import { runsOnLabel } from '../components/RunsOnBadge'
import { track } from '../activity'
import { Pose } from '../components/Pose'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/** Shared Tailwind pieces for this screen. */
const HINT = 'text-xs text-muted-foreground'
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4'
const SECTION_H = 'm-0 font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-muted-foreground'
const LINK = 'text-green underline underline-offset-2'
/** A list row: a real button, white with a thin border when selected. */
const itemClass = (on: boolean): string => cn(
  'flex min-h-11 w-full cursor-pointer flex-col items-stretch gap-1 rounded-lg border border-transparent px-3 py-2.5 text-left text-foreground outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
  on ? 'border-border bg-card shadow-xs' : 'hover:bg-accent'
)
const ErrorBox = ({ children }: { children: React.ReactNode }): JSX.Element => (
  <div role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">{children}</div>
)
/** The GitHub icon link in the corner of a card; sits above the card's Edit overlay. */
const SourceLink = ({ url, label }: { url: string; label: string }): JSX.Element => (
  <a href={url} target="_blank" rel="noreferrer" title={url.replace(/^https:\/\//, '')} aria-label={label}
    className="relative z-[1] -mt-2 -mr-2 inline-flex size-11 flex-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40">
    <Icon name="github" size={18} />
  </a>
)

const BLANK: SkillInput = { name: '', description: '', body: '' }

const errorText = (err: unknown): string =>
  err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)

const toSlug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 64)

/** The agency whose tab the Skills screen is open in: its name and its agents, the Lead first. */
export interface SkillsTeam {
  name: string
  members: Agent[]
}

interface EditorProps {
  skill: SkillInput
  /** What kind of skill this is, for the eyebrow. */
  source: string
  sourceUrl?: string
  agents: Agent[]
  team?: SkillsTeam
  onSaved: (s: Skill) => void
  onDeleted: () => void
  onDirty: (dirty: boolean) => void
  onAgentsChanged: () => void
}

/** The selected skill, edited in place: name, description, instructions and who in the agency uses it. */
function SkillPanel({ skill, source, sourceUrl, agents, team, onSaved, onDeleted, onDirty, onAgentsChanged }: EditorProps): JSX.Element {
  const [form, setForm] = useState<SkillInput>(skill)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const set = <K extends keyof SkillInput>(k: K, v: SkillInput[K]): void => { setForm((f) => ({ ...f, [k]: v })); setSaved(false) }
  const dirty = form.name !== skill.name || form.description !== skill.description || form.body !== skill.body
  useEffect(() => { onDirty(dirty) }, [dirty])

  const name = skill.name
  const usedBy = skill.id ? agents.filter((a) => a.skills.includes(name)) : []
  const elsewhere = team ? usedBy.filter((a) => !team.members.some((m) => m.id === a.id)) : usedBy

  const save = async (): Promise<void> => {
    setBusy(true); setError(null)
    try {
      const s = await window.tyslin.skills.save({ ...form, name: form.name.replace(/-+$/, '') })
      setSaved(true)
      onSaved(s)
    } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }
  const remove = async (): Promise<void> => {
    const who = usedBy.length ? ` It will be removed from ${usedBy.map((a) => a.name).join(', ')}.` : ''
    if (!skill.id || !window.confirm(`Delete ${skill.name}?${who}`)) return
    setBusy(true); setError(null)
    try { await window.tyslin.skills.remove(skill.id); onDeleted() } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }
  const exportFile = async (): Promise<void> => {
    if (!skill.id) return
    try { await window.tyslin.skills.exportFile(skill.id) } catch (err) { setError(errorText(err)) }
  }
  /** Attaches or detaches the skill on one agent; applies straight away. */
  const toggle = async (a: Agent): Promise<void> => {
    if (!skill.id) return
    const on = a.skills.includes(name)
    setSwitching(a.id); setError(null)
    try {
      await window.tyslin.agents.save({ ...a, skills: on ? a.skills.filter((n) => n !== name) : [...a.skills, name] })
      onAgentsChanged()
    } catch (err) { setError(errorText(err)) } finally { setSwitching(null) }
  }

  return (
    <form className="flex max-w-[980px] flex-col gap-[18px]" aria-labelledby="sk-title" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Badge variant="secondary">{source}</Badge>
          <h2 id="sk-title" className="m-0 font-mono text-[22px] font-medium [overflow-wrap:anywhere]">{form.name || 'Untitled skill'}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sourceUrl && (
            <Button asChild variant="outline">
              <a href={sourceUrl} target="_blank" rel="noreferrer" aria-label={`${skill.name} on GitHub (opens in your browser)`}>
                <Icon name="github" size={16} /> GitHub
              </a>
            </Button>
          )}
          {skill.id && <Button type="button" variant="outline" disabled={busy} onClick={() => void exportFile()}>Export .md</Button>}
          {skill.id && <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}>Delete</Button>}
          <Button type="submit" disabled={busy || !form.name || !form.body.trim() || (!!skill.id && !dirty)}>
            {busy ? 'Saving…' : 'Save skill'}
          </Button>
        </div>
      </header>
      {saved && !dirty && <span className="text-[13px] text-muted-foreground" role="status">Saved.</span>}
      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="s-name">Name</Label>
          <Input id="s-name" className="font-mono" value={form.name} onChange={(e) => set('name', toSlug(e.target.value))} placeholder="meeting-notes" autoFocus={!skill.id} />
          <span className={HINT}>Lowercase words joined by hyphens.</span>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="s-desc">One-line description</Label>
          <Input id="s-desc" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What this skill helps an agent do" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="s-body">Instructions</Label>
        <Textarea id="s-body" className="min-h-[180px] font-mono text-[13px]" rows={11} value={form.body} onChange={(e) => set('body', e.target.value)}
          placeholder={'What to produce, in what structure, and what to avoid.\nFive to eight short lines works well.'} />
        <span className={HINT}>{form.body.length.toLocaleString()} / 40,000 characters · added to the instructions of every agent that uses it</span>
      </div>

      <Card className="gap-0 overflow-hidden py-0" aria-labelledby="sk-users-h" role="region">
        <div className="flex flex-col gap-0.5 px-5 pt-4 pb-3">
          <h3 id="sk-users-h" className="m-0 text-sm font-semibold">{team ? `Who uses it in ${team.name}` : 'Who uses it'}</h3>
          <span className={HINT}>
            {!skill.id ? 'Save the skill first, then switch it on for your agents.'
              : team ? 'Switch an agent on or off. It applies straight away.'
              : usedBy.length ? `Used by ${usedBy.map((a) => a.name).join(', ')}.` : 'Not attached to any agent yet. Open an agency to switch it on for its agents.'}
          </span>
        </div>
        {team && team.members.map((a) => {
          const on = !!skill.id && a.skills.includes(name)
          return (
            <div key={a.id} className="flex min-h-11 items-center gap-3 border-t border-border px-5 py-2.5">
              <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={28} />
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-sm">
                <strong className="font-medium">{a.name}</strong>
                <span className="font-mono text-xs text-muted-foreground">{runsOnLabel(a)}</span>
              </span>
              <Switch checked={on} aria-label={`${a.name} uses ${name || 'this skill'}`}
                disabled={!skill.id || dirty || switching !== null} onCheckedChange={() => void toggle(a)} />
            </div>
          )
        })}
        {team && ((skill.id && dirty) || elsewhere.length > 0) && (
          <div className="flex flex-col gap-1 border-t border-border bg-muted px-5 py-2.5">
            {skill.id && dirty && <span className={HINT}>Save your changes to switch agents on or off.</span>}
            {elsewhere.length > 0 && <span className={HINT}>Also used by {elsewhere.map((a) => a.name).join(', ')} outside this agency.</span>}
          </div>
        )}
      </Card>
    </form>
  )
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

const formatStars = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n))

interface PackCardProps {
  pack: SkillPack
  busy: boolean
  onInstall: () => void
  onUninstall: () => void
}

/** A skill pack from GitHub: install, update to the latest commit, or uninstall. */
function PackCard({ pack, busy, onInstall, onUninstall }: PackCardProps): JSX.Element {
  const status = busy ? 'Working…'
    : !pack.installable ? 'No licence'
    : !pack.installed ? 'Not installed'
    : pack.updateAvailable ? 'Update available'
    : `${plural(pack.skillCount, 'skill')} installed`
  return (
    <Card className="min-h-40 gap-3 px-5 py-5" aria-busy={busy}>
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-0.5">
          <strong className="text-base font-semibold [overflow-wrap:anywhere]">{pack.name}</strong>
          <span className="font-mono text-xs text-muted-foreground">
            {[pack.author, pack.license || 'no licence', pack.stars !== undefined && `${formatStars(pack.stars)} stars`].filter(Boolean).join(' · ')}
          </span>
        </span>
        <SourceLink url={pack.url} label={`${pack.name} on GitHub (opens in your browser)`} />
      </span>
      <p className="m-0 line-clamp-3 text-sm leading-relaxed" title={pack.description}>{pack.description || 'No description'}</p>
      {pack.blockedReason && <span className={HINT}>{pack.blockedReason}</span>}
      {pack.checkError && pack.installed && <span className={HINT}>Couldn't check for updates: {pack.checkError}</span>}
      <span className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="truncate font-mono text-xs text-muted-foreground" role="status">{status}</span>
        <span className="flex flex-none gap-1.5">
          {!pack.installed && pack.installable && <Button type="button" size="sm" disabled={busy} onClick={onInstall}>Install</Button>}
          {pack.installed && pack.updateAvailable && <Button type="button" size="sm" disabled={busy} onClick={onInstall}>Update</Button>}
          {pack.installed && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onUninstall}>Uninstall</Button>}
        </span>
      </span>
    </Card>
  )
}

const CLAUDE_PACK = 'anthropic-skills'

const LICENSE_TEXT: Record<ClaudeSkill['license'], string> = {
  'Apache-2.0': 'Apache 2.0',
  'source-available': 'Source-available',
  none: 'No licence'
}

interface ClaudeListProps {
  catalog: ClaudeSkill[] | null
  error: string | null
  installed: Map<string, Skill>
  onEdit: (s: Skill) => void
}

/** Every skill in Anthropic's repo with its licence and whether it's installed. */
function ClaudeList({ catalog, error, installed, onEdit }: ClaudeListProps): JSX.Element {
  if (error) return <ErrorBox>Couldn't load Anthropic's skills from GitHub. {error}</ErrorBox>
  if (!catalog) return <p className={cn(HINT, 'm-0')} role="status">Loading from GitHub…</p>
  return (
    <div className={GRID}>
      {catalog.map((c) => {
        const mine = installed.get(c.name)
        const status = mine ? 'Installed' : c.installable ? 'Installs with the pack' : c.blockedReason ? 'Too long to install' : 'Read only on GitHub'
        return (
          <Card key={c.folder} className={cn('relative min-h-40 gap-3 px-5 py-5',
            !c.installable && 'bg-muted shadow-none',
            mine && 'hover:border-border-strong has-[button:focus-visible]:ring-[3px] has-[button:focus-visible]:ring-ring/40')}>
            <span className="flex items-start justify-between gap-2">
              <Badge variant={mine ? 'lime' : 'outline'} className="h-8 rounded-lg px-3 font-mono font-normal">{c.name}</Badge>
              <SourceLink url={c.url} label={`${c.name} on GitHub (opens in your browser)`} />
            </span>
            <p className="m-0 line-clamp-5 text-sm leading-relaxed" title={c.description}>{c.description || 'No description'}</p>
            {c.blockedReason && <span className={HINT}>{c.blockedReason}</span>}
            <span className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className="truncate font-mono text-xs text-muted-foreground">{LICENSE_TEXT[c.license]} · {status}</span>
              {mine && (
                <button type="button" onClick={() => onEdit(mine)} aria-label={`Edit ${c.name}`}
                  className="cursor-pointer border-0 bg-transparent p-0 font-mono text-xs text-muted-foreground outline-none hover:text-foreground after:absolute after:inset-0 after:rounded-xl after:content-['']">
                  Edit
                </button>
              )}
            </span>
          </Card>
        )
      })}
    </div>
  )
}

type Seg = 'agency' | 'builtin' | 'github' | 'claude'
/** What the main area shows: a skill, a new skill, or the GitHub / Claude pack browser. */
type Sel = { kind: 'skill'; id: string } | { kind: 'new' } | { kind: 'browse' } | null

interface Props {
  agents: Agent[]
  /** The agency tab the screen is open in, if any: its agents get the switches and "This agency". */
  team?: SkillsTeam
  onAgentsChanged: () => void
}

const sourceLabel = (s: Skill): string => s.packId === CLAUDE_PACK ? 'Claude skill' : s.packId ? 'From a GitHub pack' : 'Built-in skill'

export function SkillsPage({ agents, team, onAgentsChanged }: Props): JSX.Element {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loaded, setLoaded] = useState(false)
  const [seg, setSeg] = useState<Seg>(team ? 'agency' : 'builtin')
  const [sel, setSel] = useState<Sel>(null)
  const [query, setQuery] = useState('')
  const dirty = useRef(false)
  const [catalog, setCatalog] = useState<ClaudeSkill[] | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; skipped: string[] } | null>(null)
  const [packs, setPacks] = useState<SkillPack[]>([])
  const [busyPack, setBusyPack] = useState<string | null>(null)
  const [found, setFound] = useState<SkillPackSearch | null>(null)
  const [findQuery, setFindQuery] = useState('')
  const [finding, setFinding] = useState(false)
  const [findError, setFindError] = useState<string | null>(null)
  /** The query the shown results are for, so "Show more" doesn't pick up unsubmitted typing. */
  const [searched, setSearched] = useState('')

  /** Loads a page of the GitHub agent-skills topic; page 1 replaces the list, later pages add to it. */
  const discover = async (q: string, page = 1): Promise<void> => {
    setFinding(true)
    setFindError(null)
    try {
      const r = await window.tyslin.skillPacks.discover(q, page)
      if (page === 1) setSearched(q)
      setFound((prev) => (page > 1 && prev ? { ...r, packs: [...prev.packs, ...r.packs.filter((p) => !prev.packs.some((x) => x.id === p.id))] } : r))
    } catch (err) {
      setFindError(errorText(err))
    } finally {
      setFinding(false)
    }
  }

  const load = (): Promise<void> => window.tyslin.skills.list().then((s) => { setSkills(s); setLoaded(true) })
  useEffect(() => {
    void load()
    // Show install state straight away, then the update check from GitHub.
    void window.tyslin.skillPacks.list().then(setPacks)
    void window.tyslin.skillPacks.check().then(setPacks).catch(() => undefined)
  }, [])

  const teamNames = useMemo(() => new Set(team?.members.flatMap((a) => a.skills) ?? []), [team])
  const ownSkills = skills.filter((s) => !s.packId)
  const githubSkills = skills.filter((s) => s.packId && s.packId !== CLAUDE_PACK)
  const claudeSkills = skills.filter((s) => s.packId === CLAUDE_PACK)
  const agencySkills = skills.filter((s) => teamNames.has(s.name))
  const githubPacks = packs.filter((p) => p.group !== 'claude')
  const claudePack = packs.find((p) => p.group === 'claude')
  const usedCount = (name: string): number => agents.filter((a) => a.skills.includes(name)).length

  const q = query.trim().toLowerCase()
  const match = (s: Skill): boolean => !q || s.name.includes(q) || s.description.toLowerCase().includes(q)
  /** The list as groups: "This agency" shows the agency's skills first, then every other skill. */
  const groups: { label: string; items: Skill[] }[] = seg === 'agency'
    ? [{ label: `Used in ${team?.name ?? 'this agency'}`, items: agencySkills.filter(match) },
       { label: 'Other skills', items: skills.filter((s) => !teamNames.has(s.name)).filter(match) }]
    : seg === 'builtin' ? [{ label: 'Built-in skills', items: ownSkills.filter(match) }]
    : seg === 'github' ? [{ label: 'Installed from GitHub', items: githubSkills.filter(match) }]
    : [{ label: 'Installed from Claude', items: claudeSkills.filter(match) }]
  const firstShown = groups.flatMap((g) => g.items)[0]

  /** Changes what the main area shows, asking first when the open skill has unsaved changes. */
  const choose = (next: Sel): void => {
    if (dirty.current && !window.confirm('Discard your changes to this skill?')) return
    dirty.current = false
    setSel(next)
  }
  const changeSeg = (s: Seg): void => {
    if (dirty.current && !window.confirm('Discard your changes to this skill?')) return
    dirty.current = false
    setSeg(s)
    setSel(null)
  }
  // Nothing chosen: open the first skill in the list, or the pack browser when GitHub or Claude has none installed.
  useEffect(() => {
    if (!loaded || sel) return
    if (firstShown) setSel({ kind: 'skill', id: firstShown.id })
    else if (seg === 'github' || seg === 'claude') setSel({ kind: 'browse' })
  }, [loaded, sel, seg, firstShown?.id])

  // GitHub calls are rate limited, so each browser loads its list only when first opened.
  useEffect(() => {
    if (sel?.kind !== 'browse') return
    if (seg === 'github' && !found && !finding) void discover('')
    if (seg === 'claude' && !catalog) {
      setCatalogError(null)
      window.tyslin.skillPacks.claudeCatalog().then(setCatalog).catch((err) => setCatalogError(errorText(err)))
    }
  }, [sel?.kind, seg])

  /** Replaces a pack in the top row and in the search results after it changes. */
  const refreshPacks = async (changed?: SkillPack): Promise<void> => {
    setPacks(await window.tyslin.skillPacks.list())
    if (changed) setFound((f) => f && { ...f, packs: f.packs.map((p) => (p.id === changed.id ? changed : p)) })
  }

  const installPack = async (pack: SkillPack): Promise<void> => {
    if (pack.installed && !window.confirm(`Update ${pack.name}? Edits you made to its skills will be replaced.`)) return
    setBusyPack(pack.id)
    try {
      const r = await track(`pack:${pack.id}`, `${pack.installed ? 'Updating' : 'Installing'} ${pack.name}`, () => window.tyslin.skillPacks.install(pack.id))
      const parts = [r.added && `${r.added} added`, r.updated && `${r.updated} updated`, r.removed && `${r.removed} removed`].filter(Boolean)
      setNotice({ text: `${pack.installed ? 'Updated' : 'Installed'} ${pack.name}${parts.length ? `: ${parts.join(', ')}` : ''}.`, skipped: r.skipped })
      await refreshPacks(r.pack)
      await load()
      onAgentsChanged()
    } catch (err) {
      setNotice({ text: `Couldn't install ${pack.name}. ${errorText(err)}`, skipped: [] })
    } finally {
      setBusyPack(null)
    }
  }

  const uninstallPack = async (pack: SkillPack): Promise<void> => {
    const names = new Set(skills.filter((s) => s.packId === pack.id).map((s) => s.name))
    const users = agents.filter((a) => a.skills.some((n) => names.has(n)))
    const who = users.length ? ` They will be removed from ${users.map((a) => a.name).join(', ')}.` : ''
    if (!window.confirm(`Uninstall ${pack.name} and delete its ${plural(names.size, 'skill')}?${who}`)) return
    setBusyPack(pack.id)
    try {
      await track(`pack:${pack.id}`, `Uninstalling ${pack.name}`, () => window.tyslin.skillPacks.uninstall(pack.id))
      await refreshPacks({ ...pack, installed: false, skillCount: 0, updateAvailable: false })
      setNotice({ text: `Uninstalled ${pack.name}.`, skipped: [] })
      await load()
      onAgentsChanged()
    } catch (err) {
      setNotice({ text: errorText(err), skipped: [] })
    } finally {
      setBusyPack(null)
    }
  }

  const importFiles = async (): Promise<void> => {
    try {
      const r = await window.tyslin.skills.importFiles()
      if (!r.imported.length && !r.skipped.length) return
      await load()
      setNotice({ text: `Imported ${r.imported.length} skill${r.imported.length === 1 ? '' : 's'}.`, skipped: r.skipped })
    } catch (err) {
      setNotice({ text: errorText(err), skipped: [] })
    }
  }

  const segs: [Seg, string, number][] = [
    ...(team ? [['agency', 'Agency', agencySkills.length] as [Seg, string, number]] : []),
    ['builtin', 'Built-in', ownSkills.length],
    ['github', 'GitHub', githubSkills.length],
    ['claude', 'Claude', claudeSkills.length]
  ]
  const current = sel?.kind === 'skill' ? skills.find((s) => s.id === sel.id) ?? null : null
  const editSkill = (s: Skill): void => choose({ kind: 'skill', id: s.id })

  return (
    <div className="tw flex h-full min-h-0 bg-background text-foreground">
      <section aria-label="Skills" className="flex w-[360px] flex-none flex-col gap-3.5 overflow-y-auto border-r border-border px-3.5 pt-5 pb-7">
        <div className="flex items-center justify-between gap-3 px-1">
          <h1 className="m-0 text-xl font-semibold tracking-tight">Skills</h1>
          <Button type="button" size="sm" onClick={() => choose({ kind: 'new' })}><Icon name="plus" size={12} /> New skill</Button>
        </div>
        <TabsList aria-label="Skill sources" className="w-full">
          {segs.map(([id, label, n]) => (
            <TabsTrigger key={id} active={seg === id} onClick={() => changeSeg(id)} className="px-1.5 text-[13px]">
              {label} <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sk-search" className="px-1 text-xs font-normal text-muted-foreground">Search skills</Label>
          <Input id="sk-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or what it does" />
        </div>

        {(seg === 'github' || seg === 'claude') && (
          <button type="button" className={cn(itemClass(sel?.kind === 'browse'), 'border-dashed', sel?.kind !== 'browse' && 'border-border-strong')} onClick={() => choose({ kind: 'browse' })}>
            <span className="flex w-full items-center justify-between gap-2"><strong className="text-sm font-semibold">{seg === 'github' ? 'Browse skill packs' : "Browse Anthropic's skills"}</strong><Icon name="github" size={14} /></span>
            <span className={HINT}>{seg === 'github' ? 'Install open-source skill packs from GitHub.' : 'Install the openly licensed skills from github.com/anthropics/skills.'}</span>
          </button>
        )}

        {q && groups.every((g) => g.items.length === 0) && <div className="flex justify-center px-4 py-6"><Pose pose={4} height={120} /></div>}
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-1.5">
            <span className="px-1 text-xs font-medium text-muted-foreground">{g.label}</span>
            {g.items.length === 0 && (
              <p className={cn(HINT, 'm-0 px-1')}>
                {q ? `No skills match "${query}".`
                  : seg === 'agency' && g === groups[0] ? 'No skills on these agents yet. Pick one below and switch it on.'
                  : seg === 'github' ? 'Nothing installed from GitHub yet. Browse the skill packs above.'
                  : seg === 'claude' ? "Nothing installed from Claude yet. Browse Anthropic's skills above."
                  : 'No skills yet. Create one with New skill or import a Markdown file.'}
              </p>
            )}
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {g.items.map((s) => {
                const n = usedCount(s.name)
                const on = sel?.kind === 'skill' && sel.id === s.id
                return (
                  <li key={s.id}>
                    <button type="button" className={itemClass(on)} aria-current={on ? 'true' : undefined} onClick={() => choose({ kind: 'skill', id: s.id })}>
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-mono text-[13px] font-medium">{s.name}</span>
                        <Badge variant={n ? 'soft' : 'secondary'} className="font-mono">{n ? plural(n, 'agent') : 'Not attached'}</Badge>
                      </span>
                      <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{s.description || 'No description'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        <Button type="button" variant="outline" className="self-start" onClick={() => void importFiles()}>Import .md</Button>
      </section>

      <section className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-7 pt-6 pb-12" aria-label={sel?.kind === 'browse' ? 'Browse skills' : 'Skill'}>
        {notice && (
          <Card className="gap-3 px-4 py-4" role="status">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm font-semibold">{notice.text}</strong>
              <Button type="button" size="sm" variant="outline" onClick={() => setNotice(null)}>Dismiss</Button>
            </div>
            {notice.skipped.length > 0 && (
              <ul className={cn(HINT, 'm-0 pl-[18px]')}>
                {notice.skipped.map((s) => <li key={s}>Skipped {s}</li>)}
              </ul>
            )}
          </Card>
        )}

        {(current || sel?.kind === 'new') && (
          <SkillPanel
            key={current?.id ?? 'new'}
            skill={current ? { id: current.id, name: current.name, description: current.description, body: current.body } : BLANK}
            source={current ? sourceLabel(current) : 'New skill'}
            sourceUrl={current?.sourceUrl}
            agents={agents}
            team={team}
            onDirty={(d) => { dirty.current = d }}
            onSaved={(s) => { dirty.current = false; void load().then(() => setSel({ kind: 'skill', id: s.id })); onAgentsChanged() }}
            onDeleted={() => { dirty.current = false; void load().then(() => setSel(null)); onAgentsChanged() }}
            onAgentsChanged={onAgentsChanged}
          />
        )}

        {!current && sel?.kind !== 'new' && sel?.kind !== 'browse' && (
          <p className={cn(HINT, 'mt-10 mb-0 text-sm')}>{loaded ? 'Pick a skill on the left to read or edit it.' : 'Loading…'}</p>
        )}

        {sel?.kind === 'browse' && seg === 'github' && (
          <>
            <section aria-labelledby="packs-h" className="flex flex-col gap-2.5">
              <div>
                <h2 id="packs-h" className={SECTION_H}>Skill packs</h2>
                <p className={cn(HINT, 'mt-1 mb-0')}>Open-source skill collections, downloaded from GitHub when you install them. Updating replaces any edits you made to their skills.</p>
              </div>
              <div className={GRID}>
                {githubPacks.map((p) => (
                  <PackCard key={p.id} pack={p} busy={busyPack === p.id} onInstall={() => void installPack(p)} onUninstall={() => void uninstallPack(p)} />
                ))}
              </div>
            </section>

            <section aria-labelledby="discover-h" className="flex flex-col gap-2.5">
              <div>
                <h2 id="discover-h" className={SECTION_H}>More on GitHub</h2>
                <p className={cn(HINT, 'mt-1 mb-0')}>
                  Repos tagged <a className={LINK} href="https://github.com/topics/agent-skills" target="_blank" rel="noreferrer">agent-skills</a>, most stars first.
                  Their authors wrote them, not Tyslin, so read a skill before you attach it to an agent. Only repos with a licence can be installed.
                </p>
              </div>
              <form className="flex max-w-[480px] items-center gap-2" role="search" onSubmit={(e) => { e.preventDefault(); void discover(findQuery) }}>
                <label htmlFor="pack-search" className="sr-only">Search agent-skills repos</label>
                <Input id="pack-search" className="min-w-0 flex-1" value={findQuery} onChange={(e) => setFindQuery(e.target.value)} placeholder="Search repos, e.g. design, seo, testing" />
                <Button type="submit" variant="outline" disabled={finding}>Search</Button>
              </form>
              {findError && <ErrorBox>Couldn't load repos from GitHub. {findError}</ErrorBox>}
              {(() => {
                // Installed packs move to the row above.
                const list = found?.packs.filter((p) => !p.installed) ?? []
                return (
                  <>
                    <div className={GRID} aria-busy={finding}>
                      {list.map((p) => (
                        <PackCard key={p.id} pack={p} busy={busyPack === p.id} onInstall={() => void installPack(p)} onUninstall={() => void uninstallPack(p)} />
                      ))}
                      {found && !finding && list.length === 0 && <p className={cn(HINT, 'm-0')}>No repos match “{searched}”.</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {finding && <span className={HINT} role="status">Loading from GitHub…</span>}
                      {!finding && found?.nextPage && (
                        <Button type="button" variant="outline" onClick={() => void discover(searched, found.nextPage)}>Show more</Button>
                      )}
                    </div>
                  </>
                )
              })()}
            </section>
          </>
        )}

        {sel?.kind === 'browse' && seg === 'claude' && (
          <>
            <section aria-labelledby="claude-h" className="flex flex-col gap-2.5">
              <div>
                <h2 id="claude-h" className={SECTION_H}>Claude skills by Anthropic</h2>
                <p className={cn(HINT, 'mt-1 mb-0')}>
                  From <a className={LINK} href="https://github.com/anthropics/skills" target="_blank" rel="noreferrer">github.com/anthropics/skills</a>.
                  Installing adds the open-source (Apache 2.0) skills. The document skills (docx, pdf, pptx, xlsx) are source-available, not open source, so they stay on GitHub to read.
                  Only each skill's SKILL.md is installed, not its scripts or reference files.
                </p>
              </div>
              {claudePack && (
                <div className={GRID}>
                  <PackCard pack={claudePack} busy={busyPack === claudePack.id} onInstall={() => void installPack(claudePack)} onUninstall={() => void uninstallPack(claudePack)} />
                </div>
              )}
            </section>
            <section aria-label="Skills in Anthropic's repo" className="flex flex-col gap-2.5">
              <h2 className={SECTION_H}>In the repo</h2>
              <ClaudeList catalog={catalog} error={catalogError} installed={new Map(claudeSkills.map((s) => [s.name, s]))} onEdit={editSkill} />
            </section>
          </>
        )}
      </section>
    </div>
  )
}
