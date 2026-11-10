import { shell } from 'electron'
import { existsSync, readFileSync, realpathSync, statSync } from 'fs'
import { relative, sep } from 'path'
import { diffLines } from 'diff'
import { simpleGit, type SimpleGit } from 'simple-git'
import type { GitBranches, GitCommit, GitCommitFile, GitDiff, GitFile, GitIdentity, GitLetter, GitStatus } from '@shared/types'
import { inside, root } from './drive'

/**
 * Source control for the Files editor (10 Nov 2026): the user's own installed git, run in the agency folder.
 * simple-git spawns git with argument arrays (never a shell). Every path passes drive.ts `inside` (folder
 * confinement and symlink checks) and goes after `--`, so a file name can't be read as an option.
 * Safety rules: no force push, reset --hard, rebase or history rewriting; pull is --ff-only; commits use the
 * user's own identity with nothing added to the message; credentials are git's own (helper, SSH agent) and
 * Tyslin never asks for or stores a password or token. GIT_TERMINAL_PROMPT=0 makes git fail with its own
 * message instead of waiting for a password on a terminal nobody can see.
 */

const NETWORK_TIMEOUT = 90_000
const MAX_SHOW = 2 * 1024 * 1024

interface Repo { git: SimpleGit; folder: string; /** The folder's path inside the repository ('' at the top), with a trailing '/'. */ prefix: string }

/**
 * Variables that only matter to a person at a terminal (editors, pagers) or to another app's password prompt
 * (VS Code's GIT_ASKPASS): dropped, so git never waits on a window nobody sees. Everything else of the user's
 * environment (SSH settings, GIT_CONFIG_*, proxies) passes through, so git behaves as it does in their terminal.
 */
