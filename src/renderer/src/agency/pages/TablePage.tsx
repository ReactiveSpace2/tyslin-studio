import { useMemo, useState } from 'react'
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState, type VisibilityState } from '@tanstack/react-table'
import { pageFile, type AgencyPageSpec } from '@shared/pages'
import type { AgencyView } from '../../agencies'
import { Icon } from '../../components/Icon'
import { Pose } from '../../components/Pose'
import { usePageData } from './usePageData'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

type Row = Record<string, string | number | null>
const isNumeric = (v: unknown): boolean => typeof v === 'number' || (typeof v === 'string' && /^[-+]?\d[\d,.]*%?$/.test(v.trim()))
const label = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * A table page (pipeline, keywords, test results, environments): shadcn's data table on @tanstack/react-table v8,
 * with sort per column, one filter box over every column and a Columns menu. Columns and rows come from the page's
 * data file (`{ "columns": [...], "rows": [...] }`), which the agency's agents keep up to date; it reloads when the
 * file changes.
 */
export function TablePage({ view, page }: { view: AgencyView; page: AgencyPageSpec }): JSX.Element {
  const file = pageFile(page)
  const res = usePageData(view.agency.id, page.id, file)
  const [sorting, setSorting] = useState<SortingState>([])
  const [filter, setFilter] = useState('')
  const [visibility, setVisibility] = useState<VisibilityState>({})
  const data = res?.kind === 'table' ? res.data : null

  const columns = useMemo<ColumnDef<Row>[]>(() => (data?.columns ?? []).map((c) => ({
    id: c.key,
    accessorFn: (r: Row) => r[c.key] ?? '',
    header: ({ column }) => (
      <Button variant="ghost" size="sm" className="-ml-2.5 h-9 gap-1 px-2.5 font-medium" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        aria-label={`Sort by ${c.label}${column.getIsSorted() ? `, now ${column.getIsSorted() === 'asc' ? 'ascending' : 'descending'}` : ''}`}>
        {label(c.label)}
        <span className={cn('text-muted-foreground', column.getIsSorted() === 'desc' && 'rotate-180')}><Icon name={column.getIsSorted() ? 'arrowUp' : 'updown'} size={12} /></span>
      </Button>
    ),
    cell: ({ getValue }) => {
      const v = getValue() as string | number
      return <span className={cn(isNumeric(v) && 'font-mono text-[13px]')}>{v === '' ? <span className="text-muted-foreground">—</span> : String(v)}</span>
    },
    sortingFn: (a, b, id) => {
      const x = a.getValue(id), y = b.getValue(id)
      const nx = typeof x === 'number' ? x : parseFloat(String(x).replace(/,/g, '')), ny = typeof y === 'number' ? y : parseFloat(String(y).replace(/,/g, ''))
      return !isNaN(nx) && !isNaN(ny) ? nx - ny : String(x).localeCompare(String(y))
    }
  })), [data])

  const table = useReactTable({
    data: data?.rows ?? [],
    columns,
    state: { sorting, globalFilter: filter, columnVisibility: visibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    onColumnVisibilityChange: setVisibility,
    globalFilterFn: (row, _id, value: string) => Object.values(row.original).some((v) => String(v ?? '').toLowerCase().includes(value.toLowerCase())),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel()
  })

  if (res === null) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (res.missing) {
    return (
      <Empty className="border border-dashed border-border">
        <EmptyHeader>
          <EmptyMedia><Pose pose={3} height={120} /></EmptyMedia>
          <EmptyTitle>No {page.title.toLowerCase()} yet</EmptyTitle>
          <EmptyDescription>{view.agency.name}'s agents keep {page.about} in <span className="font-mono">{file}</span>. It shows here once they write it.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  if (res.error !== undefined) return <Alert variant="destructive"><Icon name="warning" size={16} /><AlertDescription>{res.error}</AlertDescription></Alert>

  const rows = table.getRowModel().rows
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`filter-${page.id}`} className="sr-only">Filter {page.title.toLowerCase()}</label>
        <Input id={`filter-${page.id}`} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${page.title.toLowerCase()}…`} className="h-9 max-w-[320px]" />
        <span className="font-mono text-xs text-muted-foreground">{rows.length === (data?.rows.length ?? 0) ? `${rows.length} row${rows.length === 1 ? '' : 's'}` : `${rows.length} of ${data?.rows.length ?? 0}`} · <span title="The data file">{file}</span></span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto h-9 gap-1.5">Columns <Icon name="chevronDown" size={12} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs">Show columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table.getAllLeafColumns().map((col) => (
              <DropdownMenuCheckboxItem key={col.id} checked={col.getIsVisible()} onCheckedChange={(v) => col.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                {label(data?.columns.find((c) => c.key === col.id)?.label ?? col.id)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((g) => (
              <TableRow key={g.id}>
                {g.headers.map((h) => <TableHead key={h.id} aria-sort={h.column.getIsSorted() === 'asc' ? 'ascending' : h.column.getIsSorted() === 'desc' ? 'descending' : undefined}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>)}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? rows.map((r) => (
              <TableRow key={r.id}>
                {r.getVisibleCells().map((c) => <TableCell key={c.id} className="max-w-[320px] whitespace-normal break-words text-[13.5px]">{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>)}
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={table.getVisibleLeafColumns().length || 1} className="h-20 text-center text-muted-foreground">{data?.rows.length ? 'No row matches the filter.' : 'The file has no rows yet.'}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
