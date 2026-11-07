import { useEffect, useMemo, useRef, useState } from 'react'
import type { Agent, ClaudeSkill, Skill, SkillInput, SkillPack, SkillPackSearch } from '@shared/types'
import { Icon } from '../components/Icon'
import { Avatar } from '../components/Avatar'
import { runsOnLabel } from '../components/RunsOnBadge'
import { track } from '../activity'
import { Pose } from '../components/Pose'

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
    <form className="sk-editor" aria-labelledby="sk-title" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <header className="sk-editor-head">
        <div className="sk-editor-title">
          <span className="eyebrow">{source}</span>
          <h2 id="sk-title" className="mono">{form.name || 'Untitled skill'}</h2>
        </div>
        <div className="row">
          {sourceUrl && (
            <a className="btn" href={sourceUrl} target="_blank" rel="noreferrer" aria-label={`${skill.name} on GitHub (opens in your browser)`}>
              <Icon name="github" size={16} /> GitHub
            </a>
          )}
          {skill.id && <button type="button" className="btn" disabled={busy} onClick={() => void exportFile()}>Export .md</button>}
          {skill.id && <button type="button" className="btn" disabled={busy} onClick={() => void remove()}>Delete</button>}
          <button type="submit" className="btn btn-primary" disabled={busy || !form.name || !form.body.trim() || (!!skill.id && !dirty)}>
            {busy ? 'Saving…' : 'Save skill'}
          </button>
        </div>
      </header>
      {saved && !dirty && <span className="hint" role="status">Saved.</span>}
      {error && <div className="msg-error" role="alert">{error}</div>}

      <div className="two">
        <div className="field">
          <label htmlFor="s-name">Name</label>
          <input id="s-name" className="input mono" value={form.name} onChange={(e) => set('name', toSlug(e.target.value))} placeholder="meeting-notes" autoFocus={!skill.id} />
          <span className="hint">Lowercase words joined by hyphens.</span>
        </div>
        <div className="field">
          <label htmlFor="s-desc">One-line description</label>
          <input id="s-desc" className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What this skill helps an agent do" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="s-body">Instructions</label>
        <textarea id="s-body" className="textarea mono sk-body" rows={8} value={form.body} onChange={(e) => set('body', e.target.value)}
          placeholder={'What to produce, in what structure, and what to avoid.\nFive to eight short lines works well.'} />
        <span className="hint">{form.body.length.toLocaleString()} / 40,000 characters · added to the instructions of every agent that uses it</span>
      </div>

      <section className="sk-users" aria-labelledby="sk-users-h">
        <div className="sk-users-head">
          <h3 id="sk-users-h">{team ? `Who uses it in ${team.name}` : 'Who uses it'}</h3>
          <span className="hint">
            {!skill.id ? 'Save the skill first, then switch it on for your agents.'
              : team ? 'Switch an agent on or off. It applies straight away.'
              : usedBy.length ? `Used by ${usedBy.map((a) => a.name).join(', ')}.` : 'Not attached to any agent yet. Open an agency to switch it on for its agents.'}
          </span>
        </div>
        {team && (
          <div className="sk-agents">
            {team.members.map((a) => {
              const on = !!skill.id && a.skills.includes(name)
              return (
                <div key={a.id} className={'card sk-agent' + (on ? ' on' : '')}>
                  <span className="sk-agent-top">
                    <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={32} />
                    <button type="button" role="switch" aria-checked={on} aria-label={`${a.name} uses ${name || 'this skill'}`}
                      className={'switch' + (on ? ' on' : '')} disabled={!skill.id || dirty || switching !== null} onClick={() => void toggle(a)} />
                  </span>
                  <strong>{a.name}</strong>
                  <span className="mono hint">{runsOnLabel(a)}</span>
                </div>
              )
            })}
          </div>
        )}
        {team && skill.id && dirty && <span className="hint">Save your changes to switch agents on or off.</span>}
        {team && elsewhere.length > 0 && <span className="hint">Also used by {elsewhere.map((a) => a.name).join(', ')} outside this agency.</span>}
      </section>
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
    <div className="card pack-card" aria-busy={busy}>
      <span className="skill-card-top">
        <span className="pack-title">
          <strong>{pack.name}</strong>
          <span className="mono hint">
            {[pack.author, pack.license || 'no licence', pack.stars !== undefined && `${formatStars(pack.stars)} stars`].filter(Boolean).join(' · ')}
          </span>
        </span>
        <a className="skill-source" href={pack.url} target="_blank" rel="noreferrer"
          title={pack.url.replace(/^https:\/\//, '')} aria-label={`${pack.name} on GitHub (opens in your browser)`}>
          <Icon name="github" size={18} />
        </a>
      </span>
      <p className="pack-desc" title={pack.description}>{pack.description || 'No description'}</p>
      {pack.blockedReason && <span className="hint">{pack.blockedReason}</span>}
      {pack.checkError && pack.installed && <span className="hint">Couldn't check for updates: {pack.checkError}</span>}
      <span className="card-foot">
        <span className="mono" role="status">{status}</span>
        <span className="pack-actions">
          {!pack.installed && pack.installable && <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={onInstall}>Install</button>}
          {pack.installed && pack.updateAvailable && <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={onInstall}>Update</button>}
          {pack.installed && <button type="button" className="btn btn-sm" disabled={busy} onClick={onUninstall}>Uninstall</button>}
        </span>
      </span>
    </div>
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
  if (error) return <div className="msg-error" role="alert">Couldn't load Anthropic's skills from GitHub. {error}</div>
  if (!catalog) return <p className="hint" role="status">Loading from GitHub…</p>
  return (
    <div className="grid">
      {catalog.map((c) => {
        const mine = installed.get(c.name)
        const status = mine ? 'Installed' : c.installable ? 'Installs with the pack' : c.blockedReason ? 'Too long to install' : 'Read only on GitHub'
        return (
          <div key={c.folder} className={'card skill-card' + (c.installable ? '' : ' muted-card')}>
            <span className="skill-card-top">
              <span className={'chip' + (mine ? ' on' : '')}>{c.name}</span>
              <a className="skill-source" href={c.url} target="_blank" rel="noreferrer"
                title={c.url.replace(/^https:\/\//, '')} aria-label={`${c.name} on GitHub (opens in your browser)`}>
                <Icon name="github" size={18} />
              </a>
            </span>
            <p className="clamp-5" title={c.description}>{c.description || 'No description'}</p>
            {c.blockedReason && <span className="hint">{c.blockedReason}</span>}
            <span className="card-foot">
              <span className="mono">{LICENSE_TEXT[c.license]} · {status}</span>
              {mine && <button type="button" className="skill-edit mono" onClick={() => onEdit(mine)} aria-label={`Edit ${c.name}`}>Edit</button>}
            </span>
          </div>
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
    <div className="sk-page">
      <section className="sk-list" aria-label="Skills">
        <div className="sk-list-head">
          <h1>Skills</h1>
          <button type="button" className="btn btn-primary" onClick={() => choose({ kind: 'new' })}><Icon name="plus" size={12} /> New skill</button>
        </div>
        <div className="field">
          <label htmlFor="sk-search" className="hint">Search skills</label>
          <input id="sk-search" type="search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or what it does" />
        </div>
        <div className="tabs sk-seg" role="tablist" aria-label="Skill sources">
          {segs.map(([id, label, n]) => (
            <button key={id} type="button" role="tab" aria-selected={seg === id} className={seg === id ? 'on' : ''} onClick={() => changeSeg(id)}>
              {label} <span className="mono tab-count">{n}</span>
            </button>
          ))}
        </div>

        {(seg === 'github' || seg === 'claude') && (
          <button type="button" className={'sk-item sk-browse' + (sel?.kind === 'browse' ? ' on' : '')} onClick={() => choose({ kind: 'browse' })}>
            <span className="sk-item-top"><strong>{seg === 'github' ? 'Browse skill packs' : "Browse Anthropic's skills"}</strong><Icon name="github" size={14} /></span>
            <span className="hint">{seg === 'github' ? 'Install open-source skill packs from GitHub.' : 'Install the openly licensed skills from github.com/anthropics/skills.'}</span>
          </button>
        )}

        {q && groups.every((g) => g.items.length === 0) && <div className="pose-empty"><Pose pose={4} height={120} /></div>}
        {groups.map((g) => (
          <div key={g.label} className="sk-group">
            <span className="section-label" style={{ padding: 0 }}>{g.label}</span>
            {g.items.length === 0 && (
              <p className="hint">
                {q ? `No skills match "${query}".`
                  : seg === 'agency' && g === groups[0] ? 'No skills on these agents yet. Pick one below and switch it on.'
                  : seg === 'github' ? 'Nothing installed from GitHub yet. Browse the skill packs above.'
                  : seg === 'claude' ? "Nothing installed from Claude yet. Browse Anthropic's skills above."
                  : 'No skills yet. Create one with New skill or import a Markdown file.'}
              </p>
            )}
            <ul className="sk-items">
              {g.items.map((s) => {
                const n = usedCount(s.name)
                const on = sel?.kind === 'skill' && sel.id === s.id
                return (
                  <li key={s.id}>
                    <button type="button" className={'sk-item' + (on ? ' on' : '')} aria-current={on ? 'true' : undefined} onClick={() => choose({ kind: 'skill', id: s.id })}>
                      <span className="sk-item-top">
                        <span className="mono sk-item-name">{s.name}</span>
                        <span className={'mono sk-item-used' + (n ? ' used' : '')}>{n ? plural(n, 'agent') : 'Not attached'}</span>
                      </span>
                      <span className="hint sk-item-desc">{s.description || 'No description'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        <button type="button" className="btn sk-import" onClick={() => void importFiles()}>Import .md</button>
      </section>

      <section className="sk-main" aria-label={sel?.kind === 'browse' ? 'Browse skills' : 'Skill'}>
        {notice && (
          <div className="box" role="status">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{notice.text}</strong>
              <button type="button" className="btn btn-sm" onClick={() => setNotice(null)}>Dismiss</button>
            </div>
            {notice.skipped.length > 0 && (
              <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
                {notice.skipped.map((s) => <li key={s}>Skipped {s}</li>)}
              </ul>
            )}
          </div>
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
          <p className="hint sk-empty">{loaded ? 'Pick a skill on the left to read or edit it.' : 'Loading…'}</p>
        )}

        {sel?.kind === 'browse' && seg === 'github' && (
          <>
            <section aria-labelledby="packs-h" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <h2 id="packs-h" className="section-label" style={{ padding: 0, margin: 0 }}>Skill packs</h2>
                <p className="hint" style={{ margin: '4px 0 0' }}>Open-source skill collections, downloaded from GitHub when you install them. Updating replaces any edits you made to their skills.</p>
              </div>
              <div className="grid">
                {githubPacks.map((p) => (
                  <PackCard key={p.id} pack={p} busy={busyPack === p.id} onInstall={() => void installPack(p)} onUninstall={() => void uninstallPack(p)} />
                ))}
              </div>
            </section>

            <section aria-labelledby="discover-h" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <h2 id="discover-h" className="section-label" style={{ padding: 0, margin: 0 }}>More on GitHub</h2>
                <p className="hint" style={{ margin: '4px 0 0' }}>
                  Repos tagged <a href="https://github.com/topics/agent-skills" target="_blank" rel="noreferrer">agent-skills</a>, most stars first.
                  Their authors wrote them, not Tyslin, so read a skill before you attach it to an agent. Only repos with a licence can be installed.
                </p>
              </div>
              <form className="row" role="search" style={{ maxWidth: 480, flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); void discover(findQuery) }}>
                <label htmlFor="pack-search" className="sr-only">Search agent-skills repos</label>
                <input id="pack-search" className="input" style={{ flex: 1, minWidth: 0 }} value={findQuery} onChange={(e) => setFindQuery(e.target.value)} placeholder="Search repos, e.g. design, seo, testing" />
                <button type="submit" className="btn" disabled={finding}>Search</button>
              </form>
              {findError && <div className="msg-error" role="alert">Couldn't load repos from GitHub. {findError}</div>}
              {(() => {
                // Installed packs move to the row above.
                const list = found?.packs.filter((p) => !p.installed) ?? []
                return (
                  <>
                    <div className="grid" aria-busy={finding}>
                      {list.map((p) => (
                        <PackCard key={p.id} pack={p} busy={busyPack === p.id} onInstall={() => void installPack(p)} onUninstall={() => void uninstallPack(p)} />
                      ))}
                      {found && !finding && list.length === 0 && <p className="hint">No repos match “{searched}”.</p>}
                    </div>
                    <div className="row">
                      {finding && <span className="hint" role="status">Loading from GitHub…</span>}
                      {!finding && found?.nextPage && (
                        <button type="button" className="btn" onClick={() => void discover(searched, found.nextPage)}>Show more</button>
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
            <section aria-labelledby="claude-h" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <h2 id="claude-h" className="section-label" style={{ padding: 0, margin: 0 }}>Claude skills by Anthropic</h2>
                <p className="hint" style={{ margin: '4px 0 0' }}>
                  From <a href="https://github.com/anthropics/skills" target="_blank" rel="noreferrer">github.com/anthropics/skills</a>.
                  Installing adds the open-source (Apache 2.0) skills. The document skills (docx, pdf, pptx, xlsx) are source-available, not open source, so they stay on GitHub to read.
                  Only each skill's SKILL.md is installed, not its scripts or reference files.
                </p>
              </div>
              {claudePack && (
                <div className="grid">
                  <PackCard pack={claudePack} busy={busyPack === claudePack.id} onInstall={() => void installPack(claudePack)} onUninstall={() => void uninstallPack(claudePack)} />
                </div>
              )}
            </section>
            <section aria-label="Skills in Anthropic's repo" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 className="section-label" style={{ padding: 0, margin: 0 }}>In the repo</h2>
              <ClaudeList catalog={catalog} error={catalogError} installed={new Map(claudeSkills.map((s) => [s.name, s]))} onEdit={editSkill} />
            </section>
          </>
        )}
      </section>
    </div>
  )
}
