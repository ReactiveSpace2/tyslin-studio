import { useState } from 'react'
import { needsLibreOffice, pdfExportable, zoomable, type PreviewKind } from '@shared/preview'
import { Icon } from '../Icon'
import { useOffice } from './useOffice'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export const ZOOMS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2] as const

interface Props {
  projectId: string
  path: string
  kind: PreviewKind
  zoom: number
  onZoom: (z: number) => void
  /** Shown in the panel; errors and "Saved to …". */
  onStatus: (s: string | null) => void
  expanded?: boolean
  onExpand?: () => void
  /** One download icon with the whole menu behind it (the task's one-row Preview header). */
  compact?: boolean
}

const msg = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/**
 * The right side of an artifact's header, as in Claude's artifact panel: zoom, "Download as PDF" with a menu
 * (as PDF, original, open in its app, show in folder) and expand. Used by the task's Preview panel and Files.
 */
export function ArtifactToolbar({ projectId, path, kind, zoom, onZoom, onStatus, expanded, onExpand, compact }: Props): JSX.Element {
  const { available: office } = useOffice()
  const [busy, setBusy] = useState(false)
  // Office files need LibreOffice for PDF; pages and PDFs never do.
  const canPdf = pdfExportable(kind) && (kind === 'page' || kind === 'pdf' || office === true)

  const run = async (label: string, job: () => Promise<string | null>): Promise<void> => {
    if (busy) return
    setBusy(true); onStatus(label)
    try { const saved = await job(); onStatus(saved ? `Saved to ${saved}` : null) } catch (e) { onStatus(msg(e)) } finally { setBusy(false) }
  }
  const asPdf = (): Promise<void> => run(kind === 'page' || kind === 'pdf' ? 'Saving the PDF…' : 'Converting with LibreOffice…', () => window.tyslin.preview.exportPdf(projectId, path))
  const original = (): Promise<void> => run('Saving…', () => window.tyslin.preview.saveCopy(projectId, path))

  return (
    <div className="flex flex-none items-center gap-1">
      {zoomable(kind) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 font-mono text-xs" aria-label={`Zoom, ${Math.round(zoom * 100)}%`}>{Math.round(zoom * 100)}%<Icon name="chevron" size={12} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-28">
            <DropdownMenuRadioGroup value={String(zoom)} onValueChange={(v) => onZoom(Number(v))}>
              {ZOOMS.map((z) => <DropdownMenuRadioItem key={z} value={String(z)} className="font-mono text-xs">{Math.round(z * 100)}%</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {compact ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Download" title="Download" disabled={busy}><Icon name="download" size={14} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {pdfExportable(kind) && <DropdownMenuItem disabled={!canPdf} onSelect={() => void asPdf()}>Download as PDF{!canPdf && needsLibreOfficeHint(kind)}</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => void original()}>Download original</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void window.tyslin.drive.open(projectId, path).catch((e: unknown) => onStatus(msg(e)))}>Open in its app</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void window.tyslin.drive.reveal(projectId, path).catch((e: unknown) => onStatus(msg(e)))}>Show in folder</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
      <ButtonGroup>
        <Button variant="outline" size="sm" className="h-8 text-xs" disabled={busy} onClick={() => void (canPdf ? asPdf() : original())}>
          {canPdf ? 'Download as PDF' : 'Download'}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-8" aria-label="More download options" disabled={busy}><Icon name="chevron" size={12} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {pdfExportable(kind) && <DropdownMenuItem disabled={!canPdf} onSelect={() => void asPdf()}>Download as PDF{!canPdf && needsLibreOfficeHint(kind)}</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => void original()}>Download original</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void window.tyslin.drive.open(projectId, path).catch((e: unknown) => onStatus(msg(e)))}>Open in its app</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void window.tyslin.drive.reveal(projectId, path).catch((e: unknown) => onStatus(msg(e)))}>Show in folder</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      )}
      {onExpand && (
        <Button variant="ghost" size="icon" className="size-8" aria-label={expanded ? 'Back to the conversation' : 'Expand'} title={expanded ? 'Back to the conversation' : 'Expand'} onClick={onExpand}>
          <Icon name={expanded ? 'collapse' : 'expand'} size={14} />
        </Button>
      )}
    </div>
  )
}

const needsLibreOfficeHint = (kind: PreviewKind): JSX.Element | null =>
  needsLibreOffice(kind) || kind === 'word' || kind === 'sheet' ? <span className="ml-auto pl-3 text-[11px] text-muted-foreground">needs LibreOffice</span> : null
