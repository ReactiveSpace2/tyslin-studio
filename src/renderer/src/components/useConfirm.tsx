import { useRef, useState } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

export interface ConfirmOptions {
  title: string
  description: string
  action: string
  destructive?: boolean
  /** A third choice (for example "Save" beside "Discard"); resolves to 'alt'. */
  alt?: string
}
export type ConfirmAnswer = boolean | 'alt'
export type Confirm = (o: ConfirmOptions) => Promise<ConfirmAnswer>

/** One AlertDialog for an "are you sure" (Files, Skills, Connectors, Memory, Google Drive; never window.confirm): `await confirm({...})`. */
export function useConfirm(): [JSX.Element, Confirm] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: ConfirmAnswer) => void) | null>(null)
  const done = (v: ConfirmAnswer): void => { resolver.current?.(v); resolver.current = null; setOpts(null) }
  const confirm: Confirm = (o) => new Promise((resolve) => { resolver.current?.(false); resolver.current = resolve; setOpts(o) })
  const el = (
    <AlertDialog open={!!opts} onOpenChange={(o) => { if (!o) done(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          <AlertDialogDescription>{opts?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => done(false)}>Cancel</AlertDialogCancel>
          {opts?.alt && <Button variant="outline" onClick={() => done('alt')}>{opts.alt}</Button>}
          <AlertDialogAction className={opts?.destructive ? 'bg-destructive text-white hover:bg-destructive/90' : undefined} onClick={() => done(true)}>{opts?.action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return [el, confirm]
}
