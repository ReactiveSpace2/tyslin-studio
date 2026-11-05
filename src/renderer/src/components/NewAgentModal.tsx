import { useEffect, useState } from 'react'
import type { Project, TeamCreateResult, TeamsStatus } from '@shared/types'
import { TEAM_TEMPLATES, type TeamTemplate } from '@shared/teams'
import { describeSchedule } from '@shared/schedule'
import { HEAD_SRC } from '../heads'
import { modelLabel, useDefaultModel } from '../defaultModel'
import { getCurrentProject } from '../currentProject'
import { Icon } from './Icon'

interface Props {
  projects: Project[]
  onClose: () => void
  /** "Single agent": the step-by-step wizard. */
  onSingle: () => void
  onAskBuilder: () => void
  onCreated: (r: TeamCreateResult) => void
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

function Head({ id, size = 32 }: { id: string; size?: number }): JSX.Element {
  return <img src={HEAD_SRC[id] ?? HEAD_SRC.smile} alt="" width={size} height={size} className="nt-head" />
}

/**
 * "New agent": one agent (the six-step wizard) or a department team. Teams are picked from a gallery,
 * reviewed (members, project, how they work on their own) and created in one go.
 */
export function NewAgentModal({ projects, onClose, onSingle, onAskBuilder, onCreated }: Props): JSX.Element {
  const dm = useDefaultModel()
  const [step, setStep] = useState<'choose' | 'gallery' | 'review'>('choose')
  const [status, setStatus] = useState<TeamsStatus | null>(null)
  const [pick, setPick] = useState<TeamTemplate | null>(null)
  const [projectId, setProjectId] = useState<string>('')
  const [newName, setNewName] = useState('')
  const [own, setOwn] = useState(true)
  const [ask, setAsk] = useState(true)
  const [tg, setTg] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void window.tyslin.teams.status().then(setStatus) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const usedIn = (id: string): string[] => status?.teams.find((t) => t.id === id)?.projects ?? []
  const engineeringTaken = usedIn('engineering').length > 0
  const folderProjects = projects.filter((p) => p.folder)

  const review = (t: TeamTemplate): void => {
    // Teams go into the selected project when it has a folder; otherwise a new project folder.
    const cur = projects.find((p) => p.id === getCurrentProject() && p.folder)
    setPick(t); setNewName(t.name); setProjectId(cur?.id ?? ''); setError(null); setStep('review')
  }
  const create = async (): Promise<void> => {
    if (!pick) return
    setBusy(true); setError(null)
    try {
      const r = await window.tyslin.teams.create({
        templateId: pick.id, projectId: projectId || null, newProjectName: newName.trim() || pick.name,
        onTheirOwn: own, askBeforeWrite: ask, telegramLead: tg
      })
      onCreated(r)
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  const lead = pick?.members.find((m) => m.lead)
  const members = pick?.members.filter((m) => !m.lead) ?? []
  const skills = pick ? [...new Set(pick.members.flatMap((m) => m.skills))] : []

  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={'modal nt-modal' + (step === 'choose' ? ' nt-small' : '')} role="dialog" aria-modal="true" aria-labelledby="nt-title">
        <header className="nt-head-row">
          <div>
            {step !== 'choose' && <span className="eyebrow">{step === 'gallery' ? 'By team' : `${pick?.name} team`}</span>}
            <h2 id="nt-title">{step === 'choose' ? 'New agent' : step === 'gallery' ? 'Start from a team' : pick?.tagline}</h2>
            <p className="hint">
              {step === 'choose' ? 'Build one agent, or start from a ready team for a department.'
                : step === 'gallery' ? 'The whole studio, mapped to the people it serves. Each team is a lead and its members, ready to work on their own.'
                  : pick?.summary}
            </p>
          </div>
          <button type="button" className="btn icon-btn" aria-label="Close" onClick={onClose} disabled={busy}><Icon name="close" size={14} /></button>
        </header>

        {step === 'choose' && (
          <div className="nt-choose">
            <button type="button" className="nt-option" onClick={onSingle}>
              <Head id="smile" size={44} />
              <strong>Single agent</strong>
              <span>Six short steps: job, runs on, instructions, skills, access, then a real test before it's created.</span>
            </button>
            <button type="button" className="nt-option" onClick={() => setStep('gallery')}>
              <span className="nt-stack"><Head id="gears" size={44} /><Head id="engine" size={44} /><Head id="check" size={44} /></span>
              <strong>Agent team</strong>
              <span>A lead and its members for one department, reporting to each other and set up to work on their own.</span>
              <span className="nt-chips">{TEAM_TEMPLATES.map((t) => <span key={t.id}>{t.name}</span>)}</span>
            </button>
          </div>
        )}

        {step === 'gallery' && (
          <div className="nt-gallery">
            {TEAM_TEMPLATES.map((t) => {
              const where = usedIn(t.id)
              const locked = t.id === 'engineering' && engineeringTaken
              const lead = t.members.find((m) => m.lead)!
              return (
                <button key={t.id} type="button" className="nt-card" disabled={locked} onClick={() => review(t)}
                  title={locked ? `There is one Engineering team, in ${where[0]}.` : undefined}>
                  <span className="nt-card-top"><strong>{t.name}</strong>{where.length > 0 && <span className="nt-tag">IN {where[0].toUpperCase()}</span>}</span>
                  <span className="hint">{t.tagline}</span>
                  <span className="nt-stack">{t.members.map((m) => <Head key={m.name} id={m.head} size={30} />)}<span className="hint">{lead.name} leads · {t.members.length} agents</span></span>
                  <span className="nt-sum">{t.summary}</span>
                  <span className="nt-runs mono">{t.runs}</span>
                </button>
              )
            })}
            <button type="button" className="nt-card nt-own" onClick={onAskBuilder}>
              <Icon name="plus" size={18} />
              <strong>Build your own team</strong>
              <span className="hint">Tell Builder the department and the jobs; it drafts the lead and members.</span>
            </button>
          </div>
        )}

        {step === 'review' && pick && lead && (
          <div className="nt-review">
            <div className="nt-chart">
              <div className="nt-you"><span className="nt-u">U</span><strong>You</strong></div>
              <span className="nt-line" />
              <div className="nt-person nt-lead"><Head id={lead.head} size={40} /><span><strong>{lead.name} <em>LEAD</em></strong><small>{lead.description}</small></span></div>
              <span className="nt-line" />
              <div className="nt-members" style={{ gridTemplateColumns: `repeat(${members.length}, minmax(0, 1fr))` }}>
                {members.map((m) => (
                  <div key={m.name} className="nt-person nt-member">
                    <Head id={m.head} size={36} />
                    <strong>{m.name}</strong>
                    <small>{m.description}</small>
                    <span className="mono nt-access">{m.write ? 'read + write' : 'read only'}</span>
                  </div>
                ))}
              </div>
              <p className="nt-how"><strong>How it runs.</strong> {pick.runs}. The team works in {pick.folders.map((f) => `${f}/`).join(', ')}. File changes wait for your review unless you turn that off.</p>
            </div>
            <div className="nt-settings">
              <label className="field"><span className="label">Project</span>
                <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">New project folder</option>
                  {folderProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              {!projectId && (
                <label className="field"><span className="label">Folder name</span>
                  <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </label>
              )}
              <p className="hint" style={{ margin: 0 }}>Each agent works in one project, so a team usually gets its own folder.</p>
              <div className="field"><span className="label">Model</span>
                <span className="nt-model mono">{dm ? `Default model · ${modelLabel(dm)}` : 'Default model'}</span>
                <span className="hint">Change any member's model or engine later on its page.</span>
              </div>
              <div className="nt-toggles">
                <span className="label">Working on their own</span>
                <label><span>{pick.task.name} · {describeSchedule(pick.task.schedule)}</span><input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} /></label>
                <label><span>Ask before writing files</span><input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} /></label>
                <label><span>{lead.name} answers on Telegram</span><input type="checkbox" checked={tg} onChange={(e) => setTg(e.target.checked)} /></label>
              </div>
              <div className="field"><span className="label">Skills included</span>
                <span className="nt-chips">{skills.map((s) => <span key={s} className="mono">{s}</span>)}</span>
              </div>
            </div>
          </div>
        )}

        <footer className="nt-foot">
          {step === 'choose'
            ? <span className="hint">Teams are made of normal agents: edit, pause or move any of them later.</span>
            : <button type="button" className="btn" disabled={busy} onClick={() => setStep(step === 'review' ? 'gallery' : 'choose')}>Back</button>}
          <div className="row" style={{ gap: 10 }}>
            {error && <span className="hint account-error" role="alert">{error}</span>}
            {step === 'review' && pick && (
              <>
                <span className="hint">Creates {pick.members.length} agents{own ? ' and a scheduled task' : ''}</span>
                <button type="button" className="btn btn-lime" disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : `Create ${pick.name} team`}</button>
              </>
            )}
            {step !== 'review' && <button type="button" className="btn" onClick={onClose}>Cancel</button>}
          </div>
        </footer>
      </div>
    </div>
  )
}