const DROP_ENV = new Set(['EDITOR', 'VISUAL', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR', 'PAGER', 'GIT_PAGER', 'GIT_ASKPASS', 'SSH_ASKPASS', 'PREFIX'])

function env(): Record<string, string> {
  const e: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string' && !DROP_ENV.has(k.toUpperCase())) e[k] = v
  e.GIT_TERMINAL_PROMPT = '0'
  e.GIT_OPTIONAL_LOCKS = '0'
  return e
}

/**
 * simple-git refuses some environment variables unless allowed. These allowances only let the user's own
 * environment through (Tyslin never passes -c, --exec, --upload-pack or similar arguments).
 */
const UNSAFE = {
  allowUnsafeSshCommand: true,
  allowUnsafeConfigPaths: true,
  allowUnsafeConfigEnvCount: true,
  allowUnsafeGitProxy: true,
  allowUnsafeExec: true,
  allowUnsafeTemplateDir: true,
  allowUnsafeDiffExternal: true
}

function gitAt(folder?: string, timeout?: number): SimpleGit {
  const e = env()
  // simple-git 4 strips GIT_* variables it isn't told about; these are the user's own (plus the two set above).
  const allowEnvironment = Object.keys(e).filter((k) => /^git_/i.test(k) || /^(ssh_askpass|editor|visual|pager|prefix)$/i.test(k))
  return simpleGit({ ...(folder ? { baseDir: folder } : {}), binary: 'git', maxConcurrentProcesses: 4, trimmed: false, unsafe: UNSAFE, allowEnvironment, ...(timeout ? { timeout: { block: timeout } } : {}) }).env(e)
}

const message = (e: unknown): string => {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^(fatal|error): /gm, '').trim() || 'git failed.'
}

/** Runs a git step and turns its failure into git's own message. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn() } catch (e) { throw new Error(message(e)) }
}

let installed: boolean | null = null
async function gitInstalled(): Promise<boolean> {
  if (installed) return true
  try { installed = (await gitAt().version()).installed } catch { installed = false }
  return installed
}

async function repo(projectId: string | null, timeout?: number): Promise<Repo> {
  const { folder } = root(projectId)
  const git = gitAt(folder, timeout)
  const top = (await run(() => git.revparse(['--show-toplevel']))).trim()
  let rel = relative(realpathSync(top), realpathSync(folder)).split(sep).join('/')
  if (rel.startsWith('..')) rel = ''
  return { git, folder, prefix: rel ? rel + '/' : '' }
}

/** A folder-relative path, confined to the folder, for a pathspec after `--`. */
function spec(r: Repo, path: string): string {
  const abs = inside(r.folder, path)
  return relative(r.folder, abs).split(sep).join('/')
}

/** A repository path from git (relative to the top) as a folder path, or null when it is outside the folder. */
function fromRepo(r: Repo, p: string): string | null {
  const clean = p.replace(/^"|"$/g, '')
  if (!r.prefix) return clean
  return clean.startsWith(r.prefix) ? clean.slice(r.prefix.length) : null
}

const letter = (c: string): GitLetter | null => {
  if (c === '?') return 'U'
  if (c === 'M' || c === 'T') return 'M'
  if (c === 'A') return 'A'
  if (c === 'D') return 'D'
  if (c === 'R') return 'R'
  if (c === 'C') return 'A'
  if (c === 'U') return 'M'
  return null
}

/** The repository has a commit (git exits 1 quietly before the first one, which simple-git doesn't treat as a failure). */
async function hasHead(git: SimpleGit): Promise<boolean> {
  try { return /^[0-9a-f]{7,}/.test((await git.raw(['rev-parse', '--verify', '-q', 'HEAD'])).trim()) } catch { return false }
}

const NO_GIT: GitStatus = { installed: false, repo: false, branch: null, detached: false, tracking: null, ahead: 0, behind: 0, files: [], hasCommits: false, hasRemote: false }

export async function gitStatus(projectId: string | null): Promise<GitStatus> {
  if (!(await gitInstalled())) return NO_GIT
  const { folder } = root(projectId)
  const git = gitAt(folder)
  try { if (!(await git.checkIsRepo())) return { ...NO_GIT, installed: true } } catch { return { ...NO_GIT, installed: true } }
  const r = await repo(projectId)
  const s = await run(() => r.git.status(['--', '.']))
  const files: GitFile[] = []
  for (const f of s.files) {
    const path = fromRepo(r, f.path)
    if (path === null) continue
    const untracked = f.index === '?' && f.working_dir === '?'
    files.push({
      path,
      from: f.from ? fromRepo(r, f.from) ?? undefined : undefined,
      staged: untracked ? null : letter(f.index),
      unstaged: untracked ? 'U' : letter(f.working_dir)
    })
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  const hasCommits = await hasHead(r.git)
  let hasRemote = false
  try { hasRemote = (await r.git.getRemotes()).length > 0 } catch { /* none */ }
  return {
    installed: true, repo: true, branch: s.current || null, detached: s.detached, tracking: s.tracking || null,
    ahead: s.ahead, behind: s.behind, files, hasCommits, hasRemote
  }
}

/** A file's text at a ref ('HEAD', ':' for the index, a commit hash, `hash^`); null when it isn't there. */
export async function gitShow(projectId: string | null, path: string, ref: string): Promise<string | null> {
  const r = await repo(projectId)
  const p = spec(r, path)
  const at = String(ref ?? '')
  if (!/^(:|HEAD|[0-9a-f]{4,64})\^?$/.test(at)) throw new Error('That is not a commit.')
  try {
    const text = await r.git.show([`${at === ':' ? '' : at}:./${p}`])
    if (text.length > MAX_SHOW) throw new Error('too large')
    if (text.slice(0, 8000).includes('\0')) return null
    return text
  } catch { return null }
}

function count(before: string, after: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const part of diffLines(before, after)) {
    if (part.added) added += part.count ?? 0
    else if (part.removed) removed += part.count ?? 0
  }
  return { added, removed }
}

/** Working tree vs HEAD, or (staged) the index vs HEAD. */
export async function gitDiff(projectId: string | null, path: string, staged: boolean): Promise<GitDiff> {
  const r = await repo(projectId)
  const p = spec(r, path)
  const before = (await gitShow(projectId, p, 'HEAD')) ?? ''
  let after = ''
  if (staged) after = (await gitShow(projectId, p, ':')) ?? ''
  else {
    const abs = inside(r.folder, p)
    if (existsSync(abs) && statSync(abs).isFile()) {
      if (statSync(abs).size > MAX_SHOW) throw new Error('This file is too large to compare here.')
      const buf = readFileSync(abs)
      if (buf.subarray(0, 8000).includes(0)) throw new Error('This isn\'t a text file, so there is no diff to show.')
      after = buf.toString('utf8')
    }
  }
  return { path: p, before, after, ...count(before, after), label: staged ? 'Staged vs HEAD' : 'Working tree vs HEAD' }
}

/** A commit's version of a file against its parent. */
export async function gitCommitDiff(projectId: string | null, path: string, hash: string): Promise<GitDiff> {
  const before = (await gitShow(projectId, path, `${hash}^`)) ?? ''
  const after = (await gitShow(projectId, path, hash)) ?? ''
  return { path, before, after, ...count(before, after), label: `${hash.slice(0, 7)} vs its parent` }
}

export async function gitStage(projectId: string | null, paths: string[]): Promise<void> {
  const r = await repo(projectId)
  const specs = paths.map((p) => spec(r, p))
  if (specs.length) await run(() => r.git.raw(['add', '-A', '--', ...specs]))
}

export async function gitUnstage(projectId: string | null, paths: string[]): Promise<void> {
  const r = await repo(projectId)
  const specs = paths.map((p) => spec(r, p))
  if (!specs.length) return
  // Before the first commit there is no HEAD to restore from: take the files out of the index instead.
  if (await hasHead(r.git)) await run(() => r.git.raw(['restore', '--staged', '--', ...specs]))
  else await run(() => r.git.raw(['rm', '--cached', '-r', '-q', '--', ...specs]))
}

/** Throws away unstaged changes: tracked files go back to the staged (or committed) text; new files go to the Trash. */
export async function gitDiscard(projectId: string | null, paths: string[]): Promise<void> {
  const r = await repo(projectId)
  const s = await gitStatus(projectId)
  for (const p of paths.map((x) => spec(r, x))) {
    const f = s.files.find((x) => x.path === p)
    if (!f?.unstaged) continue
    if (f.unstaged === 'U') { const abs = inside(r.folder, p); if (existsSync(abs)) await shell.trashItem(abs); continue }
    await run(() => r.git.raw(['restore', '--worktree', '--', p]))
  }
}

export async function gitIdentity(projectId: string | null): Promise<GitIdentity> {
  const { folder } = root(projectId)
  const git = gitAt(folder)
  const get = async (key: string): Promise<string> => { try { return (await git.raw(['config', '--get', key])).trim() } catch { return '' } }
  return { name: await get('user.name'), email: await get('user.email') }
}

/** Sets the name and email for this repository only (--local); the user's global git config is never touched. */
export async function gitSetIdentity(projectId: string | null, id: GitIdentity): Promise<GitIdentity> {
  const name = String(id.name ?? '').trim()
  const email = String(id.email ?? '').trim()
  if (!name || /[\n<>]/.test(name)) throw new Error('Enter your name.')
  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(email)) throw new Error('Enter a valid email address.')
  const r = await repo(projectId)
  await run(() => r.git.raw(['config', '--local', 'user.name', name]))
  await run(() => r.git.raw(['config', '--local', 'user.email', email]))
  return gitIdentity(projectId)
}

