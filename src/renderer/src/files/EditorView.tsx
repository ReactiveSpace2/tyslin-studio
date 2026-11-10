import { Icon } from '../components/Icon'
import { cn } from '@/lib/utils'

/**
 * The element CodeMirror mounts in (one EditorView, see useCodeMirror). It stays mounted while Diff or Preview
 * shows, only hidden, so switching back keeps the view, its undo history and scroll position.
 */
export function CodeEditor({ mount, hidden }: { mount: (el: HTMLDivElement | null) => void; hidden: boolean }): JSX.Element {
  return <div ref={mount} className={cn('min-h-0 min-w-0 flex-1 overflow-hidden bg-card [&_.cm-editor]:h-full', hidden && 'hidden')} />
}

/** The editor's 30 px footer: branch, cursor, language, indentation and the save state. */
export function EditorFooter({ branch, cursor, language, indent, state }: { branch: string | null; cursor: string | null; language: string | null; indent: string | null; state: { text: string; tone: 'muted' | 'warn' } | null }): JSX.Element {
  return (
    <footer className="flex h-[30px] flex-none items-center gap-4 overflow-hidden border-t border-border bg-background px-3 font-mono text-xs whitespace-nowrap text-muted-foreground" aria-label="Editor status">
      {branch && <span className="flex min-w-0 items-center gap-1.5"><Icon name="branch" size={13} /><span className="truncate">{branch}</span></span>}
      {cursor && <span>{cursor}</span>}
      {language && <span>{language}</span>}
      {indent && <span>{indent}</span>}
      {state && <span className={cn('ml-auto', state.tone === 'warn' && 'text-foreground')} role="status">{state.text}</span>}
    </footer>
  )
}
