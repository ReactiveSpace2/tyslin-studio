import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitBranches, GitCommit, GitFile, GitLetter, GitStatus } from '@shared/types'

/**
 * git for the Files screen: status, branches and history for one agency folder, refreshed after every action and
 * when the folder watcher reports a change. All git runs in main (main/git.ts); errors come back as git's own words.
 */

export const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

export interface Git {
  status: GitStatus | null
  branches: GitBranches | null
  log: GitCommit[]
  /** The file's change for the Explorer and the tabs: the working tree's letter, else the index's. */
  letterOf: (path: string) => GitLetter | null
  fileOf: (path: string) => GitFile | null
  staged: GitFile[]
  changes: GitFile[]
  busy: string | null
  error: string | null
  setError: (e: string | null) => void
  refresh: () => Promise<void>
  /** Runs one git action with a busy label; refreshes afterwards; returns false (and shows git's message) on failure. */
  act: (label: string, fn: () => Promise<unknown>) => Promise<boolean>
}

export function useGit(projectId: string | null): Git {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [branches, setBranches] = useState<GitBranches | null>(null)
  const [log, setLog] = useState<GitCommit[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const refresh = useCallback(async () => {
    if (!projectId) { setStatus(null); return }
    const n = ++seq.current
    try {
      const s = await window.tyslin.git.status(projectId)
      if (n !== seq.current) return
      setStatus(s)
      if (s.repo) {
        const [b, l] = await Promise.all([window.tyslin.git.branches(projectId).catch(() => null), window.tyslin.git.log(projectId, 50).catch(() => [])])
        if (n !== seq.current) return
        setBranches(b)
        setLog(l)
      } else { setBranches(null); setLog([]) }
    } catch (e) {
      if (n === seq.current) setError(errorText(e))
    }
  }, [projectId])

  useEffect(() => { setStatus(null); setBranches(null); setLog([]); setError(null); void refresh() }, [refresh])

  const act = async (label: string, fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(label)
    setError(null)
    try { await fn(); return true } catch (e) { setError(errorText(e)); return false } finally { setBusy(null); await refresh() }
  }

  const files = status?.files ?? []
  return {
    status, branches, log, busy, error, setError, refresh, act,
    letterOf: (path) => { const f = files.find((x) => x.path === path); return f ? f.unstaged ?? f.staged : null },
    fileOf: (path) => files.find((x) => x.path === path) ?? null,
    staged: files.filter((f) => f.staged),
    changes: files.filter((f) => f.unstaged)
  }
}

/** Colour of a git letter (tokens only). */
export const LETTER_CLASS: Record<GitLetter, string> = {
  M: 'text-text-amber',
  A: 'text-green',
  D: 'text-destructive',
  U: 'text-text-teal',
  R: 'text-text-violet'
}
export const LETTER_LABEL: Record<GitLetter, string> = { M: 'Modified', A: 'Added', D: 'Deleted', U: 'Untracked', R: 'Renamed' }
