import { Watermark } from '../components/Watermark'
import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { AppInfo, AuthStatus, EngineStatus, EngineTestResult, Organization, OrgColor, Preferences, ProviderId, ProviderSettings, Theme, UpdateStatus, WriteMode } from '@shared/types'
import stacked from '../assets/logo-stacked.png'
import mark from '../assets/logo-mark.png'
import wordmarkWhite from '../assets/wordmark-white.png'
import { AccountBox } from '../components/AccountBox'
import { track } from '../activity'
import { ZoomControl } from '../components/ZoomControl'
import { ColorSwatches } from '../components/ColorSwatches'
import { GitHubStars } from '../components/GitHubStars'
import { Icon } from '../components/Icon'
import { refreshAppearance } from '../appearance'
import { DefaultModelPicker, ModelKeys } from '../components/ModelSetup'
import { modelLabel, refreshDefaultModel } from '../defaultModel'
import { ORG_COLORS } from '@shared/types'
import { Mark } from '../components/RunsOnBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { engineListed } from '@shared/engines'

export type SettingsTab = 'models' | 'engines' | 'agents' | 'appearance' | 'account' | 'about'
type Tab = SettingsTab

const TABS: [Tab, string][] = [['models', 'Models'], ['engines', 'Agent engines'], ['agents', 'Agents'], ['appearance', 'Appearance'], ['account', 'Account'], ['about', 'About & updates']]

const UPDATE_TEXT: Record<UpdateStatus['state'], string> = {
  idle: 'Update checks run in installed builds only.',
  checking: 'Checking…',
  none: 'You have the latest version.',
  available: 'A new version is ready to download.',
  downloading: 'Downloading the update…',
  ready: 'Update downloaded. Restart to install it.',
  error: 'Could not check for updates.'
}

function useFlash(): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  // One timer at a time, so an older flash can't hide a newer one early; cleared when the tab closes.
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  return [msg, (m) => {
    setMsg(m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), 2500)
  }]
}

const hintCls = 'text-[13px] leading-relaxed text-muted-foreground'
const okCls = 'text-[13px] text-green'
const errorBoxCls = 'rounded-lg bg-destructive-soft px-3.5 py-2.5 text-sm text-destructive'
const linkCls = 'text-sm text-green underline-offset-4 hover:underline'

