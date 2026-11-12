import { cn } from '@/lib/utils'

/**
 * How a working agent looks (owner's pick, 7 Nov 2026; canvas "Tyslin working-agent animations"):
 * a short lime line travelling round its card (WorkingBorder), three typing dots wherever space is
 * small (WorkingDots: status pills, lists, the status bar), and solid lime dashes running down the
 * org chart's hand-off line (`handOffFlow`, `HandOffStem`). Every animation stops under
 * prefers-reduced-motion, where the border becomes a steady lime outline and the dashes a solid lime line.
 */

/** Draw inside a positioned card (position: relative). Decorative only; the card says "Working" in words. */
export function WorkingBorder(): JSX.Element {
  return (
    <svg className="pointer-events-none absolute -top-px -left-px h-[calc(100%+2px)] w-[calc(100%+2px)] overflow-visible" aria-hidden="true">
      <rect pathLength={100}
        className="[x:1px] [y:1px] h-[calc(100%-2px)] w-[calc(100%-2px)] animate-travel fill-none stroke-lime [rx:12px] [ry:12px] [stroke-dasharray:16_84] [stroke-linecap:round] [stroke-width:2.5] motion-reduce:animate-none motion-reduce:[stroke-dasharray:none] motion-reduce:[stroke-width:2]" />
    </svg>
  )
}

/**
 * A short lime line travelling round a head (the sidebar's Lead while its agency works; owner's pick A on the
 * canvas, 12 Nov 2026): the same motion as WorkingBorder, on a circle. Wrap the Avatar: `<WorkingRing size={22}>`.
 * Decorative; the row's green dot and the status bar say "working" in words. A steady ring under reduced motion.
 */
export function WorkingRing({ size, on, children }: { size: number; on: boolean; children: React.ReactNode }): JSX.Element {
  const pad = 4
  const box = size + pad * 2
  return (
    <span className="relative inline-grid flex-none place-items-center" style={{ width: size, height: size }}>
      {children}
      {on && (
        <svg className="pointer-events-none absolute" style={{ left: -pad, top: -pad, width: box, height: box }} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
          <circle cx={box / 2} cy={box / 2} r={box / 2 - 1.5} pathLength={100}
            className="animate-travel fill-none stroke-lime [stroke-dasharray:22_78] [stroke-linecap:round] [stroke-width:2] motion-reduce:animate-none motion-reduce:[stroke-dasharray:none]" />
        </svg>
      )}
    </span>
  )
}

const DOT = 'size-1 rounded-full bg-current animate-hop motion-reduce:animate-none motion-reduce:opacity-100'

/** Three small dots after a "Working" label. */
export function WorkingDots(): JSX.Element {
  return (
    <span className="ml-1 inline-flex items-center gap-[3px]" aria-hidden="true">
      <span className={DOT} /><span className={cn(DOT, '[animation-delay:.15s]')} /><span className={cn(DOT, '[animation-delay:.3s]')} />
    </span>
  )
}

/**
 * The hand-off flow: solid lime dashes moving down. Add to a line element (it sets the dashes and the
 * motion, not the size), e.g. the org chart's line from the Lead while a worker is working. Under reduced
 * motion it is a steady lime line.
 */
export const handOffFlow =
  'bg-transparent bg-[image:repeating-linear-gradient(to_bottom,var(--lime)_0_4px,transparent_4px_9px)] bg-[length:2px_18px] animate-flow motion-reduce:animate-none motion-reduce:bg-none motion-reduce:bg-lime'

/** The short flowing stem into a working worker's card, from the line above. Draw inside the (relative) card. */
export function HandOffStem({ className }: { className?: string }): JSX.Element {
  return <span className={cn('absolute -top-3.5 left-[calc(50%-1.5px)] h-[13px] w-[3px]', handOffFlow, className)} aria-hidden="true" />
}
