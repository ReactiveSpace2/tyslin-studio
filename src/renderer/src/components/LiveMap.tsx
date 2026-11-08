import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { Avatar } from './Avatar'
import { runsOnLabel } from './RunsOnBadge'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { KIND_LABEL, KIND_TONE, type LiveAgent, type LiveEvent } from '../live'
import { firstName } from '../boardStats'

/**
 * The Live screen's communication map: you at the top, the Lead in the middle, the workers on an arc
 * below, one line from the Lead to each of them (workers only talk to the Lead; only the Lead talks to
 * you). When a message is sent its line turns into moving dashes, lime squares travel along it and a
 * speech bubble shows the message beside whoever sent it. This is the custom animation layer the owner
 * approved on 9 Nov 2026 (no shadcn component draws it); its keyframes are the `live-*` ones in index.css.
 * Decorative motion is hidden under prefers-reduced-motion; the words stay.
 */

const W = 760
/** Room under a node for its label (name, runs on, what it is doing). */
const LABEL = 80
const CX = 380
const CY = 260
const YOU = { x: CX, y: 70 }
/** How long the newest message keeps its bubble and its packets. */
const BUBBLE_MS = 9000
const PING_MS = 3000

interface Node { id: string; x: number; y: number; s: number }

function layout(workers: LiveAgent[]): Node[] {
  const n = workers.length
  const s = n > 5 ? 48 : 60
  return workers.map((w, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1)
    const angle = Math.PI * (0.92 - 0.84 * t)
    return { id: w.agent.id, x: Math.round(CX + 300 * Math.cos(angle)), y: Math.round(CY + 210 * Math.sin(angle)), s }
  })
}

const line = (a: { x: number; y: number }, b: { x: number; y: number }): string => `M${a.x} ${a.y} L${b.x} ${b.y}`

/** The line an event travels on, and whether it goes the line's way (you → Lead, Lead → worker). */
function linkOf(e: LiveEvent | null, leadId: string | null, nodes: Node[]): { key: string; d: string; forward: boolean } | null {
  if (!e || !e.to || !leadId) return null
  const pair = [e.from, e.to]
  if (!pair.includes(leadId)) return null
  const other = e.from === leadId ? e.to : e.from
  if (other === 'you') return { key: 'you', d: line(YOU, { x: CX, y: CY }), forward: e.from === 'you' }
  const n = nodes.find((x) => x.id === other)
  return n ? { key: n.id, d: line({ x: CX, y: CY }, n), forward: e.from === leadId } : null
}

/** The map is only as tall as its agents need: the lowest node and its label. */
const heightFor = (nodes: Node[]): number => Math.max(CY + 42 + LABEL, ...nodes.map((n) => n.y + n.s / 2 + LABEL)) + 16

/** Beside the sender (never below, so the map needs no spare room): workers on the right half get it on their left. */
function bubbleAt(from: string, leadId: string | null, nodes: Node[], h: number): { left: number; top: number } {
  if (from === 'you') return { left: CX + 52, top: 26 }
  if (from === leadId) return { left: CX + 66, top: CY - 116 }
  const n = nodes.find((x) => x.id === from)
  if (!n) return { left: CX + 66, top: CY - 116 }
  const left = n.x > CX + 60 ? n.x - n.s / 2 - 254 : n.x + n.s / 2 + 14
  return { left: Math.min(Math.max(left, 8), W - 248), top: Math.min(Math.max(n.y - 50, 8), h - 112) }
}

const packetStyle = (d: string, delay: number): React.CSSProperties => ({ offsetPath: `path('${d}')`, offsetRotate: '0deg', animationDelay: `${delay}s` })

