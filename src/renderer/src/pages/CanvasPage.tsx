import { useEffect, useRef, useState } from 'react'
import type { Agent, Project, StudioFile } from '@shared/types'
import { Icon } from '../components/Icon'
import { SAVE_LABEL, StudioFiles, useAutosave } from '../components/StudioFiles'
import { AgentSelect } from './WorkflowsPage'

interface Props {
  agents: Agent[]
  projects: Project[]
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
  /** A file to open straight away (from Drive). */
  initial?: { projectId: string; path: string }
}

type Mode = 'rewrite' | 'continue' | 'ask'
interface Proposal { mode: Mode; text: string; start: number; end: number; sessionId?: string }

const MAX_CONTEXT = 60_000

/** Canvas: a Markdown document with an agent beside it. Agent changes arrive as proposals you accept or discard. */
export function CanvasPage({ agents, projects, onOpenChat, initial }: Props): JSX.Element {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [file, setFile] = useState<StudioFile | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [agentId, setAgentId] = useState<string>(agents.find((a) => a.name === 'Polish')?.id ?? agents.find((a) => a.kind === 'assistant')?.id ?? agents[0]?.id ?? '')
  const [mode, setMode] = useState<Mode>('rewrite')
  const [instruction, setInstruction] = useState('')
  const [range, setRange] = useState<[number, number]>([0, 0])
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)

  const save = useAutosave(text, dirty, async (v) => { if (file) await window.tyslin.studio.write(projectId, { path: file.path }, v) }, () => { setDirty(false); setRefresh((r) => r + 1) })

  const open = async (f: StudioFile | null, pid: string | null = projectId): Promise<void> => {
    setFile(f); setText(null); setDirty(false); setProposal(null); setError(null)
    if (f) setText(await window.tyslin.studio.read(pid, f.path))
  }
  useEffect(() => {
    if (!initial) return
    setProjectId(initial.projectId)
    const name = initial.path.split('/').pop()!.replace(/\.(mindmap\.json|workflow\.json|md)$/, '')
    void open({ name, path: initial.path, updatedAt: Date.now() }, initial.projectId)
  }, [initial?.path])
  const create = async (name: string): Promise<void> => {
    const body = `# ${name}\n\n`
    const f = await window.tyslin.studio.write(projectId, { kind: 'canvas', name }, body)
    setRefresh((x) => x + 1)
    setFile(f); setText(body); setDirty(false); setProposal(null)
  }
  const track = (): void => { const t = ta.current; if (t) setRange([t.selectionStart, t.selectionEnd]) }

  const run = async (): Promise<void> => {
    if (text === null || !agentId) return
    const [start, end] = range
    const selected = text.slice(start, end)
    const doc = text.length > MAX_CONTEXT ? text.slice(0, MAX_CONTEXT) + '\n…(cut)' : text
    const how = instruction.trim()
    const prompt = mode === 'rewrite'
      ? `Rewrite the passage below${how ? ` as asked: ${how}` : ' so it reads clearly'}.\nReply with ONLY the new passage, in Markdown, with no preamble or notes.\n\n<passage>\n${selected || text}\n</passage>\n\nThe whole document, for context:\n<document>\n${doc}\n</document>`
      : mode === 'continue'
        ? `Continue this document from where it ends${how ? `: ${how}` : ''}.\nReply with ONLY the new text to add, in Markdown, with no preamble.\n\n<document>\n${doc}\n</document>`
        : `${how || 'What would you improve in this document?'}\n\nAnswer about this document${selected ? ', focusing on the selected passage' : ''}:\n<document>\n${doc}\n</document>${selected ? `\n\nSelected passage:\n<passage>\n${selected}\n</passage>` : ''}`
    setBusy(true); setError(null); setProposal(null)
    const r = await window.tyslin.studio.ask(agentId, projectId, prompt, `Canvas: ${file?.name ?? 'document'}`)
    setBusy(false)
    if (!r.ok) { setError(r.error ?? 'The agent could not answer.'); return }
    const whole = mode === 'rewrite' && start === end
    setProposal({ mode, text: r.reply.trim(), start: whole ? 0 : start, end: whole ? text.length : end, sessionId: r.sessionId })
  }
  const accept = (): void => {
    if (!proposal || text === null) return
    const next = proposal.mode === 'continue'
      ? text.replace(/\s*$/, '') + '\n\n' + proposal.text + '\n'
      : text.slice(0, proposal.start) + proposal.text + text.slice(proposal.end)
    setText(next); setDirty(true); setProposal(null)
  }
  const insertAnswer = (): void => {
    if (!proposal || text === null) return
    const at = range[1]
    setText(text.slice(0, at) + '\n\n' + proposal.text + '\n\n' + text.slice(at)); setDirty(true); setProposal(null)
  }

  const words = text ? (text.trim().match(/\S+/g)?.length ?? 0) : 0
  const selLen = range[1] - range[0]

  return (
    <div className="studio">
      <StudioFiles kind="canvas" title="Canvas" newLabel="New document" projects={projects} projectId={projectId}
        onProject={(id) => { setProjectId(id); void open(null) }} selected={file?.path ?? null} onSelect={(f) => void open(f)} refreshKey={refresh}
        onNew={(n) => void create(n)} onDelete={async (f) => { await window.tyslin.studio.remove(projectId, f.path); if (file?.path === f.path) void open(null); setRefresh((r) => r + 1) }} />
      <div className="studio-main">
        {text === null ? (
          <div className="studio-empty">
            <Icon name="canvas" size={36} />
            <h1>Canvas</h1>
            <p className="lead">Draft a document with an agent beside you: rewrite a passage, continue the text or ask about it. Documents are Markdown files in the project folder under <code className="mono">canvas/</code>.</p>
          </div>
        ) : (
          <>
            <div className="studio-bar">
              <strong className="studio-title">{file?.name}</strong>
              <span className="hint">{SAVE_LABEL[save]}</span>
              <span style={{ flex: 1 }} />
              <span className="hint mono">{words} words{selLen > 0 ? ` · ${selLen} selected` : ''}</span>
              <button type="button" className="btn btn-sm" onClick={() => file && void window.tyslin.studio.reveal(projectId, file.path)}>Show file</button>
            </div>
            <div className="studio-split">
              <textarea ref={ta} className="cv-editor" value={text} aria-label="Document" spellCheck
                onChange={(e) => { setText(e.target.value); setDirty(true) }} onSelect={track} onKeyUp={track} onMouseUp={track} />
              <aside className="studio-side">
                <span className="section-label" style={{ padding: 0 }}>Work with an agent</span>
                <label className="field" style={{ gap: 4 }}><span className="label">Agent or assistant</span><AgentSelect agents={agents} value={agentId} onChange={setAgentId} /></label>
                <div className="seg" role="group" aria-label="What to do">
                  {([['rewrite', 'Rewrite'], ['continue', 'Continue'], ['ask', 'Ask']] as const).map(([m, label]) => (
                    <button key={m} type="button" className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>{label}</button>
                  ))}
                </div>
                <span className="hint">{mode === 'rewrite' ? (selLen ? 'Rewrites the selected passage.' : 'Select a passage, or the whole document is rewritten.') : mode === 'continue' ? 'Adds new text at the end.' : 'Answers a question about the document; nothing changes unless you insert it.'}</span>
                <textarea className="textarea" rows={4} value={instruction} onChange={(e) => setInstruction(e.target.value)} aria-label="Instruction"
                  placeholder={mode === 'rewrite' ? 'e.g. Shorter and friendlier' : mode === 'continue' ? 'e.g. Add a section on pricing' : 'e.g. What is missing for an investor?'} />
                <button type="button" className="btn btn-primary" disabled={busy || !agentId} onClick={() => void run()}>{busy ? 'Working…' : mode === 'ask' ? 'Ask' : mode === 'continue' ? 'Continue' : 'Rewrite'}</button>
                {error && <p className="hint account-error" role="alert">{error}</p>}
                {proposal && (
                  <div className="cv-proposal">
                    <span className="section-label" style={{ padding: 0 }}>{proposal.mode === 'ask' ? 'Answer' : 'Proposed text'}</span>
                    <pre>{proposal.text}</pre>
                    <div className="row" style={{ gap: 6 }}>
                      {proposal.mode === 'ask'
                        ? <button type="button" className="btn btn-sm" onClick={insertAnswer}>Insert at cursor</button>
                        : <button type="button" className="btn btn-sm btn-primary" onClick={accept}>{proposal.mode === 'continue' ? 'Add to document' : 'Replace'}</button>}
                      <button type="button" className="btn btn-sm" onClick={() => setProposal(null)}>Discard</button>
                      {proposal.sessionId && <button type="button" className="link-btn" onClick={() => onOpenChat(agentId, projectId, proposal.sessionId)}>Open chat</button>}
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
