import { useEffect, useState } from 'react'
import type { AuthStatus } from '@shared/types'
import mark from '../assets/logo-mark.png'
import standing from '../assets/mascot-pose-1.png'
import tablets from '../assets/mascot-pose-5.png'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

/**
 * Full-window sign-in, shown when this build has Google sign-in and nobody is signed in. Tailwind + shadcn/ui:
 * a two-column card, the sign-in on the left and the banner look (poses 5 and 1 on a lime circle) on the right.
 */
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
    // Below the title bar (44 px), which stays draggable.
    <main className="tw fixed inset-x-0 top-[44px] bottom-0 z-[100] grid place-items-center overflow-y-auto bg-background p-6 text-foreground">
      <Card className="w-full max-w-[920px] gap-0 overflow-hidden p-0 min-[820px]:grid min-[820px]:grid-cols-2">
        <section aria-labelledby="login-title" className="flex flex-col gap-6 p-10">
          <div className="flex items-center gap-3">
            <img src={mark} alt="" className="size-11" />
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold">Tyslin Studio</span>
              <span className="font-mono text-xs text-muted-foreground">Open source · on your desktop</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h1 id="login-title" className="text-[30px] leading-tight font-semibold tracking-[-0.02em]">Welcome</h1>
            <p className="text-base font-semibold text-green">Every agent you run. One studio.</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Run your own AI agency. A Lead plans the work, your agents do it, you approve what ships.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {waiting ? (
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-muted px-4">
                <span role="status" className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-border-strong border-t-green motion-reduce:animate-none" />
                  Finish signing in in your browser…
                </span>
                <Button variant="outline" size="sm" onClick={() => void window.tyslin.auth.cancelSignIn()}>Cancel</Button>
              </div>
            ) : (
              <Button size="lg" className="w-full" onClick={() => void signIn()}>Continue with Google</Button>
            )}
            {error && <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">{error}</p>}
          </div>

          <p className="border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
            Your agencies, chats and keys stay on this computer. Tyslin keeps only your name and email.
          </p>
        </section>

        {/* The banner look: poses 5 and 1 in front of a soft lime circle. Decorative. */}
        <div aria-hidden="true" className="relative hidden min-h-[460px] items-end justify-center overflow-hidden border-l border-border bg-muted min-[820px]:flex">
          <span className="absolute top-12 left-1/2 size-[340px] -translate-x-1/2 rounded-full bg-lime-soft" />
          <span className="absolute top-8 left-8 font-mono text-xs tracking-[0.08em] text-green uppercase">Run your own AI agency</span>
          <img src={tablets} alt="" className="relative -mr-3 mb-6 h-[270px] w-auto" />
          <img src={standing} alt="" className="relative mb-6 h-[320px] w-auto" />
        </div>
      </Card>
    </main>
  )
}
