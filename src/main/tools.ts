import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { applyHunks, diffHunks } from '@shared/diff'
import type { Agent, PendingChange, Project, RunEventBody } from '@shared/types'
import * as db from './db'

/** Provider-neutral tool definition; each runtime maps it to its own wire format. */
export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResult {
  id: string
  content: string
  isError: boolean
}

export interface ToolContext {
  agent: Agent
  project: Project
  runId: string
  sessionId: string
  emit: (e: RunEventBody) => void
}

const MAX_READ_BYTES = 200_000

export function listProjectFiles(folder: string, limit = 200): string[] {
  const out: string[] = []
  const skip = new Set(['node_modules', '.git', 'dist', 'out', '.next'])
  const walk = (dir: string, depth: number): void => {
    if (out.length >= limit || depth > 4) return
    let entries: string[] = []
    try { entries = readdirSync(dir) } catch { return }
    for (const name of entries) {
      if (out.length >= limit) return
      if (name.startsWith('.') || skip.has(name)) continue
      const full = join(dir, name)
      try {
        if (statSync(full).isDirectory()) walk(full, depth + 1)
        else out.push(relative(folder, full))
      } catch { /* unreadable entry */ }
    }
  }
  walk(folder, 0)
  return out
}

export const FILE_TOOLS: ToolDef[] = [
  {
    name: 'list_files',
    description: 'List files in the project folder (relative paths).',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'read_file',
    description: 'Read a text file from the project folder.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the project folder' } },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Create a file or replace its whole contents. The user may review the change before it is written; the result says whether it was accepted.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the project folder' },
        content: { type: 'string', description: 'The full new file contents' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'edit_file',
    description: 'Replace one exact snippet in an existing file. old_string must appear exactly once. The user may review the change before it is written.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the project folder' },
        old_string: { type: 'string', description: 'Exact text to replace' },
        new_string: { type: 'string', description: 'Replacement text' }
      },
      required: ['path', 'old_string', 'new_string']
    }
  }
]

/** Waiting runs, keyed by change id, resolved when the user reviews the change. */
const waiting = new Map<string, (c: PendingChange) => void>()

