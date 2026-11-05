import { useEffect, useState } from 'react'
import type { Agent, ClaudeSkill, Skill, SkillInput, SkillPack, SkillPackSearch } from '@shared/types'
import { Icon } from '../components/Icon'
import { track } from '../activity'

const BLANK: SkillInput = { name: '', description: '', body: '' }

const errorText = (err: unknown): string =>
  err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)

const toSlug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 64)

interface EditorProps {
  skill: SkillInput
  usedBy: Agent[]
  onClose: () => void
  onSaved: () => void
}

function SkillEditor({ skill, usedBy, onClose, onSaved }: EditorProps): JSX.Element {
  const [form, setForm] = useState<SkillInput>(skill)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof SkillInput>(k: K, v: SkillInput[K]): void => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (fn: () => Promise<unknown>, close = true): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onSaved()
      if (close) onClose()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const save = (): Promise<void> => run(() => window.tyslin.skills.save({ ...form, name: form.name.replace(/-+$/, '') }))
  const remove = (): Promise<void> => {
    const who = usedBy.length ? ` It will be removed from ${usedBy.map((a) => a.name).join(', ')}.` : ''
    if (!form.id || !window.confirm(`Delete ${form.name}?${who}`)) return Promise.resolve()
    return run(() => window.tyslin.skills.remove(form.id!))
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <form className="modal skill-modal" role="dialog" aria-modal="true" aria-labelledby="skill-title"
        onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void save() }}>
        <header className="review-head" style={{ padding: 0, border: 0 }}>
          <div>
            <span className="eyebrow">{form.id ? 'Edit skill' : 'New skill'}</span>
            <h2 id="skill-title">{form.name || 'Untitled skill'}</h2>
          </div>
          <button type="button" className="btn icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="two">
          <div className="field">
            <label htmlFor="s-name">Name</label>
            <input id="s-name" className="input mono" value={form.name} onChange={(e) => set('name', toSlug(e.target.value))} placeholder="meeting-notes" autoFocus={!form.id} />
            <span className="hint">Lowercase words joined by hyphens.</span>
          </div>
          <div className="field">
            <label htmlFor="s-desc">One-line description</label>
            <input id="s-desc" className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What this skill helps an agent do" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="s-body">Instructions</label>
          <textarea id="s-body" className="textarea mono" rows={12} value={form.body} onChange={(e) => set('body', e.target.value)}
            placeholder={'What to produce, in what structure, and what to avoid.\nFive to eight short lines works well.'} />
          <span className="hint">{form.body.length.toLocaleString()} / 40,000 characters · added to the instructions of every agent that uses it</span>
        </div>
        {form.id && (
          <span className="hint">{usedBy.length ? `Used by ${usedBy.map((a) => a.name).join(', ')}` : 'Not attached to any agent yet. Attach it in an agent\'s editor.'}</span>
        )}
        {error && <div className="msg-error" role="alert">{error}</div>}
        <footer className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            {form.id && <button type="button" className="btn" disabled={busy} onClick={() => void remove()}>Delete</button>}
            {form.id && (
              <button type="button" className="btn" disabled={busy} onClick={() => void run(() => window.tyslin.skills.exportFile(form.id!), false)}>Export .md</button>
            )}
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !form.name || !form.body.trim()}>Save skill</button>
          </div>
        </footer>
      </form>
    </div>
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

type Tab = 'builtin' | 'github' | 'claude'

interface LibraryProps {
  skills: Skill[]
  label: string
  empty: string
  usedBy: (name: string) => Agent[]
  onEdit: (s: Skill) => void
}

