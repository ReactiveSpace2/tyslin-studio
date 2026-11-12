import { useEffect, useMemo, useState } from 'react'
import { read, utils, type WorkBook } from 'xlsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

const MAX_ROWS = 1000
const MAX_COLS = 60

/**
 * A spreadsheet (xlsx, xls, ods, csv, tsv) read by SheetJS (Apache-2.0, from cdn.sheetjs.com) and shown as a
 * shadcn Table: column letters, row numbers, values as Excel formats them, one sheet at a time. Read-only;
 * formulas show their last saved value. Big sheets show the first 1,000 rows and 60 columns.
 */
export function SheetView({ projectId, path, nonce, zoom, className }: { projectId: string; path: string; nonce: number; zoom: number; className?: string }): JSX.Element {
  const [book, setBook] = useState<WorkBook | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState('')

  useEffect(() => {
    let live = true
    setBook(null); setError(null)
    void window.tyslin.preview.bytes(projectId, path)
      .then((bytes) => {
        if (!live) return
        const wb = read(bytes, { type: 'array', cellDates: true, sheetRows: MAX_ROWS + 1, dense: true, ...(path.toLowerCase().endsWith('.tsv') ? { FS: '\t' } : {}) })
        setBook(wb)
        setSheet((s) => (wb.SheetNames.includes(s) ? s : wb.SheetNames[0] ?? ''))
      })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e)) })
    return () => { live = false }
  }, [projectId, path, nonce])

  const grid = useMemo(() => {
    const ws = book?.Sheets[sheet]
    if (!ws) return null
    const rows = utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '', blankrows: true })
    const width = Math.min(MAX_COLS, rows.reduce((n, r) => Math.max(n, r.length), 0))
    const ref = ws['!ref'] ? utils.decode_range(ws['!ref']) : null
    return { rows: rows.slice(0, MAX_ROWS), width, cut: rows.length > MAX_ROWS || (ref ? ref.e.c + 1 > MAX_COLS : false) }
  }, [book, sheet])

  if (error) return <p className={cn('p-4 text-[13px] text-destructive', className)} role="alert">This spreadsheet could not be shown: {error}</p>
  if (!book || !grid) return <p className={cn('p-4 text-[13px] text-muted-foreground', className)}>Opening the spreadsheet…</p>

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-auto bg-card">
        {grid.width === 0
          ? <p className="p-4 text-[13px] text-muted-foreground">This sheet is empty.</p>
          : (
            <div style={{ zoom }}>
              <Table className="w-max border-collapse font-mono text-xs">
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-7 w-10 border-r border-border px-2 text-right text-[11px] text-muted-foreground" />
                    {Array.from({ length: grid.width }, (_, c) => <TableHead key={c} className="h-7 min-w-20 border-r border-border px-2 text-center text-[11px] font-medium text-muted-foreground">{utils.encode_col(c)}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grid.rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="border-r border-border bg-muted px-2 py-1 text-right text-[11px] text-muted-foreground">{i + 1}</TableCell>
                      {Array.from({ length: grid.width }, (_, c) => <TableCell key={c} className="max-w-[320px] truncate border-r border-border px-2 py-1" title={String(r[c] ?? '')}>{String(r[c] ?? '')}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
      </div>
      <div className="flex flex-none items-center gap-2 overflow-x-auto border-t border-border px-2 py-1.5">
        {book.SheetNames.length > 1 && (
          <ToggleGroup type="single" spacing={1} value={sheet} onValueChange={(v) => { if (v) setSheet(v) }} aria-label="Sheet">
            {book.SheetNames.map((n) => <ToggleGroupItem key={n} value={n} className="h-7 px-2.5 text-xs data-[state=on]:bg-accent">{n}</ToggleGroupItem>)}
          </ToggleGroup>
        )}
        {grid.cut && <span className="ml-auto flex-none text-[11px] text-muted-foreground">Showing the first {MAX_ROWS.toLocaleString()} rows and {MAX_COLS} columns. Open it in its app for the rest.</span>}
      </div>
    </div>
  )
}
