import { useEffect, useState } from 'react'
import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@shared/types'
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

/** − slider + and a percentage that resets to 100%. `compact` is the title-bar size. */
export function ZoomControl({ compact = false }: { compact?: boolean }): JSX.Element {
  const [zoom, setZoom] = useZoom()
  const pct = Math.round(zoom * 100)
  return (
    <div className={'zoom' + (compact ? ' compact' : '')} role="group" aria-label="Zoom">
      <button type="button" className="zoom-btn" aria-label="Zoom out" title="Zoom out (Ctrl −)" disabled={zoom <= ZOOM_MIN}
        onClick={() => setZoom(zoom - ZOOM_STEP)}>
        <Icon name="minus" size={compact ? 12 : 14} />
      </button>
      <input type="range" className="zoom-range" aria-label="Zoom level" aria-valuetext={`${pct}%`}
        min={ZOOM_MIN} max={ZOOM_MAX} step={0.05} value={zoom}
        style={{ ['--fill' as string]: `${((zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100}%` }}
        onChange={(e) => setZoom(Number(e.target.value))} />
      <button type="button" className="zoom-btn" aria-label="Zoom in" title="Zoom in (Ctrl +)" disabled={zoom >= ZOOM_MAX}
        onClick={() => setZoom(zoom + ZOOM_STEP)}>
        <Icon name="plus" size={compact ? 12 : 14} />
      </button>
      <button type="button" className="zoom-reset mono" title="Reset to 100% (Ctrl 0)" aria-label={`Zoom ${pct}%. Reset to 100%`}
        onClick={() => setZoom(1)}>
        {pct}%
      </button>
    </div>
  )
}