/** Resolves a path inside the project folder, refusing anything that escapes it or touches .git. */
function safePath(folder: string, p: unknown): { abs: string; rel: string } {
  if (typeof p !== 'string' || !p.trim()) throw new Error('path is required')
  const abs = resolve(folder, p)
  const rel = relative(folder, abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${p} is outside the project folder`)
  if (rel.split(sep).includes('.git')) throw new Error('The .git folder is off limits')
  return { abs, rel }
}

function readText(abs: string): string | null {
  if (!existsSync(abs)) return null
  if (statSync(abs).size > MAX_READ_BYTES) throw new Error('File is too large to read (over 200 KB)')
  return readFileSync(abs, 'utf8')
}

/** Works out the full proposed contents for a write or edit call. */
function propose(folder: string, call: ToolCall): { abs: string; rel: string; original: string | null; proposed: string } {
  const { abs, rel } = safePath(folder, call.input.path)
  const original = readText(abs)
  if (call.name === 'write_file') {
    if (typeof call.input.content !== 'string') throw new Error('content is required')
    return { abs, rel, original, proposed: call.input.content }
  }
  const { old_string: from, new_string: to } = call.input
  if (typeof from !== 'string' || typeof to !== 'string') throw new Error('old_string and new_string are required')
  if (original === null) throw new Error(`${rel} does not exist`)
  const first = original.indexOf(from)
  if (!from || first < 0) throw new Error(`old_string was not found in ${rel}`)
  if (original.indexOf(from, first + 1) >= 0) throw new Error(`old_string appears more than once in ${rel}; include more context`)
  return { abs, rel, original, proposed: original.slice(0, first) + to + original.slice(first + from.length) }
}

function writeText(abs: string, text: string): void {
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text, 'utf8')
}

function describeDecision(c: PendingChange): ToolResult['content'] {
  const note = c.note ? ` Their note: ${c.note}` : ''
  switch (c.status) {
    case 'accepted': return `The user accepted the change. ${c.filePath} was written.${note}`
    case 'partial': return `The user accepted only part of the change to ${c.filePath}; the rest was rejected. Read the file to see what it contains now.${note}`
    case 'rejected': return `The user rejected the change to ${c.filePath}. Nothing was written.${note}`
    default: return `The change to ${c.filePath} was not reviewed.`
  }
}

/**
 * Runs one turn's tool calls. Reads run straight away. Writes either go to disk (agent set to
 * "Write directly") or are staged as pending changes; the run then waits until every staged
 * change in the turn has been reviewed, so the user sees them together.
 */
export async function runTools(calls: ToolCall[], ctx: ToolContext): Promise<ToolResult[]> {
  const folder = ctx.project.folder!
  const results: (ToolResult | Promise<ToolResult>)[] = []
  const stagedPaths = new Set<string>()
  let staged = 0

  for (const call of calls) {
    try {
      if (call.name === 'list_files') {
        results.push({ id: call.id, content: listProjectFiles(folder).join('\n') || '(empty)', isError: false })
      } else if (call.name === 'read_file') {
        const { abs, rel } = safePath(folder, call.input.path)
        const text = readText(abs)
        if (text === null) throw new Error(`${rel} does not exist`)
        results.push({ id: call.id, content: text, isError: false })
      } else if (call.name === 'write_file' || call.name === 'edit_file') {
        const p = propose(folder, call)
        if (ctx.agent.writeMode === 'direct') {
          writeText(p.abs, p.proposed)
          results.push({ id: call.id, content: `${p.rel} was written.`, isError: false })
          continue
        }
        if (stagedPaths.has(p.rel)) throw new Error(`${p.rel} already has a change waiting for review in this step; put all edits to a file in one call`)
        stagedPaths.add(p.rel)
        staged++
        results.push(stageChange(ctx, call.id, p.rel, p.original, p.proposed)
          .then((c) => ({ id: call.id, content: describeDecision(c), isError: false })))
      } else {
        throw new Error(`Unknown tool ${call.name}`)
      }
    } catch (err) {
      results.push({ id: call.id, content: err instanceof Error ? err.message : String(err), isError: true })
    }
  }

  if (staged) ctx.emit({ type: 'state_update', status: 'waiting_for_review' })
  const out = await Promise.all(results)
  if (staged) ctx.emit({ type: 'state_update', status: 'running' })
  for (const r of out) ctx.emit({ type: 'tool_result', toolCallId: r.id, content: r.content, isError: r.isError })
  return out
}

/** Stages a change for review and resolves with the user's decision. */
function stageChange(ctx: Pick<ToolContext, 'runId' | 'sessionId' | 'emit'>, toolCallId: string, rel: string, original: string | null, proposed: string): Promise<PendingChange> {
  const change = db.createChange({ runId: ctx.runId, sessionId: ctx.sessionId, toolCallId, filePath: rel, original, proposed })
  const decided = new Promise<PendingChange>((done) => waiting.set(change.id, done))
  ctx.emit({ type: 'approval_needed', toolCallId, changeId: change.id, filePath: rel })
  return decided
}

/**
 * File access for external (ACP) agents: reads and writes confined to the project folder, with
 * writes going through the same review as built-in agents unless the agent writes directly.
 */
export function acpFileAccess(ctx: ToolContext): {
  read: (absPath: string, line?: number | null, limit?: number | null) => string
  write: (absPath: string, content: string, toolCallId: string) => Promise<void>
} {
  const folder = ctx.project.folder!
  return {
    read: (absPath, line, limit) => {
      const { abs, rel } = safePath(folder, absPath)
      const text = readText(abs)
      if (text === null) throw new Error(`${rel} does not exist`)
      if (!line && !limit) return text
      const lines = text.split('\n')
      const from = Math.max(0, (line ?? 1) - 1)
      return lines.slice(from, limit ? from + limit : undefined).join('\n')
    },
    write: async (absPath, content, toolCallId) => {
      const { abs, rel } = safePath(folder, absPath)
      if (ctx.agent.writeMode === 'direct') {
        writeText(abs, content)
        return
      }
      ctx.emit({ type: 'state_update', status: 'waiting_for_review' })
      const c = await stageChange(ctx, toolCallId, rel, readText(abs), content)
      ctx.emit({ type: 'state_update', status: 'running' })
      // ACP has no partial-success reply, so anything short of a full accept is reported as an error.
      if (c.status !== 'accepted') throw new Error(describeDecision(c))
    }
  }
}

/** Ends the review wait for a stopped run, so its staged changes don't hang forever. */
export function expireRunChanges(runId: string): void {
  for (const [id, done] of waiting) {
    const c = db.getChange(id)
    if (c?.runId !== runId || c.status !== 'pending') continue
    db.setChangeStatus(id, 'expired')
    done(db.getChange(id)!)
    waiting.delete(id)
  }
}

/** Applies the user's decision to disk and hands it back to the waiting run. */
export function resolveChange(changeId: string, acceptedHunks: number[], note: string): PendingChange {
  const change = db.getChange(changeId)
  if (!change) throw new Error('Change not found')
  if (change.status !== 'pending') throw new Error('This change has already been reviewed')
  const session = db.getSession(change.sessionId)
  const project = session?.projectId ? db.getProject(session.projectId) : null
  if (!project?.folder) throw new Error('The project folder is no longer linked')

  const original = change.original ?? ''
  const { hunkCount } = diffHunks(original, change.proposed)
  const accepted = [...new Set(acceptedHunks)].filter((h) => h >= 0 && h < hunkCount)
  const status = accepted.length === 0 ? 'rejected' : accepted.length === hunkCount ? 'accepted' : 'partial'

  if (status !== 'rejected') {
    const { abs } = safePath(project.folder, change.filePath)
    const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null
    if (current !== change.original) throw new Error(`${change.filePath} changed on disk after the agent proposed this edit. Reject it and ask the agent to try again.`)
    writeText(abs, applyHunks(original, change.proposed, accepted))
  }
  db.setChangeStatus(change.id, status, note.trim())
  const updated = db.getChange(change.id)!
  waiting.get(change.id)?.(updated)
  waiting.delete(change.id)
  return updated
}