/** One group of settings: a card with a heading and a short line under it. */
function Group({ id, title, hint, className, children, ...rest }: { id: string; title: React.ReactNode; hint?: React.ReactNode; className?: string; children?: React.ReactNode } & Omit<React.ComponentProps<'section'>, 'title' | 'id'>): JSX.Element {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs', className)} {...rest}>
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-base font-semibold">{title}</h2>
        {hint && <p className={hintCls}>{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/** A selectable card around a RadioGroupItem (arrow keys move between cards); the radio itself is visually hidden. */
const choiceCls = (on: boolean): string => cn(
  'relative flex cursor-pointer gap-3 rounded-xl border bg-card p-3.5 text-sm transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
  on ? 'border-primary bg-lime-soft' : 'border-border hover:bg-accent'
)
const radioCls = 'sr-only'

/** Label and value rows (version, status, paths). */
function KV({ rows }: { rows: [string, React.ReactNode][] }): JSX.Element {
  return (
    <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}
    </dl>
  )
}

const THEMES: [Theme, string, string][] = [
  ['system', 'System', 'Match your computer and switch with it.'],
  ['light', 'Light', 'Parchment background, ink text.'],
  ['dark', 'Dark', 'Dark background, easier on the eyes at night.']
]

/**
 * Small drawing of the app in each theme; System shows half of each. It pictures a fixed light and a fixed dark
 * screen whatever the current theme, so its colours are the raw palette values, set as local CSS variables on each pane.
 */
const PREVIEW_LIGHT = { '--pv-bg': '#FAFAF7', '--pv-rail': '#F3F3EE', '--pv-edge': '#E4E4DD', '--pv-ink': '#0F0F0D' } as React.CSSProperties
const PREVIEW_DARK = { '--pv-bg': '#121210', '--pv-rail': '#1A1A17', '--pv-edge': '#33332E', '--pv-ink': '#F3F3EE' } as React.CSSProperties

function ThemePreview({ theme }: { theme: Theme }): JSX.Element {
  const pane = (dark: boolean): JSX.Element => (
    <span className="flex flex-1 bg-[var(--pv-bg)]" style={{ ...(dark ? PREVIEW_DARK : PREVIEW_LIGHT), '--pv-lime': '#7DB800' } as React.CSSProperties}>
      <span className="w-[18%] border-r border-[var(--pv-edge)] bg-[var(--pv-rail)]" />
      <span className="flex flex-1 flex-col gap-1.5 px-2.5 py-3">
        <span className="h-1.5 w-4/5 rounded-[3px] bg-[var(--pv-ink)] opacity-80" />
        <span className="h-1.5 w-1/2 rounded-[3px] bg-[var(--pv-ink)] opacity-35" />
        <span className="mt-auto h-3.5 w-[44%] rounded-[5px] bg-[var(--pv-lime)]" />
      </span>
    </span>
  )
  return (
    <span className="flex h-[88px] w-full overflow-hidden rounded-[10px] border border-border" aria-hidden="true">
      {theme === 'system' ? <>{pane(false)}{pane(true)}</> : pane(theme === 'dark')}
    </span>
  )
}

type Accent = Preferences['accent']

/** Accent cards: the fill colour each one shows; "org" shows the current organization's colour. */
const ACCENTS: [Accent, string, string][] = [
  ['lime', 'Lime', 'The Tyslin brand colour.'],
  ['forest', 'Forest', 'Dark green fills with light text. Quieter.'],
  ['mono', 'Monochrome', 'Ink only. Good for screenshots and focus.'],
  ['org', 'Organization colour', 'Each organization uses its own colour.']
]

function AppearanceTab(): JSX.Element {
  const [prefs, setPrefsState] = useState<Preferences | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)

  const loadOrg = (): void => { void window.tyslin.orgs.list().then((o) => setOrg(o.find((x) => x.current) ?? null)) }
  useEffect(() => {
    void window.tyslin.settings.prefs().then(setPrefsState)
    loadOrg()
  }, [])
  if (!prefs) return <></>

  const save = async (p: Partial<Preferences>): Promise<void> => {
    setPrefsState({ ...prefs, ...p })
    setPrefsState(await window.tyslin.settings.setPrefs(p))
    await refreshAppearance()
  }
  const setOrgColor = async (c: OrgColor): Promise<void> => {
    if (!org) return
    setOrg({ ...org, color: c })
    await window.tyslin.orgs.setColor(org.id, c)
    await refreshAppearance()
    window.dispatchEvent(new Event('tyslin:orgs-changed'))
  }
  // Each card shows its preset's own fill, whatever preset is on now, so these stay fixed brand values.
  const accentFill = (a: Accent): string =>
    a === 'lime' ? '#7DB800' : a === 'forest' ? '#4A7000' : a === 'mono' ? '#0F0F0D' : ORG_COLORS[org?.color ?? 'lime'].fill

  return (
    <>
      <Group id="theme-h" title="Theme" hint="Changes apply straight away, on this computer.">
        <RadioGroup className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3" aria-labelledby="theme-h" value={prefs.theme} onValueChange={(v) => void save({ theme: v as Theme })}>
          {THEMES.map(([id, title, hint]) => (
            <label key={id} className={cn(choiceCls(prefs.theme === id), 'flex-col p-2.5')}>
              <ThemePreview theme={id} />
              <RadioGroupItem className={radioCls} value={id} />
              <span className="flex flex-col gap-0.5 px-1 pb-0.5">
                <strong className="text-sm font-semibold">{title}</strong>
                <span className={hintCls}>{hint}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </Group>
      <Group id="accent-h" title="Accent colour" hint="Used for buttons like Chat, selected items, progress bars and highlights. The Tyslin logo and robots keep their colours.">
        <RadioGroup className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5" aria-labelledby="accent-h" value={prefs.accent} onValueChange={(v) => void save({ accent: v as Accent })}>
          {ACCENTS.map(([id, title, hint]) => (
            <label key={id} className={cn(choiceCls(prefs.accent === id), 'items-center')}>
              <RadioGroupItem className={radioCls} value={id} />
              <span className="size-7 flex-none rounded-lg border border-border" aria-hidden="true" style={{ background: accentFill(id) }} />
              <span className="flex flex-col gap-0.5"><strong className="font-semibold">{title}</strong><span className={hintCls}>{hint}</span></span>
            </label>
          ))}
        </RadioGroup>
      </Group>
      {org && (
        <Group id="orgcolor-h" title={<>Colour for {org.name}</>}
          hint={<>Marks this organization in the switcher{prefs.accent === 'org' ? ' and sets the accent while you are in it' : '. Choose "Organization colour" above to use it as the accent too'}.</>}>
          <ColorSwatches value={org.color} onChange={(c) => void setOrgColor(c)} name="org-color" />
        </Group>
      )}
      <Group id="icons-h" title="Icons" hint="Bold strokes are easier to see at small sizes and low zoom.">
        <RadioGroup className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5" aria-labelledby="icons-h" value={prefs.iconStyle} onValueChange={(v) => void save({ iconStyle: v as Preferences['iconStyle'] })}>
          {([['outline', 'Outline', 'Thin, light strokes.'], ['bold', 'Bold', 'Thicker strokes.']] as const).map(([id, title, hint]) => (
            <label key={id} className={choiceCls(prefs.iconStyle === id)}>
              <RadioGroupItem className={radioCls} value={id} />
              <span className="flex flex-col gap-0.5">
                <strong className="font-semibold">{title}</strong><span className={hintCls}>{hint}</span>
                <span className={cn('mt-2 flex gap-3 text-foreground', id === 'bold' ? '[--icon-stroke:2.1]' : '[--icon-stroke:1.6]')} aria-hidden="true">
                  <Icon name="home" size={18} /><Icon name="agents" size={18} /><Icon name="chat" size={18} /><Icon name="clock" size={18} /><Icon name="settings" size={18} />
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </Group>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center gap-4 border-b border-border px-5 py-4">
          <span className="flex flex-1 flex-col gap-0.5">
            <span id="rail-labels-l" className="text-sm font-semibold">Show names under menu icons</span>
            <span id="rail-labels-d" className={hintCls}>Easier to learn. The menu gets taller and scrolls on smaller windows.</span>
          </span>
          <Switch checked={prefs.railLabels} onCheckedChange={(v) => void save({ railLabels: v })} aria-labelledby="rail-labels-l" aria-describedby="rail-labels-d" />
        </div>
        <section aria-labelledby="zoom-h" className="flex flex-wrap items-center gap-4 px-5 py-4">
          <span className="flex min-w-[240px] flex-1 flex-col gap-0.5">
            <h2 id="zoom-h" className="text-sm font-semibold">Zoom</h2>
            <span className={hintCls}>Makes everything larger or smaller, from 70% to 150%. Also in the title bar, and with Ctrl + and Ctrl − (⌘ on Mac); Ctrl 0 resets.</span>
          </span>
          <ZoomControl />
        </section>
      </Card>
    </>
  )
}

/** Settings → About: wipe everything and start like a fresh install, after typing RESET. */
function ResetBox(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async (): Promise<void> => {
    setBusy(true); setError(null)
    try { await window.tyslin.app.reset() } catch (e) { setError(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e)); setBusy(false) }
  }
  return (
    <Group id="reset-h" title="Reset Tyslin Studio" className="border-destructive-soft"
      hint="Start again as if Tyslin were just installed. Every organization, project, agent, team, chat, task, board, mind map, design and automation is removed, along with your keys and sign-in. The built-in agents and the Engineering team come back after setup.">
      <div>
        <Button type="button" variant="destructive" onClick={() => { setOpen(true); setTyped('') }}>Reset…</Button>
      </div>
      <AlertDialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o) }}>
        <AlertDialogContent className="w-[560px] gap-4 rounded-2xl border-0 sm:max-w-[560px]">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle className="text-xl font-semibold">Reset everything?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
                <p><strong>Deleted from this computer:</strong> all organizations and their agents, teams, projects, chats, tasks and skills you added; API keys, Telegram and Google Drive connections; your sign-in.</p>
                <p><strong>Moved to the Trash</strong> (you can restore them): the Documents/Tyslin Studio folder with its boards, mind maps, designs and automations, and the same Tyslin folders inside project folders you linked. Your other files stay where they are.</p>
                <p><strong>Then</strong> Tyslin closes and opens again: sign in, name your organization and project, and pick your provider and model.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reset-confirm">Type RESET to confirm</Label>
            <Input id="reset-confirm" className="font-mono" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} autoComplete="off" />
          </div>
          {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={busy}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={typed.trim() !== 'RESET' || busy} onClick={() => void go()}>{busy ? 'Resetting…' : 'Reset and restart'}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Group>
  )
}

function ModelsTab({ onOpenEngines }: { onOpenEngines: () => void }): JSX.Element {
  const [s, setS] = useState<ProviderSettings | null>(null)
  const [pick, setPick] = useState<{ provider: ProviderId; model: string } | null>(null)
  const [saved, flash] = useFlash()

  const load = async (): Promise<void> => {
    const v = await window.tyslin.settings.get()
    setS(v)
    setPick((p) => p ?? { provider: v.defaultModel.provider, model: v.defaultModel.model })
  }
  useEffect(() => { void load() }, [])

  const current = s?.defaultModel
  const changed = !!pick && !!current && (!current.chosen || pick.provider !== current.provider || pick.model.trim() !== current.model)

  return (
    <>
      <Group id="default-h" title="Default model" hint={'Every Lead runs on it, and so does any card on "Default model", through the Studio assistant. It shows in the status bar.'}>
        {pick && <DefaultModelPicker settings={s} value={pick} onChange={setPick} />}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="button" disabled={!changed || !pick?.model.trim()} onClick={async () => {
            if (!pick) return
            await window.tyslin.settings.setPrefs({ defaultProvider: pick.provider, defaultModel: pick.model.trim() })
            await refreshDefaultModel()
            await load()
            flash(`Default model: ${modelLabel(pick)}`)
          }}>Save default model</Button>
          {current && !current.chosen && <span className={hintCls}>Not chosen yet: using {modelLabel(current)}.</span>}
        </div>
      </Group>
      <section aria-labelledby="keys-h" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="keys-h" className="text-base font-semibold">Model providers</h2>
          <p className={hintCls}>Connect one or more. Keys are encrypted with your system keychain and only ever go to their own provider.</p>
        </div>
        <ModelKeys settings={s} onSaved={async (msg) => { await load(); flash(msg) }} onOpenEngines={onOpenEngines} />
      </section>
      {saved && <span className={okCls} role="status">{saved}</span>}
    </>
  )
}

function AgentsTab(): JSX.Element {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [draft, setDraft] = useState('')
  const [saved, flash] = useFlash()

  useEffect(() => {
    void window.tyslin.settings.prefs().then((p) => { setPrefs(p); setDraft(p.sharedInstructions) })
  }, [])
  if (!prefs) return <></>

  const save = async (p: Partial<Preferences>, msg: string): Promise<void> => {
    const next = await window.tyslin.settings.setPrefs(p)
    setPrefs(next)
    setDraft(next.sharedInstructions)
    flash(msg)
  }

  return (
    <>
      <Group id="writes-h" title="File changes for new agents" hint="The starting choice when you build an agent. Each agent can still change it in its editor.">
        <RadioGroup className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5" aria-labelledby="writes-h" value={prefs.defaultWriteMode} onValueChange={(v) => void save({ defaultWriteMode: v as WriteMode }, 'Default saved')}>
          {([
            ['ask', 'Ask before writing files', 'Review a diff, accept or reject each change.'],
            ['direct', 'Write directly', 'Changes go straight to disk.']
          ] as [WriteMode, string, string][]).map(([mode, title, hint]) => (
            <label key={mode} className={choiceCls(prefs.defaultWriteMode === mode)}>
              <RadioGroupItem className={radioCls} value={mode} />
              <span className="flex flex-col gap-0.5"><strong className="font-semibold">{title}</strong><span className={hintCls}>{hint}</span></span>
            </label>
          ))}
        </RadioGroup>
      </Group>
      <Group id="shared-h" title="Guidelines for every agent" hint="Added to each agent's own instructions. Use it for house rules: tone, format, things to always or never do.">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shared-ins">Guidelines</Label>
          <Textarea id="shared-ins" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={'e.g.\nUse British English.\nKeep replies under 200 words unless asked for more.\nNever invent numbers; say when you are unsure.'} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={!draft && !prefs.sharedInstructions} onClick={() => void save({ sharedInstructions: '' }, 'Guidelines cleared')}>Clear</Button>
          <Button type="button" disabled={draft.trim() === prefs.sharedInstructions} onClick={() => void save({ sharedInstructions: draft }, 'Guidelines saved')}>Save guidelines</Button>
        </div>
      </Group>
      {saved && <span className={okCls} role="status">{saved}</span>}
    </>
  )
}

/** One row of the engine table: name, where it was found, status, then its install flow, command and test. */
function EngineCard({ engine, onChange }: { engine: EngineStatus; onChange: (e: EngineStatus) => void }): JSX.Element {
  const [command, setCommand] = useState(engine.command)
  const [test, setTest] = useState<EngineTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  // Install flow: closed → confirm (shows the exact command) → running → done
  const [install, setInstall] = useState<'closed' | 'confirm' | 'running' | 'done'>('closed')
  const [log, setLog] = useState('')
  const [installError, setInstallError] = useState<string | null>(null)
  const logRef = useRef<HTMLPreElement>(null)
  const id = 'eng-' + engine.id

  useEffect(() => window.tyslin.engines.onInstallOutput((o) => {
    if (o.id === engine.id) setLog((l) => (l + o.text).slice(-60_000))
  }), [engine.id])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [log])

  const runInstall = async (): Promise<void> => {
    setLog('')
    setInstallError(null)
    setInstall('running')
    const r = await track(`engine:${engine.id}`, `Installing ${engine.name}`, () => window.tyslin.engines.install(engine.id))
    onChange(r.status)
    if (!r.ok) setInstallError(r.error ?? 'The install failed.')
    else if (!r.status.resolvedPath) setInstallError(`The installer finished, but Tyslin can't find ${engine.name} yet. Restart Tyslin, or set its full path in the Command field below.`)
    setInstall('done')
  }

  const save = async (): Promise<void> => {
    onChange(await window.tyslin.engines.setCommand(engine.id, command))
    setTest(null)
  }
  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTest(await window.tyslin.engines.test(engine.id))
    setTesting(false)
  }

  const panel = 'flex flex-col gap-2.5 rounded-xl border border-border bg-muted p-3.5 text-sm'
  return (
    <section className="flex flex-col gap-4 px-5 py-4" aria-labelledby={id + '-h'}>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px]">
        <div className="flex min-w-0 items-start gap-3">
          <Mark id={engine.id} size={36} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={id + '-h'} className="text-[15px] font-semibold">{engine.name}</h2>
            <p className={hintCls}>{engine.description} {engine.note}</p>
          </div>
        </div>
        <span className="min-w-0 self-center font-mono text-xs break-all text-muted-foreground">{engine.resolvedPath}</span>
        <span className="self-center lg:justify-self-start">
          <Badge variant={engine.resolvedPath ? 'soft' : 'secondary'} className="h-6 px-2">
            {engine.resolvedPath && <span className="size-1.5 rounded-full bg-green" aria-hidden="true" />}
            {engine.resolvedPath ? 'Installed' : engine.id === 'custom' && !engine.command ? 'Not set up' : 'Not installed'}
          </Badge>
        </span>
      </div>
      {engine.install && !engine.resolvedPath && install === 'closed' && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="button" onClick={() => setInstall('confirm')}>Install {engine.name}</Button>
          <span className={hintCls}>Runs the official installer from {engine.install.source}.</span>
        </div>
      )}
      {engine.install && install === 'confirm' && (
        <div className={panel} role="group" aria-label={`Install ${engine.name}`}>
          <strong className="font-medium">This will run on your computer:</strong>
          <pre className="rounded-md border border-border bg-card px-3 py-2.5 font-mono text-xs break-all whitespace-pre-wrap">{engine.install.command}</pre>
          <span className={hintCls}>
            It downloads {engine.name}'s official installer from {engine.install.source} and runs it with your user account.
            Tyslin doesn't check what the installer does; read the setup guide first if you're unsure.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setInstall('closed')}>Cancel</Button>
            <Button type="button" onClick={() => void runInstall()}>Install</Button>
          </div>
        </div>
      )}
      {(install === 'running' || install === 'done') && (
        <div className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="font-medium" role="status">{install === 'running' ? `Installing ${engine.name}…` : installError ? 'Install did not finish' : `${engine.name} is installed`}</strong>
            {install === 'running'
              ? <Button type="button" variant="outline" size="sm" onClick={() => void window.tyslin.engines.cancelInstall(engine.id)}>Stop</Button>
              : <Button type="button" variant="outline" size="sm" onClick={() => setInstall('closed')}>Close</Button>}
          </div>
          <pre className="max-h-[260px] overflow-auto rounded-md bg-primary px-3 py-2.5 font-mono text-xs leading-normal break-words whitespace-pre-wrap text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40" ref={logRef} aria-label="Installer output" tabIndex={0}>{log || 'Starting…'}</pre>
          {install === 'done' && installError && <div className={errorBoxCls} role="alert">{installError}</div>}
          {install === 'done' && !installError && engine.install && <span className={okCls}>Next: {engine.install.nextStep}</span>}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="text-[13px]">Command</Label>
        <div className="flex items-center gap-2">
          <Input id={id} className="flex-1 font-mono" value={command} onChange={(e) => setCommand(e.target.value)}
            placeholder={engine.defaultCommand || 'my-agent --acp'} />
          <Button type="button" variant="outline" disabled={command.trim() === engine.command} onClick={() => void save()}>Save</Button>
        </div>
        <span className="text-xs text-muted-foreground">{engine.defaultCommand ? `Leave empty to use "${engine.defaultCommand}". Use a full path if Tyslin can't find it.` : 'The program and its arguments.'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="button" variant="outline" disabled={testing || !engine.resolvedPath} onClick={() => void runTest()}>{testing ? 'Testing…' : 'Test connection'}</Button>
        <a href={engine.docsUrl} target="_blank" rel="noreferrer" className={linkCls}>Install and setup guide</a>
      </div>
      {test && (test.ok
        ? <span className={okCls} role="status">Connected to {test.agent ?? engine.name} over ACP v{test.protocolVersion}.{test.authMethods?.length ? ` It may ask you to sign in (${test.authMethods.join(', ')}).` : ''}</span>
        : <div className={cn(errorBoxCls, 'whitespace-pre-wrap')} role="alert">{test.error}</div>)}
    </section>
  )
}

function EnginesTab(): JSX.Element {
  const [engines, setEngines] = useState<EngineStatus[]>([])
  useEffect(() => { void window.tyslin.engines.list().then(setEngines) }, [])
  const replace = (e: EngineStatus): void => setEngines((list) => list.map((x) => (x.id === e.id ? e : x)))

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="hidden border-b border-border bg-muted px-5 py-2.5 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px] lg:gap-3" aria-hidden="true">
        <span>Engine</span><span>Program</span><span>Status</span>
      </div>
      <div className="divide-y divide-border">
        {engines.filter((e) => engineListed(e.id)).map((e) => <EngineCard key={e.id} engine={e} onChange={replace} />)}
      </div>
    </Card>
  )
}

