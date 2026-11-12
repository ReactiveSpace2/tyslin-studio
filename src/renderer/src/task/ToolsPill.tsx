import { useState } from 'react'
import type { Agent, McpServerInfo } from '@shared/types'
import { MCP_PRESETS } from '@shared/mcpPresets'
import { connectedTool, TOOL_CATALOG, type ToolDef } from '@shared/toolCatalog'
import { firstName } from '../boardStats'
import { Icon } from '../components/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const titleOf = (s: McpServerInfo): string => s.title || (MCP_PRESETS.find((p) => p.id === s.preset)?.title ?? s.name)
const toolCount = (n: number): string => `${n} tool${n === 1 ? '' : 's'}`

/**
 * B on the canvas: "Tools · n" under the message box, the always-there overview. A small panel lists what the
 * team has, who has it and its last test, with Test, Add a tool (the catalogue, into the thread's setup card) and
 * a link to the agency's Connectors tab for everything else.
 */
export function ToolsPill({ agencyName, team, servers, onTest, onAdd, onMore, className }: { agencyName: string; team: Agent[]; servers: McpServerInfo[]; onTest: (id: string) => Promise<void>; onAdd: (tool: ToolDef) => void; onMore: () => void; className?: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const teamIds = new Set(team.map((a) => a.id))
  const mine = servers.filter((s) => s.agentIds.length === 0 || s.agentIds.some((id) => teamIds.has(id)))
  const missing = TOOL_CATALOG.filter((t) => !connectedTool(t, servers, teamIds))
  const test = async (id: string): Promise<void> => { setTesting(id); try { await onTest(id) } finally { setTesting(null) } }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className={className} aria-label={`Tools for ${agencyName}: ${mine.length}`}>Tools · {mine.length}</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] rounded-xl p-2.5 shadow-lg">
        <span className="flex items-center justify-between px-1 pb-2"><strong className="text-sm">Tools for {agencyName}</strong><Button variant="link" size="sm" className="h-7 px-1 text-xs" onClick={() => { setOpen(false); onMore() }}>Open Connectors</Button></span>
        {mine.length === 0 && <p className="px-1 pb-2 text-[13px] text-muted-foreground">No tools yet. A tool lets the team reach something outside its folder: a browser, GitHub, Linear, Stripe.</p>}
        {mine.map((s) => {
          const t = s.lastTest
          const who = team.filter((a) => s.agentIds.includes(a.id)).map((a) => firstName(a.name)).join(', ')
          return (
            <span key={s.id} className="flex items-center gap-2.5 border-t border-border px-1 py-2">
              <span className="grid size-8 flex-none place-items-center rounded-lg border border-border bg-muted text-xs font-bold">{titleOf(s).slice(0, 1).toUpperCase()}</span>
              <span className="flex min-w-0 flex-1 flex-col"><strong className="truncate text-[13.5px] font-semibold">{titleOf(s)}</strong><span className="truncate text-xs text-muted-foreground">{t?.ok ? `${toolCount(t.tools?.length ?? 0)} · ` : ''}{who || 'nobody yet'}</span></span>
              {t ? <Badge variant={t.ok ? 'soft' : 'destructive'}>{t.ok ? 'Connected' : 'Not working'}</Badge> : <Badge variant="secondary">Not tested</Badge>}
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" disabled={testing === s.id} onClick={() => void test(s.id)}>{testing === s.id ? 'Testing…' : 'Test'}</Button>
            </span>
          )
        })}
        <span className="flex items-center gap-2 border-t border-border px-1 pt-2.5 pb-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-8"><Icon name="plus" size={12} /> Add a tool</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[260px] rounded-xl p-1.5 shadow-lg">
              {missing.map((t) => (
                <DropdownMenuItem key={t.id} className="min-h-10 cursor-pointer gap-2.5 rounded-md px-2.5" onSelect={() => { setOpen(false); onAdd(t) }}>
                  <span className="grid size-6 flex-none place-items-center rounded-md border border-border bg-muted text-[11px] font-bold">{t.title.slice(0, 1)}</span>
                  <span className="flex min-w-0 flex-col"><span className="text-sm">{t.title}</span><span className="truncate text-xs text-muted-foreground">{t.needs}</span></span>
                </DropdownMenuItem>
              ))}
              {missing.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem className="min-h-10 cursor-pointer gap-2.5 rounded-md px-2.5 text-green" onSelect={() => { setOpen(false); onMore() }}><Icon name="search" size={14} /> Find another tool…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-xs text-muted-foreground">Each needs your own sign-in or token; nothing is connected for you.</span>
        </span>
      </PopoverContent>
    </Popover>
  )
}