function AgentNode({ a, x, y, s, lead, hot, ping }: { a: LiveAgent; x: number; y: number; s: number; lead?: boolean; hot: boolean; ping: string | null }): JSX.Element {
  return (
    <div className="absolute z-[2] flex w-[168px] flex-col items-center gap-2" style={{ left: x - 84, top: y - s / 2 }}>
      <div className={cn('relative rounded-full border-[1.5px] bg-panel transition-colors', hot ? 'border-green' : 'border-border')} style={{ width: s, height: s }}>
        {lead && (
          <>
            <span className="absolute inset-0 animate-live-pulse rounded-full border-2 border-lime motion-reduce:hidden" aria-hidden="true" />
            <span className="absolute inset-0 animate-live-pulse rounded-full border-2 border-lime [animation-delay:1.2s] motion-reduce:hidden" aria-hidden="true" />
          </>
        )}
        {a.working && <span className="absolute -inset-[9px] animate-live-orbit rounded-full border-[1.5px] border-dashed border-green motion-reduce:animate-none" aria-hidden="true" />}
        {ping && <span key={ping} className="absolute -inset-1 animate-live-ping rounded-xl border-2 border-lime motion-reduce:hidden" aria-hidden="true" />}
        <span className="flex size-full items-center justify-center overflow-hidden rounded-full">
          <Avatar shape={a.agent.shape} tone={a.agent.tone} head={a.agent.head} mascot={a.agent.isMascot} size={s - 4} />
        </span>
        {a.typing && (
          <span className="absolute -top-3.5 -right-8 z-[3] inline-flex gap-[3px] rounded-[10px] border border-border bg-card px-2 py-1.5 shadow-sm" aria-hidden="true">
            <i className="size-[5px] animate-hop rounded-full bg-green" /><i className="size-[5px] animate-hop rounded-full bg-green [animation-delay:.15s]" /><i className="size-[5px] animate-hop rounded-full bg-green [animation-delay:.3s]" />
          </span>
        )}
      </div>
      <div className="flex max-w-[168px] flex-col items-center gap-0.5 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-xs">
        <span className="flex items-center gap-1.5">
          <strong className="text-sm font-semibold">{firstName(a.agent.name)}</strong>
          {lead && <Badge variant="outline" className="h-[18px] px-1.5 font-mono text-[10px]">LEAD</Badge>}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{runsOnLabel(a.agent)}</span>
        <span className={cn('max-w-[146px] truncate text-xs', a.working ? 'text-green' : 'text-muted-foreground')}>{a.doing}</span>
      </div>
    </div>
  )
}