function AccountTab({ onAuthChange }: { onAuthChange?: (s: AuthStatus) => void }): JSX.Element {
  return (
    <Group id="account-h" title="Google account" hint="Your agents, chats and keys stay on this computer. Tyslin keeps only your name and email, and no Google tokens.">
      <AccountBox onChange={onAuthChange} />
    </Group>
  )
}

function AboutTab(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    void window.tyslin.app.info().then(setInfo)
    void window.tyslin.updates.status().then(setUpdate)
    return window.tyslin.updates.onStatus(setUpdate)
  }, [])

  return (
    <>
      <Group id="upd-h" title="Updates" hint="Tyslin Studio checks GitHub Releases when it starts and every few hours.">
        <KV rows={[
          ['Installed', <span key="v" className="font-mono">v{info?.version ?? '…'}</span>],
          ['Status', <span key="s" role="status">{update?.managedBy === 'snap' ? 'Updates install automatically from the Snap Store.' : update ? (update.state === 'error' ? `${UPDATE_TEXT.error} ${update.error ?? ''}` : UPDATE_TEXT[update.state]) : '…'}
            {update?.version && update.state !== 'none' && <span className="font-mono"> v{update.version}</span>}</span>]
        ]} />
        <div className="flex flex-wrap items-center gap-2">
          {update?.managedBy !== 'snap' && <Button type="button" variant="outline" disabled={update?.state === 'checking'} onClick={() => void window.tyslin.updates.check().then(setUpdate)}>Check now</Button>}
          {update?.state === 'ready' && <Button type="button" variant="lime" onClick={() => void window.tyslin.updates.install()}>Restart to update</Button>}
          {update?.state === 'available' && <Button type="button" variant="lime" onClick={() => void window.tyslin.updates.openDownload()}>Download</Button>}
        </div>
      </Group>
      <Group id="data-h" title="Your data" hint="Agencies, agents, chats and skills live in a local database, one per organization; boards and the files your agents make are in each agency's folder. Tyslin sends nothing anywhere except your work to the model providers and adapters you set up (Claude Code, Codex and Gemini CLI run on this computer and talk to their own services), the Lead's messages to the Telegram or Slack chats you link, Google when you sign in or sync Drive, and requests to GitHub for updates, skill packs and the star count.">
        <KV rows={[['Location', <span key="l" className="font-mono text-xs break-all">{info?.dataPath ?? '…'}</span>]]} />
        <div>
          <Button type="button" variant="outline" onClick={() => void window.tyslin.app.openDataFolder()}>Open folder</Button>
        </div>
      </Group>
      <ResetBox />
      <section className="flex flex-col items-start gap-4 rounded-xl border border-border bg-card p-5 shadow-xs" aria-label="About">
        <img src={stacked} alt="Tyslin" className="w-24 dark:hidden" />
        <span className="hidden dark:block">
          <span className="flex w-24 flex-col items-center gap-2.5">
            <img src={mark} alt="Tyslin" className="w-20" />
            <img src={wordmarkWhite} alt="" className="w-24" />
          </span>
        </span>
        <KV rows={[
          ['Version', <span key="v" className="font-mono">{info?.version ?? '…'}</span>],
          ['Electron', <span key="e" className="font-mono">{info?.electron ?? '…'}</span>],
          ['Platform', <span key="p" className="font-mono">{info?.platform ?? '…'}</span>]
        ]} />
        <GitHubStars />
        <span className={hintCls}>Every agent you run. One studio. · <a href="https://tyslin.ai" target="_blank" rel="noreferrer" className="text-green underline-offset-4 hover:underline">tyslin.ai</a> · <a href="https://github.com/ReactiveSpace2/tyslin-studio/issues" target="_blank" rel="noreferrer" className="text-green underline-offset-4 hover:underline">Report an issue</a></span>
      </section>
    </>
  )
}

