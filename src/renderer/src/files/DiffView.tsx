import { useEffect, useRef } from 'react'
import { unifiedMergeView } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { syntaxHighlighting } from '@codemirror/language'
import type { GitDiff } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { languageFor, tyslinHighlight, tyslinTheme } from './editorSetup'

/**
 * Diff: @codemirror/merge in unified view, read-only. Shows `after` with the lines that were in `before`
 * as removed chunks: working tree (or the index) vs HEAD, a commit vs its parent, or the disk vs your edit.
 */
export function DiffView({ diff, loading, error }: { diff: GitDiff | null; loading: boolean; error: string | null }): JSX.Element {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current || !diff) return
    const lang = languageFor(diff.path).load()
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: diff.after,
        extensions: [
          lineNumbers(),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          lang ?? [],
          syntaxHighlighting(tyslinHighlight),
          tyslinTheme,
          EditorView.contentAttributes.of({ 'aria-label': `${diff.label}: ${diff.path}` }),
          unifiedMergeView({ original: diff.before, mergeControls: false, highlightChanges: true, gutter: true, syntaxHighlightDeletions: true, collapseUnchanged: { margin: 3, minSize: 8 } })
        ]
      })
    })
    return () => view.destroy()
  }, [diff])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-border px-3 text-xs text-muted-foreground">
        {diff && <><Badge variant="soft">{diff.label}</Badge><span className="min-w-0 truncate font-mono">{diff.path} · <span className="text-green">+{diff.added}</span> <span className="text-destructive">−{diff.removed}</span></span></>}
        {!diff && loading && <span role="status">Loading the diff…</span>}
        {!diff && error && <span className="text-destructive" role="alert">{error}</span>}
      </div>
      {diff && diff.added === 0 && diff.removed === 0 && <p className="px-4 py-3 text-[13px] text-muted-foreground">No text changes (only the file mode or line endings changed).</p>}
      <div ref={host} className="min-h-0 flex-1 overflow-hidden [&_.cm-editor]:h-full" />
    </div>
  )
}