/** Commits what is staged with the user's own identity. The message is used as written: no trailer or co-author line. */
export async function gitCommit(projectId: string | null, msg: string): Promise<string> {
  const text = String(msg ?? '').trim()
  if (!text) throw new Error('Write a commit message first.')
  const id = await gitIdentity(projectId)
  if (!id.name || !id.email) throw new Error('Set your git name and email first.')
  const r = await repo(projectId)
  const res = await run(() => r.git.raw(['commit', '-m', text]))
  return res.trim()
}

export async function gitBranches(projectId: string | null): Promise<GitBranches> {
  const r = await repo(projectId)
  const b = await run(() => r.git.branchLocal())
  return { current: b.current || null, all: b.all }
}

async function validBranch(r: Repo, name: string): Promise<string> {
  const n = String(name ?? '').trim()
  if (!n || n.startsWith('-')) throw new Error('Give the branch a name.')
  try { await r.git.raw(['check-ref-format', '--branch', n]) } catch { throw new Error(`"${n}" isn't a valid branch name.`) }
  return n
}

export async function gitCheckout(projectId: string | null, branch: string): Promise<void> {
  const r = await repo(projectId)
  const b = await run(() => r.git.branchLocal())
  if (!b.all.includes(branch)) throw new Error(`There is no branch called ${branch}.`)
  await run(() => r.git.raw(['switch', branch]))
}

