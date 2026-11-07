import { useEffect, useState } from 'react'
import type { AuthStatus } from '@shared/types'
import { Pose } from './Pose'

/** Full-window sign-in, shown when this build has Google sign-in and nobody is signed in. */
export function LoginScreen({ onSignedIn }: { onSignedIn: (s: AuthStatus) => void }): JSX.Element {
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => { void window.tyslin.auth.cancelSignIn() }, [])

  const signIn = async (): Promise<void> => {
    setError(null)
    setWaiting(true)
    try {
      const s = await window.tyslin.auth.signIn()
      if (s.account) onSignedIn(s)
    } catch (e) {
      // Errors cross IPC as "Error invoking remote method 'auth:signIn': Error: <message>".
      setError(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
    } finally {
      setWaiting(false)
    }
  }

  return (
    <main className="login">
      <div className="login-card">
        <Pose pose={1} height={190} className="login-pose" />
        <span className="eyebrow">Tyslin</span>
        <h1>Tyslin Studio</h1>
        <p className="login-tagline">Every agent you run. One studio.</p>
        <p className="login-desc">
          Run your own AI agency. A Lead plans the work, your agents do it, you approve what ships.
        </p>
        {waiting ? (
          <div className="login-wait">
            <span role="status">Finish signing in in your browser…</span>
            <button type="button" className="btn" onClick={() => void window.tyslin.auth.cancelSignIn()}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="btn btn-primary login-btn" onClick={() => void signIn()}>Continue with Google</button>
        )}
        {error && <p className="login-error" role="alert">{error}</p>}
        <p className="hint login-note">Your agencies, chats and keys stay on this computer. Tyslin keeps only your name and email.</p>
      </div>
    </main>
  )
}
