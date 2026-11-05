import { useEffect, useState } from 'react'
import type { Agent, Project, StudioFile, WorkflowDoc, WorkflowProgress, WorkflowStep } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { SAVE_LABEL, StudioFiles, useAutosave } from '../components/StudioFiles'

interface Props {
  agents: Agent[]
  projects: Project[]
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
  /** A file to open straight away (from Drive). */
  initial?: { projectId: string; path: string }
}

const uid = (): string => Math.random().toString(36).slice(2, 10)

/** Agents and assistants, grouped. */
export function AgentSelect({ agents, value, onChange, label }: { agents: Agent[]; value: string; onChange: (id: string) => void; label?: string }): JSX.Element {
  return (
    <select className="select" value={value} aria-label={label ?? 'Agent or assistant'} onChange={(e) => onChange(e.target.value)}>
      <optgroup label="Agents">{agents.filter((a) => a.kind === 'agent').map((a) => <option key={a.id} value={a.id}>{a.name}{a.paused ? ' (paused)' : ''}</option>)}</optgroup>
      <optgroup label="Assistants">{agents.filter((a) => a.kind === 'assistant').map((a) => <option key={a.id} value={a.id}>{a.name}{a.paused ? ' (paused)' : ''}</option>)}</optgroup>
    </select>
  )
}

interface StepRun { status: WorkflowProgress['status'] | 'waiting'; output?: string; error?: string; sessionId?: string }