export async function gitCreateBranch(projectId: string | null, name: string): Promise<void> {
  const r = await repo(projectId)
  const n = await validBranch(r, name)
  await run(() => r.git.raw(['switch', '-c', n]))
}

export async function gitLog(projectId: string | null, limit = 50): Promise<GitCommit[]> {
  const r = await repo(projectId)
  if (!(await hasHead(r.git))) return []
  const out = await run(() => r.git.raw(['log', `--max-count=${Math.min(200, Math.max(1, limit))}`, '--format=%H%x1f%h%x1f%an%x1f%at%x1f%s%x1e', '--', '.']))
  return out.split('\x1e').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [hash, short, author, at, subject] = l.split('\x1f')
    return { hash, short, author, date: Number(at) * 1000, message: subject ?? '' }
  })
}

export async function gitCommitFiles(projectId: string | null, hash: string): Promise<GitCommitFile[]> {
  if (!/^[0-9a-f]{4,64}$/.test(String(hash))) throw new Error('That is not a commit.')
  const r = await repo(projectId)
  const out = await run(() => r.git.raw(['show', '--name-status', '--format=', '--no-renames', hash, '--', '.']))
  const files: GitCommitFile[] = []
  for (const line of out.split('\n')) {
    const [code, p] = line.split('\t')
    if (!code || !p) continue
    const path = fromRepo(r, p)
    const l = letter(code[0])
    if (path !== null && l) files.push({ path, letter: l })
  }
  return files
}

/** Fast-forward only: when the branches have split, git's own message comes back and nothing changes. */
export async function gitPull(projectId: string | null): Promise<string> {
  const r = await repo(projectId, NETWORK_TIMEOUT)
  return (await run(() => r.git.raw(['pull', '--ff-only']))).trim()
}

/** Never forced. A branch without an upstream is pushed to `origin` (or the only remote) and tracks it. */
export async function gitPush(projectId: string | null): Promise<string> {
  const r = await repo(projectId, NETWORK_TIMEOUT)
  const s = await run(() => r.git.status())
  if (s.tracking) return (await run(() => r.git.raw(['push']))).trim()
  const remotes = await run(() => r.git.getRemotes())
  if (!remotes.length) throw new Error('This repository has no remote yet. Add one with git remote add, then push.')
  const remote = remotes.find((x) => x.name === 'origin')?.name ?? remotes[0].name
  if (!s.current) throw new Error('Switch to a branch before pushing.')
  return (await run(() => r.git.raw(['push', '--set-upstream', remote, s.current!]))).trim()
}

export async function gitInit(projectId: string | null): Promise<void> {
  if (!(await gitInstalled())) throw new Error('git is not installed.')
  const { folder } = root(projectId)
  await run(() => gitAt(folder).raw(['init']))
}