/** Searchable grid of installed skills; click a card to edit it. */
function SkillLibrary({ skills, label, empty, usedBy, onEdit }: LibraryProps): JSX.Element {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? skills.filter((s) => s.name.includes(q) || s.description.toLowerCase().includes(q)) : skills
  const id = 'skill-search-' + label.toLowerCase().replace(/\W+/g, '-')
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-label={label}>
      {skills.length > 0 && (
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor={id} className="section-label" style={{ padding: 0 }}>{label}</label>
          <input id={id} className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${plural(skills.length, 'skill')}`} />
        </div>
      )}
      <div className="grid">
        {shown.map((s) => {
          const used = usedBy(s.name)
          return (
            <div key={s.id} className="card skill-card">
              <span className="skill-card-top">
                <span className="chip on">{s.name}</span>
                {s.sourceUrl && (
                  <a className="skill-source" href={s.sourceUrl} target="_blank" rel="noreferrer"
                    title={s.sourceUrl.replace(/^https:\/\//, '')} aria-label={`${s.name} on GitHub (opens in your browser)`}>
                    <Icon name="github" size={18} />
                  </a>
                )}
              </span>
              <p>{s.description || 'No description'}</p>
              <span className="card-foot">
                <span className="mono">{used.length ? `${used.length} agent${used.length === 1 ? '' : 's'}` : 'Not attached'}</span>
                {/* Covers the whole card (see .skill-edit::after), so any click on it opens the editor. */}
                <button type="button" className="skill-edit mono" onClick={() => onEdit(s)} aria-label={`Edit ${s.name}`}>Edit</button>
              </span>
            </div>
          )
        })}
        {skills.length === 0 && <p className="hint">{empty}</p>}
        {skills.length > 0 && shown.length === 0 && <p className="hint">No skills match “{query}”.</p>}
      </div>
    </section>
  )
}

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

interface Props {
  agents: Agent[]
  onAgentsChanged: () => void
}

export function SkillsPage({ agents, onAgentsChanged }: Props): JSX.Element {
  const [skills, setSkills] = useState<Skill[]>([])
  const [tab, setTab] = useState<Tab>('builtin')
  const [catalog, setCatalog] = useState<ClaudeSkill[] | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [editing, setEditing] = useState<SkillInput | null>(null)
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

  const load = (): Promise<void> => window.tyslin.skills.list().then(setSkills)
  useEffect(() => {
    void load()
    // Show install state straight away, then the update check from GitHub.
    void window.tyslin.skillPacks.list().then(setPacks)
    void window.tyslin.skillPacks.check().then(setPacks).catch(() => undefined)
  }, [])

  // GitHub calls are rate limited, so each tab loads its list only when first opened.
  useEffect(() => {
    if (tab === 'github' && !found && !finding) void discover('')
    if (tab === 'claude' && !catalog) {
      setCatalogError(null)
      window.tyslin.skillPacks.claudeCatalog().then(setCatalog).catch((err) => setCatalogError(errorText(err)))
    }
  }, [tab])

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

  const usedBy = (name: string): Agent[] => agents.filter((a) => a.skills.includes(name))
  const ownSkills = skills.filter((s) => !s.packId)
  const githubSkills = skills.filter((s) => s.packId && s.packId !== CLAUDE_PACK)
  const claudeSkills = skills.filter((s) => s.packId === CLAUDE_PACK)
  const githubPacks = packs.filter((p) => p.group !== 'claude')
  const claudePack = packs.find((p) => p.group === 'claude')
  const tabs: [Tab, string, number][] = [
    ['builtin', 'Built-in skills', ownSkills.length],
    ['github', 'GitHub', githubSkills.length],
    ['claude', 'Claude', claudeSkills.length]
  ]

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

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="eyebrow">Library</span>
          <h1>Skills</h1>
          <p className="lead">Reusable instructions you can attach to any agent. Attached skills are added to the agent's instructions.</p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => void importFiles()}>Import .md</button>
          <button type="button" className="btn btn-primary" onClick={() => setEditing(BLANK)}><Icon name="plus" size={12} /> New skill</button>
        </div>
      </header>

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

      <div className="tabs" role="tablist" aria-label="Skill sources">
        {tabs.map(([id, label, n]) => (
          <button key={id} type="button" role="tab" id={'skills-tab-' + id} aria-selected={tab === id} aria-controls="skills-panel"
            className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label} <span className="mono tab-count">{n}</span>
          </button>
        ))}
      </div>

      <div id="skills-panel" role="tabpanel" aria-labelledby={'skills-tab-' + tab} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {tab === 'builtin' && (
          <SkillLibrary skills={ownSkills} label="Built-in skills" usedBy={usedBy} onEdit={setEditing}
            empty="No skills yet. Create one with New skill or import a Markdown file." />
        )}

        {tab === 'github' && (
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

            <SkillLibrary skills={githubSkills} label="Installed from GitHub" usedBy={usedBy} onEdit={setEditing}
              empty="Nothing installed from GitHub yet. Install a pack above." />
          </>
        )}

        {tab === 'claude' && (
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
              <ClaudeList catalog={catalog} error={catalogError} installed={new Map(claudeSkills.map((s) => [s.name, s]))} onEdit={setEditing} />
            </section>
          </>
        )}
      </div>

      {editing && (
        <SkillEditor
          skill={editing}
          usedBy={editing.name ? usedBy(skills.find((s) => s.id === editing.id)?.name ?? '') : []}
          onClose={() => setEditing(null)}
          onSaved={() => { void load(); onAgentsChanged() }}
        />
      )}
    </div>
  )
}