export function LiveMap({ lead, workers, latest, now, youName, unread }: {
  lead: LiveAgent | null
  workers: LiveAgent[]
  /** The newest event; it gets the bubble and the packets while it is fresh. */
  latest: LiveEvent | null
  now: number
  youName: string
  /** Unread Lead messages: a badge under You. */
  unread: number
}): JSX.Element {
  const nodes = layout(workers)
  const leadId = lead?.agent.id ?? null
  const fresh = latest && latest.live && now - latest.at < BUBBLE_MS ? latest : null
  const link = linkOf(fresh, leadId, nodes)
  const pingFor = (id: string): string | null => (fresh && fresh.kind === 'tool' && fresh.from === id && now - fresh.at < PING_MS ? fresh.id : null)
  const hot = (id: string): boolean => !!fresh && (fresh.from === id || fresh.to === id)
  const lines = [
    { key: 'you', d: line(YOU, { x: CX, y: CY }) },
    ...nodes.map((n) => ({ key: n.id, d: line({ x: CX, y: CY }, n) }))
  ]
  const nameOf = (id: string): string => (id === 'you' ? 'You' : firstName([lead, ...workers].find((a) => a?.agent.id === id)?.agent.name ?? 'Agent'))
  const H = heightFor(nodes)
  // Fit the map into its box: the box's size comes from the card (a fixed height from the window), and the map
  // inside is absolutely placed, so measuring the box can't feed back into it.
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = size.w && size.h ? Math.min(1, (size.w - 16) / W, (size.h - 16) / H) : 1
  const bubble = fresh ? bubbleAt(fresh.from, leadId, nodes, H) : null

  return (
    <div ref={box} className="relative size-full overflow-hidden">
      <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
        <defs>
          <pattern id="live-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" className="stroke-border/50" strokeWidth="1" /></pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#live-grid)" />
      </svg>
      <div className="absolute top-1/2 left-1/2" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0" aria-hidden="true">
          <circle cx={CX} cy={CY} r="130" fill="none" className="stroke-border" strokeDasharray="2 6" />
          <circle cx={CX} cy={CY} r="232" fill="none" className="stroke-border/70" strokeDasharray="2 8" />
          {lines.map((l) => (
            <path key={l.key} d={l.d} fill="none"
              className={link?.key === l.key ? 'animate-live-dash stroke-green [stroke-dasharray:7_7] [stroke-width:2] motion-reduce:animate-none' : 'stroke-border [stroke-width:1.5]'} />
          ))}
        </svg>
        {lead && <div className="absolute w-0.5 origin-bottom animate-live-sweep bg-lime opacity-35 motion-reduce:hidden" style={{ left: CX - 1, top: CY - 190, height: 190 }} aria-hidden="true" />}

        {lines.map((l, i) => (
          <span key={`drift-${l.key}`} className="absolute top-0 left-0 size-1.5 animate-live-drift rounded-[2px] bg-lime opacity-45 motion-reduce:hidden" style={packetStyle(l.d, i * 1.3)} aria-hidden="true" />
        ))}
        {link && fresh && [0, 0.35, 0.7].map((delay) => (
          <span key={`${fresh.id}-${delay}`} style={packetStyle(link.d, delay)} aria-hidden="true"
            className={cn('absolute top-0 left-0 z-[1] size-2.5 rounded-[2px] border border-green bg-lime shadow-[0_0_0_4px_var(--lime-soft)] motion-reduce:hidden', link.forward ? 'animate-live-packet' : 'animate-live-packet-back')} />
        ))}

        <div className="absolute z-[2] flex w-[168px] flex-col items-center gap-2" style={{ left: YOU.x - 84, top: YOU.y - 26 }}>
          <span className={cn('relative flex size-[52px] items-center justify-center rounded-full border-[1.5px] bg-primary text-[15px] font-semibold text-primary-foreground', hot('you') ? 'border-green' : 'border-primary')}>
            {youName.slice(0, 2).toUpperCase()}
            {fresh && fresh.to === 'you' && <span key={fresh.id} className="absolute -inset-1 animate-live-ping rounded-full border-2 border-lime motion-reduce:hidden" aria-hidden="true" />}
          </span>
          <div className="flex flex-col items-center gap-0.5 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-xs">
            <strong className="text-sm font-semibold">You</strong>
            <span className="font-mono text-[11px] text-muted-foreground">Inbox</span>
            {unread > 0 && <Badge variant="lime" className="mt-1 font-mono">{unread} to read</Badge>}
          </div>
        </div>

        {lead && <AgentNode a={lead} x={CX} y={CY} s={84} lead hot={hot(lead.agent.id)} ping={pingFor(lead.agent.id)} />}
        {workers.map((w, i) => (
          <AgentNode key={w.agent.id} a={w} x={nodes[i].x} y={nodes[i].y} s={nodes[i].s} hot={hot(w.agent.id)} ping={pingFor(w.agent.id)} />
        ))}

        {fresh && bubble && (
          <div key={fresh.id} className="absolute z-[4] flex w-60 animate-live-pop flex-col gap-2 rounded-2xl border-[1.5px] border-green bg-card px-3.5 py-3 shadow-lg" style={bubble}>
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant={KIND_TONE[fresh.kind]} className="font-mono text-[10.5px] tracking-wide">{KIND_LABEL[fresh.kind]}</Badge>
              <span className="font-mono text-[11.5px] text-muted-foreground">{fresh.to ? `${nameOf(fresh.from)} → ${nameOf(fresh.to)}` : nameOf(fresh.from)}</span>
            </span>
            <span className="line-clamp-3 animate-live-type text-[13.5px] leading-snug">{fresh.text}</span>
          </div>
        )}
        {!lead && <p className="absolute inset-x-0 top-1/2 text-center text-sm text-muted-foreground">This agency has no Lead yet.</p>}
      </div>
    </div>
  )
}
