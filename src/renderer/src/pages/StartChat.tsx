import { useEffect, useRef, useState } from 'react'
import type { Agency, AgencySuggestion, StarterTurn } from '@shared/types'
import { AVAILABLE_TEMPLATES } from '@shared/agencies'
import { Icon } from '../components/Icon'
import mark from '../assets/logo-mark.png'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
type Pick = AgencySuggestion['picks'][number] & { on: boolean }

/** Agencies just made here, each with the first task Tyslin wrote for it. */
export interface StartedAgency { agency: Agency; firstTask: string }

interface Props {
  you: string
  /** "I'll pick a template myself": the template dialog, as before. */
  onPickTemplate: () => void
  onSettings: () => void
  /** The agencies were created: Home shows them as ready, each with its first task. */
  onCreated: (made: StartedAgency[]) => void
}

/**
 * Home for an organization with no agency yet (owner, 12 Nov 2026; canvas artboard 31, A + C): say what you want
 * to get done, Tyslin suggests teams from the templates (shown on the right, each with a switch), and one button
 * creates them. Always optional: picking a template by hand is one link away. Nothing is made until Create.
 */
export function StartChat({ you, onPickTemplate, onSettings, onCreated }: Props): JSX.Element {
  const [turns, setTurns] = useState<StarterTurn[]>([])
  const [text, setText] = useState('')
  const [picks, setPicks] = useState<Pick[]>([])
  const [busy, setBusy] = useState<'' | 'asking' | 'creating'>('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [turns, busy])

  const ask = async (): Promise<void> => {
    const said = text.trim()
    if (!said || busy) return
    const next: StarterTurn[] = [...turns, { role: 'user', text: said }]
    setTurns(next); setText(''); setBusy('asking'); setError('')
    try {
      const r = await window.tyslin.agencies.suggest(next)
      setTurns([...next, { role: 'tyslin', text: r.reply }])
      // Keep a switch the user turned off when the same team is suggested again.
      setPicks((old) => r.picks.map((p) => ({ ...p, on: old.find((o) => o.templateId === p.templateId)?.on ?? true })))
    } catch (e) { setError(errorText(e)) } finally { setBusy('') }
  }

  const chosen = picks.filter((p) => p.on)
  const create = async (): Promise<void> => {
    if (!chosen.length || busy) return
    setBusy('creating'); setError('')
    const made: StartedAgency[] = []
    try {
      for (const p of chosen) {
        const t = AVAILABLE_TEMPLATES.find((x) => x.id === p.templateId)
        if (!t) continue
        setProgress(`Setting up ${t.name}…`)
        const agency = await window.tyslin.agencies.create({ name: t.name, templateId: t.id, description: '', goal: '', prompt: '', adapter: 'template', packs: [], autoRun: false, channel: 'none', notify: 'questions', budget: null })
        made.push({ agency, firstTask: p.firstTask })
      }
      onCreated(made)
    } catch (e) {
      // Some may be made already: show those as ready and say what went wrong with the rest.
      if (made.length) onCreated(made)
      setError(errorText(e))
    } finally { setBusy(''); setProgress('') }
  }

  const needsKey = /\bkey\b/i.test(error)
  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Tell Tyslin what you want">
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pt-10">
          <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{you && you !== 'You' ? `Hi ${you}. ` : ''}What do you want to get done?</h1>
              <p className="text-[15px] text-muted-foreground">Say it in your own words. Tyslin suggests the teams for it, and you decide which to create.</p>
            </div>
            {turns.map((t, i) => t.role === 'user' ? (
              <div key={i} className="max-w-[80%] self-end rounded-[14px_14px_4px_14px] bg-accent px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">{t.text}</div>
            ) : (
              <div key={i} className="flex items-start gap-3"><img src={mark} alt="" className="size-7 flex-none" /><div className="flex min-w-0 flex-col gap-1"><strong className="text-[13px] font-semibold">Tyslin</strong><p className="text-[15px] leading-relaxed whitespace-pre-wrap">{t.text}</p></div></div>
            ))}
            {busy === 'asking' && <p className="flex items-center gap-2 pl-10 text-[13px] text-muted-foreground" role="status"><span className="inline-flex gap-[3px]" aria-hidden="true">{[0, 150, 300].map((d) => <i key={d} className="size-[5px] animate-dot rounded-full bg-green motion-reduce:animate-none motion-reduce:opacity-60" style={{ animationDelay: `${d}ms` }} />)}</span>Thinking about your teams…</p>}
            {error && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive-soft px-3.5 py-2.5 text-sm text-destructive" role="alert">
                {error}
                {needsKey && <Button variant="outline" size="sm" onClick={onSettings}>Open Settings</Button>}
              </div>
            )}
            <div ref={end} />
          </div>
        </div>
        <form className="mx-auto w-full max-w-[688px] flex-none px-6 pt-2 pb-5" onSubmit={(e) => { e.preventDefault(); void ask() }}>
          <Card className="gap-2 px-4 pt-3 pb-2.5 shadow-sm focus-within:border-green">
            <Label htmlFor="start-box" className="sr-only">What do you want to get done?</Label>
            <Textarea id="start-box" rows={2} autoFocus value={text} disabled={busy === 'creating'}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask() } }}
              placeholder={turns.length ? 'Add or change something…' : 'For example: a landing page for my shop, weekly Instagram posts and someone to test the checkout'}
              className="min-h-[52px] resize-none border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0" />
            <div className="flex items-center gap-3">
              <Button type="button" variant="link" size="sm" className="h-8 px-0 text-[13px] text-muted-foreground underline" onClick={onPickTemplate}>I'll pick a template myself</Button>
              <span className="flex-1" />
              <span className="hidden text-xs text-muted-foreground sm:inline">Enter to send</span>
              <Button type="submit" size="icon" className="size-9" aria-label="Send" disabled={!text.trim() || !!busy}><Icon name="send" /></Button>
            </div>
          </Card>
        </form>
      </section>

      <aside className="flex w-[340px] flex-none flex-col gap-3 overflow-y-auto border-l border-border bg-muted px-5 py-6" aria-label="Your organization so far">
        <span className="text-[13px] font-semibold">Your organization so far</span>
        {picks.length === 0 && <div className="rounded-xl border border-dashed border-border-strong px-4 py-5 text-[13px] leading-relaxed text-muted-foreground">Your teams show up here as you describe what you need. Each is a Lead and a few workers, ready in a minute.</div>}
        {picks.map((p) => {
          const t = AVAILABLE_TEMPLATES.find((x) => x.id === p.templateId)
          if (!t) return null
          const lead = t.roster.find((m) => m.lead)
          return (
            <Card key={p.templateId} className={`gap-2 px-4 py-3.5 ${p.on ? '' : 'opacity-60'}`}>
              <span className="flex items-center justify-between gap-2"><strong className="text-sm font-semibold">{t.name}</strong><Switch checked={p.on} disabled={busy === 'creating'} aria-label={`Create ${t.name}`} onCheckedChange={(v) => setPicks((l) => l.map((x) => (x.templateId === p.templateId ? { ...x, on: v } : x)))} /></span>
              <span className="text-xs text-muted-foreground">{lead ? `${lead.first} leads · ` : ''}{t.roster.length - 1} workers</span>
              {p.why && <span className="text-[13px] leading-snug">{p.why}</span>}
              {p.firstTask && <span className="text-xs leading-snug text-muted-foreground">First task: "{p.firstTask}"</span>}
            </Card>
          )
        })}
        {picks.length > 0 && (
          <div className="mt-auto flex flex-col gap-2 pt-2">
            {progress && <span className="text-xs text-muted-foreground" role="status">{progress}</span>}
            <Button variant="lime" className="h-10 font-semibold" disabled={!chosen.length || !!busy} onClick={() => void create()}>{busy === 'creating' ? 'Creating…' : chosen.length ? `Create ${chosen.length} ${chosen.length === 1 ? 'agency' : 'agencies'}` : 'Switch one on to create it'}</Button>
            <span className="text-xs leading-snug text-muted-foreground">Nothing is made until you press Create. You can rename, change or delete any agency later.</span>
          </div>
        )}
      </aside>
    </div>
  )
}

