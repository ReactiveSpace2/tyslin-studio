import { useEffect, useState } from 'react'
import type { AuthStatus } from '@shared/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

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
    return <p className="text-xs text-muted-foreground">Google sign-in isn't set up in this build.</p>
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
      <div className="flex flex-wrap items-center gap-3">
        <Avatar className="size-9" aria-hidden="true">
          <AvatarFallback className="bg-lime font-bold text-on-lime">{(status.account.name || status.account.email).slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          <strong>{status.account.name}</strong>
          <span className="font-mono text-xs text-muted-foreground">{status.account.email}</span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={async () => {
          const s = await window.tyslin.auth.signOut()
          setStatus(s)
          onChange?.(s)
        }}>Sign out</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {waiting ? (
        <>
          <span className="text-xs text-muted-foreground" role="status">Finish signing in in your browser…</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void window.tyslin.auth.cancelSignIn()}>Cancel</Button>
        </>
      ) : (
        <Button type="button" variant="outline" className="h-10 rounded-[10px]" onClick={() => void signIn()}>Continue with Google</Button>
      )}
      {error && <span className="basis-full text-xs text-destructive" role="alert">{error}</span>}
    </div>
  )
}
