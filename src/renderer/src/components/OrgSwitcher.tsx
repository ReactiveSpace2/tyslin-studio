import { useEffect, useRef, useState } from 'react'
import type { Organization } from '@shared/types'
import { Icon } from './Icon'

const initial = (name: string): string => name.trim().slice(0, 1).toUpperCase() || '?'

/**
 * Organization switcher (bottom left of the status bar). The menu opens upward. Switching reopens
 * the app inside the other organization, so every screen starts fresh.
 */
export function OrgSwitcher({ onNewOrg }: { onNewOrg: () => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { void window.tyslin.orgs.list().then(setOrgs) }, [])

  // Close the menu on an outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = orgs.find((o) => o.current)
  const name = current?.name ?? 'Tyslin'

  const switchTo = async (o: Organization): Promise<void> => {
    setOpen(false)
    if (o.current) return
    try {
      await window.tyslin.orgs.switch(o.id)
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
      setTimeout(() => setError(null), 4000)
    }
  }

  return (
    <div className="org-switch" ref={ref}>
      <button type="button" className="status-item status-btn org-btn" aria-haspopup="menu" aria-expanded={open}
        aria-label={`Organization: ${name}. Switch organization`} onClick={() => setOpen((o) => !o)}>
        <span className="switch-initial tiny" aria-hidden="true">{initial(name)}</span>
        {name}
        <Icon name="updown" size={12} />
      </button>
      {open && (
        <div className="switch-menu up" role="menu" aria-label="Organizations">
          <span className="section-label">Organizations</span>
          {orgs.map((o) => (
            <button key={o.id} type="button" role="menuitemradio" aria-checked={o.current} onClick={() => void switchTo(o)}>
              <span className="switch-initial small" aria-hidden="true">{initial(o.name)}</span>
              <span className="switch-name">{o.name}</span>
              {o.current && <Icon name="check" size={14} />}
            </button>
          ))}
          <span className="switch-sep" aria-hidden="true" />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onNewOrg() }}>
            <Icon name="plus" size={14} /> New organization
          </button>
        </div>
      )}
      {error && <span className="switch-error up" role="alert">{error}</span>}
    </div>
  )
}