/** After Create: the new agencies, each with the first task written from what the user said, one click to start. */
export function StartReady({ made, onStart, onHome }: { made: StartedAgency[]; onStart: (m: StartedAgency) => Promise<void>; onHome: () => void }): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const start = async (m: StartedAgency): Promise<void> => { setBusy(m.agency.id); setError(''); try { await onStart(m) } catch (e) { setError(errorText(e)); setBusy(null) } }
  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-8 py-12">
      <div className="flex w-full max-w-[640px] flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-semibold tracking-tight">{made.length === 1 ? 'Your agency is ready' : 'Your agencies are ready'}</h1>
          <p className="text-[15px] text-muted-foreground">Start a first task now, or go to Home and type your own.</p>
        </div>
        {made.map((m) => (
          <Card key={m.agency.id} className="gap-2.5 px-5 py-4">
            <span className="flex items-center justify-between gap-2"><strong className="text-[15px] font-semibold">{m.agency.name}</strong><Badge variant="soft">Ready</Badge></span>
            {m.firstTask && <p className="text-[14px] leading-relaxed">"{m.firstTask}"</p>}
            {m.firstTask && <span><Button variant="lime" size="sm" className="min-h-9 font-semibold" disabled={busy !== null} onClick={() => void start(m)}>{busy === m.agency.id ? 'Starting…' : 'Start this task'}</Button></span>}
          </Card>
        ))}
        {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
        <span><Button variant="ghost" onClick={onHome} disabled={busy !== null}>Go to Home</Button></span>
      </div>
    </div>
  )
}