/** Workflows: a brief and steps; each step is an agent with an instruction, fed the step before it. */
export function WorkflowsPage({ agents, projects, onOpenChat, initial }: Props): JSX.Element {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [file, setFile] = useState<StudioFile | null>(null)
  const [doc, setDoc] = useState<WorkflowDoc | null>(null)
  const [dirty, setDirty] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [runId, setRunId] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepRun[]>([])
  const [result, setResult] = useState<{ status: WorkflowProgress['status']; logPath?: string; error?: string } | null>(null)
  const [logs, setLogs] = useState<StudioFile[]>([])
  const [viewing, setViewing] = useState<{ path: string; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = useAutosave(doc ? JSON.stringify(doc, null, 2) : null, dirty,
    async (v) => { if (file) await window.tyslin.studio.write(projectId, { path: file.path }, v) }, () => { setDirty(false); setRefresh((r) => r + 1) })

  const loadLogs = (f: StudioFile | null): void => {
    if (!f) { setLogs([]); return }
    void window.tyslin.studio.list('run', projectId).then((r) => setLogs(r.files.filter((x) => x.name.startsWith(f.name + ' '))))
  }
  const open = async (f: StudioFile | null, pid: string | null = projectId): Promise<void> => {
    setFile(f); setDoc(null); setDirty(false); setError(null); setViewing(null)
    if (!runId) { setSteps([]); setResult(null) }
    loadLogs(f)
    if (!f) return
    try { setDoc(JSON.parse(await window.tyslin.studio.read(pid, f.path)) as WorkflowDoc) } catch { setError('This workflow could not be read.') }
  }
  useEffect(() => {
    if (!initial) return
    setProjectId(initial.projectId)
    const name = initial.path.split('/').pop()!.replace(/\.(mindmap\.json|workflow\.json|md)$/, '')
    void open({ name, path: initial.path, updatedAt: Date.now() }, initial.projectId)
  }, [initial?.path])
  const create = async (name: string): Promise<void> => {
    const first = agents.find((a) => a.kind === 'agent' && !a.isMascot) ?? agents[0]
    const d: WorkflowDoc = { version: 1, brief: '', steps: [{ id: uid(), agentId: first?.id ?? '', instruction: '' }] }
    const f = await window.tyslin.studio.write(projectId, { kind: 'workflow', name }, JSON.stringify(d, null, 2))
    setRefresh((x) => x + 1)
    setFile(f); setDoc(d); setDirty(false); setSteps([]); setResult(null); setLogs([])
  }
  const edit = (fn: (d: WorkflowDoc) => WorkflowDoc): void => { if (doc) { setDoc(fn(doc)); setDirty(true) } }
  const setStep = (id: string, patch: Partial<WorkflowStep>): void => edit((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))
  const move = (i: number, by: number): void => edit((d) => {
    const s = [...d.steps]; const j = i + by
    if (j < 0 || j >= s.length) return d
    ;[s[i], s[j]] = [s[j], s[i]]
    return { ...d, steps: s }
  })

  useEffect(() => window.tyslin.studio.onWorkflow((p) => {
    if (p.runId !== runId) return
    if (p.step >= 0) setSteps((list) => list.map((s, i) => (i === p.step ? { status: p.status, output: p.output, error: p.error, sessionId: p.sessionId } : s)))
    else {
      setResult({ status: p.status, logPath: p.logPath, error: p.error })
      setRunId(null)
      loadLogs(file)
    }
  }), [runId, file])

  const run = async (): Promise<void> => {
    if (!doc || !file) return
    if (dirty) await window.tyslin.studio.write(projectId, { path: file.path }, JSON.stringify(doc, null, 2))
    setDirty(false)
    setResult(null)
    setSteps(doc.steps.map(() => ({ status: 'waiting' })))
    setRunId(await window.tyslin.studio.runWorkflow(projectId, file.path))
  }
  const view = async (path: string): Promise<void> => setViewing({ path, text: await window.tyslin.studio.read(projectId, path) })

  const ready = !!doc && doc.steps.length > 0 && doc.steps.every((s) => s.agentId && s.instruction.trim())
  const STATUS: Record<StepRun['status'], string> = { waiting: 'Waiting', running: 'Working…', done: 'Done', failed: 'Failed', stopped: 'Stopped' }

  return (
    <div className="studio">
      <StudioFiles kind="workflow" title="Workflows" newLabel="New workflow" projects={projects} projectId={projectId}
        onProject={(id) => { setProjectId(id); void open(null) }} selected={file?.path ?? null} onSelect={(f) => void open(f)} refreshKey={refresh}
        onNew={(n) => void create(n)} onDelete={async (f) => { await window.tyslin.studio.remove(projectId, f.path); if (file?.path === f.path) void open(null); setRefresh((r) => r + 1) }} />
      <div className="studio-main">
        {!doc ? (
          <div className="studio-empty">
            <Icon name="workflow" size={36} />
            <h1>Workflows</h1>
            <p className="lead">Chain agents into steps that hand work to each other: each step gets the brief and the previous step's result. Workflows and their run logs are saved in the project folder under <code className="mono">workflows/</code>.</p>
            {error && <p className="hint account-error">{error}</p>}
          </div>
        ) : (
          <>
            <div className="studio-bar">
              <strong className="studio-title">{file?.name}</strong>
              <span className="hint">{SAVE_LABEL[save]}</span>
              <span style={{ flex: 1 }} />
              {runId
                ? <button type="button" className="btn btn-sm" onClick={() => void window.tyslin.studio.stopWorkflow(runId)}><Icon name="stop" size={12} /> Stop</button>
                : <button type="button" className="btn btn-primary btn-sm" disabled={!ready} onClick={() => void run()} title={ready ? '' : 'Every step needs an agent and an instruction'}><Icon name="play" size={12} /> Run workflow</button>}
            </div>
            <div className="studio-split">
              <div className="wf-edit">
                <label className="field">
                  <span className="label">Brief</span>
                  <textarea className="textarea" rows={4} value={doc.brief} onChange={(e) => edit((d) => ({ ...d, brief: e.target.value }))}
                    placeholder="What the workflow starts from: a goal, a topic, notes or a link to a file in the project." />
                </label>
                {doc.steps.map((s, i) => {
                  const a = agents.find((x) => x.id === s.agentId)
                  const r = steps[i]
                  return (
                    <div key={s.id} className={'wf-step' + (r ? ' ' + r.status : '')}>
                      <div className="wf-step-head">
                        <span className="wf-num">{i + 1}</span>
                        {a && <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={28} />}
                        <div style={{ flex: 1, minWidth: 0 }}><AgentSelect agents={agents} value={s.agentId} onChange={(v) => setStep(s.id, { agentId: v })} label={`Step ${i + 1} agent`} /></div>
                        <button type="button" className="btn btn-sm icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="arrowUp" size={12} /></button>
                        <button type="button" className="btn btn-sm icon-btn" aria-label="Move down" disabled={i === doc.steps.length - 1} onClick={() => move(i, 1)}><Icon name="arrowDown" size={12} /></button>
                        <button type="button" className="btn btn-sm icon-btn" aria-label={`Delete step ${i + 1}`} onClick={() => edit((d) => ({ ...d, steps: d.steps.filter((x) => x.id !== s.id) }))}><Icon name="trash" size={12} /></button>
                      </div>
                      <textarea className="textarea" rows={3} value={s.instruction} aria-label={`Step ${i + 1} instruction`} onChange={(e) => setStep(s.id, { instruction: e.target.value })}
                        placeholder={i === 0 ? 'What to do with the brief, e.g. "Research the three main competitors and list their prices."' : 'What to do with the previous step\'s result, e.g. "Turn this into a one-page summary."'} />
                      {r && r.status !== 'waiting' && (
                        <div className="wf-out">
                          <span className={'wf-status ' + r.status}>{STATUS[r.status]}</span>
                          {r.error && <span className="hint account-error">{r.error}</span>}
                          {r.output && <p>{r.output.length > 600 ? r.output.slice(0, 600) + '…' : r.output}</p>}
                          {r.sessionId && <button type="button" className="link-btn" onClick={() => onOpenChat(s.agentId, a?.kind === 'agent' ? projectId : null, r.sessionId)}>Open chat</button>}
                        </div>
                      )}
                    </div>
                  )
                })}
                <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => edit((d) => ({ ...d, steps: [...d.steps, { id: uid(), agentId: d.steps[d.steps.length - 1]?.agentId ?? agents[0]?.id ?? '', instruction: '' }] }))}>
                  <Icon name="plus" size={12} /> Add step
                </button>
              </div>
              <aside className="studio-side">
                <span className="section-label" style={{ padding: 0 }}>Runs</span>
                {result && (
                  <div className={'wf-result ' + result.status}>
                    <strong>{result.status === 'done' ? 'Finished' : result.status === 'stopped' ? 'Stopped' : 'Failed'}</strong>
                    {result.error && <span className="hint">{result.error}</span>}
                    {result.logPath && <button type="button" className="link-btn" onClick={() => void view(result.logPath!)}>Read the log</button>}
                  </div>
                )}
                {logs.map((l) => (
                  <button key={l.path} type="button" className={'sf-open' + (viewing?.path === l.path ? ' on' : '')} onClick={() => void view(l.path)}>
                    <strong>{l.name.slice((file?.name.length ?? 0) + 1)}</strong><span>Run log</span>
                  </button>
                ))}
                {!logs.length && !result && <p className="hint">No runs yet. Each run saves a Markdown log in <code className="mono">workflows/runs/</code>.</p>}
                {viewing && (
                  <div className="wf-log">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="section-label" style={{ padding: 0 }}>Log</span>
                      <button type="button" className="link-btn" onClick={() => void window.tyslin.studio.reveal(projectId, viewing.path)}>Show file</button>
                    </div>
                    <pre>{viewing.text}</pre>
                  </div>
                )}
                <p className="hint">Steps run one after another in the background, so you can leave this screen. Each step is a chat you can open; file changes still wait for your review.</p>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
