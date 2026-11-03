import { diffLines } from 'diff'

/** One line-diff part. Consecutive added/removed parts share a hunk index; unchanged parts have none. */
export interface DiffPart {
  kind: 'same' | 'add' | 'del'
  text: string
  hunk: number | null
}

/** Used by main (to apply decisions) and the renderer (to show them), so hunk indexes always agree. */
export function diffHunks(original: string, proposed: string): { parts: DiffPart[]; hunkCount: number } {
  const parts: DiffPart[] = []
  let hunk = -1
  let inHunk = false
  for (const c of diffLines(original, proposed)) {
    if (!c.added && !c.removed) {
      inHunk = false
      parts.push({ kind: 'same', text: c.value, hunk: null })
      continue
    }
    if (!inHunk) {
      hunk++
      inHunk = true
    }
    parts.push({ kind: c.added ? 'add' : 'del', text: c.value, hunk })
  }
  return { parts, hunkCount: hunk + 1 }
}

/** Rebuilds the file keeping additions from accepted hunks and removals from rejected ones. */
export function applyHunks(original: string, proposed: string, accepted: number[]): string {
  const keep = new Set(accepted)
  return diffHunks(original, proposed).parts
    .filter((p) => p.kind === 'same' || (p.kind === 'add') === keep.has(p.hunk!))
    .map((p) => p.text)
    .join('')
}
