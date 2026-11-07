import { useEffect, useState } from 'react'
import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@shared/types'
import { Slider as SliderPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'
import { Icon } from './Icon'

/**
 * App zoom (Electron page zoom, saved per computer). One shared value, so the title-bar slider,
 * Settings → Appearance and the keyboard shortcuts always agree.
 */
let current = 1
const listeners = new Set<(z: number) => void>()
const publish = (z: number): void => { current = z; for (const l of listeners) l(z) }
let started = false
function start(): void {
  if (started) return
  started = true
  void window.tyslin.settings.prefs().then((p) => publish(p.zoom))
  window.tyslin.settings.onZoom(publish)
  // Ctrl/Cmd + = (or +), − and 0, since there is no menu bar to provide them.
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return
    const next = e.key === '=' || e.key === '+' ? current + ZOOM_STEP : e.key === '-' ? current - ZOOM_STEP : e.key === '0' ? 1 : null
    if (next === null) return
    e.preventDefault()
    setZoomValue(next)
  })
}

function setZoomValue(z: number): void {
  const next = clampZoom(z)
  publish(next)
  void window.tyslin.settings.setPrefs({ zoom: next })
}

function useZoom(): [number, (z: number) => void] {
  const [zoom, setLocal] = useState(current)
  useEffect(() => {
    start()
    listeners.add(setLocal)
    setLocal(current)
    return () => { listeners.delete(setLocal) }
  }, [])
  return [zoom, setZoomValue]
}

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring'

/** − slider + and a percentage that resets to 100%. `compact` is the status-bar size. */
export function ZoomControl({ compact = false }: { compact?: boolean }): JSX.Element {
  const [zoom, setZoom] = useZoom()
  const pct = Math.round(zoom * 100)
  const btn = cn('grid cursor-pointer place-items-center rounded-md p-0 disabled:cursor-default disabled:opacity-40', FOCUS,
    compact
      ? 'size-5 text-muted-foreground enabled:hover:text-foreground'
      : 'size-8 border border-border bg-card text-foreground enabled:hover:border-border-strong')
  return (
    <div className={cn('no-drag inline-flex items-center', compact ? 'ml-1 gap-1' : 'gap-1.5')} role="group" aria-label="Zoom">
      <button type="button" className={btn} aria-label="Zoom out" title="Zoom out (Ctrl −)" disabled={zoom <= ZOOM_MIN}
        onClick={() => setZoom(zoom - ZOOM_STEP)}>
        <Icon name="minus" size={compact ? 12 : 14} />
      </button>
      {/* shadcn's Slider, built on the Radix primitive here so the thumb (the focusable part) carries the label and value text. */}
      <SliderPrimitive.Root min={ZOOM_MIN} max={ZOOM_MAX} step={0.05} value={[zoom]} onValueChange={([z]) => setZoom(z)}
        className={cn('relative flex h-4 cursor-pointer touch-none select-none items-center', compact ? 'w-20' : 'w-[220px]')}>
        <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-border">
          <SliderPrimitive.Range className="absolute h-full bg-lime" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb aria-label="Zoom level" aria-valuetext={`${pct}%`}
          className={cn('block size-3.5 rounded-full border-2 border-foreground bg-card', FOCUS)} />
      </SliderPrimitive.Root>
      <button type="button" className={btn} aria-label="Zoom in" title="Zoom in (Ctrl +)" disabled={zoom >= ZOOM_MAX}
        onClick={() => setZoom(zoom + ZOOM_STEP)}>
        <Icon name="plus" size={compact ? 12 : 14} />
      </button>
      <button type="button" title="Reset to 100% (Ctrl 0)" aria-label={`Zoom ${pct}%. Reset to 100%`}
        className={cn('cursor-pointer rounded-md font-mono', FOCUS,
          compact
            ? 'h-5 min-w-[42px] text-[11px] text-muted-foreground hover:text-foreground'
            : 'h-8 min-w-12 border border-border bg-card px-2 text-xs text-foreground')}
        onClick={() => setZoom(1)}>
        {pct}%
      </button>
    </div>
  )
}
