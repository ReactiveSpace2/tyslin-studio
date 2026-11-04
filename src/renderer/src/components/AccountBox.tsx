import { useEffect, useState } from 'react'
import type { AuthStatus } from '@shared/types'

/** Google account status with sign in and sign out, shown in Settings → Account. */
export function AccountBox({ onChange }: { onChange?: (s: AuthStatus) => void }): JSX.Element | null {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.tyslin.auth.status().then(setStatus)
    return () => { void window.tyslin.auth.cancelSignIn() }
  }, [])

  if (!status) return null
  if (!status.configured) {
    return <p className="hint">Google sign-in isn't set up in this build.</p>
  }

  const signIn = async (): Promise<void> => {
    setError(null)
    setWaiting(true)
    try {
      const s = await window.tyslin.auth.signIn()
      setStatus(s)
      onChange?.(s)
    } catch (e) {
      // Errors cross IPC as "Error invoking remote method 'auth:signIn': Error: <message>".
      const msg = e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e)
      setError(msg)
    } finally {
      setWaiting(false)
    }
  }

  if (status.account) {
    return (
      <div className="account-row">
        <span className="account-initial" aria-hidden="true">{(status.account.name || status.account.email).slice(0, 1).toUpperCase()}</span>
        <div className="account-who">
          <strong>{status.account.name}</strong>
          <span className="mono hint">{status.account.email}</span>
        </div>
        <button type="button" className="btn btn-sm" onClick={async () => {
          const s = await window.tyslin.auth.signOut()
          setStatus(s)
          onChange?.(s)
        }}>Sign out</button>
      </div>
    )
  }

  return (
    <div className="account-row">
      {waiting ? (
        <>
          <span className="hint" role="status">Finish signing in in your browser…</span>
          <button type="button" className="btn btn-sm" onClick={() => void window.tyslin.auth.cancelSignIn()}>Cancel</button>
        </>
      ) : (
        <button type="button" className="btn" onClick={() => void signIn()}>Continue with Google</button>
      )}
      {error && <span className="hint account-error" role="alert">{error}</span>}
    </div>
  )
}
