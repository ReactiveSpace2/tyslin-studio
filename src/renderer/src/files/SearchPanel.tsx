import { useEffect, useRef, useState } from 'react'
import type { DriveSearchResult } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Toggle } from '@/components/ui/toggle'
import { errorText } from './useGit'

interface Props {
  projectId: string
  /** Bumped when files change on disk, so results stay current. */
  tick: number
  onOpenAt: (path: string, line: number, col: number, length: number) => void
}

/** Find in files: Match case and Regex toggles; results grouped by file; a row opens the file at that line. */
export function SearchPanel({ projectId, tick, onOpenAt }: Props): JSX.Element {
  const [q, setQ] = useState('')
  const [caseSensitive, setCase] = useState(false)
  const [regex, setRegex] = useState(false)
  const [res, setRes] = useState<DriveSearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    const n = ++seq.current
    if (!q) { setRes(null); setError(null); return }
    const t = setTimeout(() => {
      setBusy(true)
      window.tyslin.drive.search(projectId, q, { caseSensitive, regex })
        .then((r) => { if (n === seq.current) { setRes(r); setError(null) } })
        .catch((e) => { if (n === seq.current) { setRes(null); setError(errorText(e)) } })
        .finally(() => { if (n === seq.current) setBusy(false) })
    }, 250)
    return () => clearTimeout(t)
  }, [q, caseSensitive, regex, projectId, tick])

  const files = res?.files ?? []
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-10 flex-none items-center px-3"><h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Search</h2></div>
      <div className="flex flex-none flex-col gap-1.5 px-3 pb-3">
        <Label htmlFor="files-search" className="text-xs font-normal text-muted-foreground">Find in this folder</Label>
        <div className="flex items-center gap-1">
          <Input id="files-search" ref={input} type="search" className="h-9 min-w-0 flex-1 font-mono text-[13px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Text or pattern" />
          <Toggle size="sm" className="size-9 font-mono text-xs" pressed={caseSensitive} onPressedChange={setCase} aria-label="Match case" title="Match case">Aa</Toggle>
          <Toggle size="sm" className="size-9 font-mono text-xs" pressed={regex} onPressedChange={setRegex} aria-label="Use regular expression" title="Use regular expression">.*</Toggle>
        </div>
        <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {error ? <span className="text-destructive">{error}</span>
            : !q ? 'Searches every text file except .git, node_modules and the app\'s data.'
            : busy && !res ? 'Searching…'
            : res ? `${res.total} ${res.total === 1 ? 'result' : 'results'} in ${files.length} ${files.length === 1 ? 'file' : 'files'}${res.truncated ? ' (stopped at the limit; narrow the search)' : ''}` : ''}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex flex-col gap-2 px-1.5 pb-3">
          {files.map((f) => (
            <section key={f.path} aria-label={f.path} className="min-w-0">
              <div className="flex min-w-0 items-center gap-2 px-2 py-1">
                <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium" title={f.path}>{f.path}</span>
                <Badge variant="soft" className="font-mono">{f.hits.length}</Badge>
              </div>
              {f.hits.map((h) => (
                <button key={h.line + ':' + h.col} type="button" onClick={() => onOpenAt(f.path, h.line, h.col, h.length)}
                  className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left font-mono text-xs outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset">
                  <span className="w-8 flex-none text-right text-muted-foreground">{h.line}</span>
                  <span className="min-w-0 flex-1 truncate">{highlight(h.text, h.col - h.start, h.length)}</span>
                </button>
              ))}
            </section>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function highlight(text: string, col: number, length: number): JSX.Element {
  const t = text.trimStart()
  const cut = text.length - t.length
  const i = Math.max(0, col - 1 - cut)
  if (i > t.length) return <>{t}</>
  return <>{t.slice(0, i)}<mark className="rounded-sm bg-lime-soft text-foreground ring-1 ring-green">{t.slice(i, i + length)}</mark>{t.slice(i + length)}</>
}