/** The page title and line for each section (left nav item = title). */
const TAB_LINE: Record<Tab, string> = {
  models: 'The models your Leads and agents run on.',
  engines: 'Run any agent with an external agent instead of Tyslin\'s built-in models: pick it under "Runs on" in the agent\'s editor. Tyslin talks to them over the Agent Client Protocol (ACP). Install them yourself; Tyslin starts them when needed and stops them after each reply.',
  agents: 'Defaults for every agent you build.',
  appearance: 'How Tyslin looks on this computer.',
  account: 'Your sign-in on this computer.',
  about: 'Version, updates and your data.'
}

export function SettingsPage({ initialTab = 'models', onAuthChange }: { initialTab?: SettingsTab; onAuthChange?: (s: AuthStatus) => void }): JSX.Element {
  const [tab, setTab] = useState<Tab>(initialTab)
  const title = TABS.find(([id]) => id === tab)?.[1] ?? ''

  return (
    <div className="relative isolate [--card:rgba(255,255,255,0.82)] dark:[--card:rgba(31,31,28,0.82)] mx-auto flex w-full max-w-[1280px] flex-wrap gap-8 px-10 pt-8 pb-12 text-foreground">
      <Watermark pose="thinking" />
      <div className="flex max-w-[220px] flex-[1_1_200px] flex-col gap-3">
        <span className="px-3 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">Settings</span>
        <div className="flex flex-col gap-0.5" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" id={'tab-' + id} aria-selected={tab === id} aria-controls="settings-panel"
              className={cn('flex h-9 items-center rounded-md px-3 text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                tab === id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
              onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-5" role="tabpanel" id="settings-panel" aria-labelledby={'tab-' + tab}>
        <header className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>
          <p className="max-w-[760px] text-[15px] leading-relaxed text-muted-foreground">{TAB_LINE[tab]}</p>
        </header>
        {tab === 'models' && <ModelsTab onOpenEngines={() => setTab('engines')} />}
        {tab === 'agents' && <AgentsTab />}
        {tab === 'engines' && <EnginesTab />}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'account' && <AccountTab onAuthChange={onAuthChange} />}
        {tab === 'about' && <AboutTab />}
      </div>
    </div>
  )
}
