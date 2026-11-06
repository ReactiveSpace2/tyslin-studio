import { useEffect, useRef, useState } from 'react'
import type { Account } from '@shared/types'
import { Icon } from './Icon'

/** Title bar, right: the signed-in person, with Profile (Settings → Account) and Log out. */
export function ProfileMenu({ account, canSignOut, onProfile, onSignOut }: {
  account: Account | null
  /** Builds without sign-in have no Log out. */
  canSignOut: boolean
  onProfile: () => void
  onSignOut: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const name = account?.name || 'You'
  return (
    <div className="profile" ref={ref}>
      <button type="button" className="profile-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Profile: ${name}`} onClick={() => setOpen((o) => !o)}>
        <span className="profile-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
        <span className="profile-name">{name.split(' ')[0]}</span>
        <Icon name="updown" size={12} />
      </button>
      {open && (
        <div className="switch-menu profile-menu" role="menu" aria-label="Profile">
          <div className="profile-who"><strong>{name}</strong>{account?.email && <span className="hint">{account.email}</span>}</div>
          <span className="switch-sep" aria-hidden="true" />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onProfile() }}><Icon name="agents" size={14} /> Profile</button>
          {canSignOut && <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignOut() }}><Icon name="back" size={14} /> Log out</button>}
        </div>
      )}
    </div>
  )
}
