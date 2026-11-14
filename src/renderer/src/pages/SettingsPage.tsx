import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { AccountEngine, AccountStatus, AdapterState, AppInfo, AuthStatus, Organization, OrgColor, Preferences, ProviderId, ProviderSettings, Theme, UpdateStatus, WriteMode } from '@shared/types'
import { ORG_COLORS } from '@shared/types'
import stacked from '../assets/logo-stacked.png'
import mark from '../assets/logo-mark.png'
import wordmarkWhite from '../assets/wordmark-white.png'
import type { AgencyView } from '../agencies'
import { AccountBox } from '../components/AccountBox'
import { ZoomControl } from '../components/ZoomControl'
import { ColorSwatches } from '../components/ColorSwatches'
import { GitHubStars } from '../components/GitHubStars'
import { GoogleDriveCard } from '../components/GoogleDrive'
import { Icon } from '../components/Icon'
import { refreshAppearance } from '../appearance'
import { DefaultModelPicker, ModelKeys } from '../components/ModelSetup'
import { modelLabel, refreshDefaultModel } from '../defaultModel'
import { Mark } from '../components/RunsOnBadge'
import { ChannelDialog } from '../agency/ChannelTab'
import { BusyBar, adapterLine, isBusy, useAdapterStates } from '../components/AdapterNotice'
import { UsageTab } from '../settings/UsageTab'
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

export type SettingsTab = 'models' | 'accounts' | 'usage' | 'appearance' | 'notifications' | 'about'
const TABS: [SettingsTab, string][] = [['models', 'Models'], ['accounts', 'Accounts and connectors'], ['usage', 'Usage'], ['appearance', 'Appearance'], ['notifications', 'Notifications'], ['about', 'About']]

const UPDATE_TEXT: Record<UpdateStatus['state'], string> = {
  idle: 'Update checks run in installed builds only.', checking: 'Checking…', none: 'You have the latest version.', available: 'A new version is ready to download.',
  downloading: 'Downloading the update…', ready: 'Update downloaded. Restart to install it.', error: 'Could not check for updates.'
}

function useFlash(): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  return [msg, (m) => { setMsg(m); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(null), 2500) }]
}

const hintCls = 'text-[13px] leading-relaxed text-muted-foreground'
const okCls = 'text-[13px] text-green'

/** One group of settings: a card with a heading and a short line under it. */
function Group({ id, title, hint, className, children }: { id: string; title: React.ReactNode; hint?: React.ReactNode; className?: string; children?: React.ReactNode }): JSX.Element {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs', className)}>
      <div className="flex flex-col gap-1"><h2 id={id} className="text-base font-semibold">{title}</h2>{hint && <p className={hintCls}>{hint}</p>}</div>
      {children}
    </section>
  )
}
const choiceCls = (on: boolean): string => cn('relative flex cursor-pointer gap-3 rounded-xl border bg-card p-3.5 text-sm transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40', on ? 'border-primary bg-lime-soft' : 'border-border hover:bg-accent')
const radioCls = 'sr-only'
function KV({ rows }: { rows: [string, React.ReactNode][] }): JSX.Element {
  return <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}</dl>
}
/** A row with a label, a hint and a control on the right. */
function Row({ title, hint, children }: { title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }): JSX.Element {
  return <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-3.5 last:border-b-0"><span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-sm font-semibold">{title}</span>{hint && <span className={hintCls}>{hint}</span>}</span><span className="flex items-center gap-2">{children}</span></div>
}

const THEMES: [Theme, string, string][] = [['system', 'System', 'Match your computer and switch with it.'], ['light', 'Light', 'Parchment background, ink text.'], ['dark', 'Dark', 'Dark background, easier on the eyes at night.']]
const PREVIEW_LIGHT = { '--pv-bg': '#FAFAF7', '--pv-rail': '#F3F3EE', '--pv-edge': '#E4E4DD', '--pv-ink': '#0F0F0D' } as React.CSSProperties
const PREVIEW_DARK = { '--pv-bg': '#121210', '--pv-rail': '#1A1A17', '--pv-edge': '#33332E', '--pv-ink': '#F3F3EE' } as React.CSSProperties
function ThemePreview({ theme }: { theme: Theme }): JSX.Element {
  const pane = (dark: boolean): JSX.Element => (
    <span className="flex flex-1 bg-[var(--pv-bg)]" style={{ ...(dark ? PREVIEW_DARK : PREVIEW_LIGHT), '--pv-lime': '#7DB800' } as React.CSSProperties}>
      <span className="w-[18%] border-r border-[var(--pv-edge)] bg-[var(--pv-rail)]" />
      <span className="flex flex-1 flex-col gap-1.5 px-2.5 py-3"><span className="h-1.5 w-4/5 rounded-[3px] bg-[var(--pv-ink)] opacity-80" /><span className="h-1.5 w-1/2 rounded-[3px] bg-[var(--pv-ink)] opacity-35" /><span className="mt-auto h-3.5 w-[44%] rounded-[5px] bg-[var(--pv-lime)]" /></span>
    </span>
  )
  return <span className="flex h-[88px] w-full overflow-hidden rounded-[10px] border border-border" aria-hidden="true">{theme === 'system' ? <>{pane(false)}{pane(true)}</> : pane(theme === 'dark')}</span>
}
type Accent = Preferences['accent']
const ACCENTS: [Accent, string, string][] = [['lime', 'Lime', 'The Tyslin brand colour.'], ['forest', 'Forest', 'Dark green fills with light text. Quieter.'], ['mono', 'Monochrome', 'Ink only. Good for screenshots and focus.'], ['org', 'Project colour', 'Each project uses its own colour.']]

function AppearanceTab(): JSX.Element {
  const [prefs, setPrefsState] = useState<Preferences | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  useEffect(() => { void window.tyslin.settings.prefs().then(setPrefsState); void window.tyslin.orgs.list().then((o) => setOrg(o.find((x) => x.current) ?? null)) }, [])
  if (!prefs) return <></>
  const save = async (p: Partial<Preferences>): Promise<void> => { setPrefsState({ ...prefs, ...p }); setPrefsState(await window.tyslin.settings.setPrefs(p)); await refreshAppearance() }
  const setOrgColor = async (c: OrgColor): Promise<void> => { if (!org) return; setOrg({ ...org, color: c }); await window.tyslin.orgs.setColor(org.id, c); await refreshAppearance() }
  const accentFill = (a: Accent): string => a === 'lime' ? '#7DB800' : a === 'forest' ? '#4A7000' : a === 'mono' ? '#0F0F0D' : ORG_COLORS[org?.color ?? 'lime'].fill
  return (
    <>
      <Group id="theme-h" title="Theme" hint="Changes apply straight away, on this computer.">
        <RadioGroup className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3" aria-labelledby="theme-h" value={prefs.theme} onValueChange={(v) => void save({ theme: v as Theme })}>
          {THEMES.map(([id, title, hint]) => <label key={id} className={cn(choiceCls(prefs.theme === id), 'flex-col p-2.5')}><ThemePreview theme={id} /><RadioGroupItem className={radioCls} value={id} /><span className="flex flex-col gap-0.5 px-1 pb-0.5"><strong className="text-sm font-semibold">{title}</strong><span className={hintCls}>{hint}</span></span></label>)}
        </RadioGroup>
      </Group>
      <Group id="accent-h" title="Accent colour" hint="Used for buttons, selected items, progress bars and highlights. The Tyslin logo and robots keep their colours.">
        <RadioGroup className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5" aria-labelledby="accent-h" value={prefs.accent} onValueChange={(v) => void save({ accent: v as Accent })}>
          {ACCENTS.map(([id, title, hint]) => <label key={id} className={cn(choiceCls(prefs.accent === id), 'items-center')}><RadioGroupItem className={radioCls} value={id} /><span className="size-7 flex-none rounded-lg border border-border" aria-hidden="true" style={{ background: accentFill(id) }} /><span className="flex flex-col gap-0.5"><strong className="font-semibold">{title}</strong><span className={hintCls}>{hint}</span></span></label>)}
        </RadioGroup>
      </Group>
      {org && <Group id="orgcolor-h" title={<>Colour for {org.name}</>} hint="Marks this project in your menu, and sets the accent when 'Project colour' is chosen above."><ColorSwatches value={org.color} onChange={(c) => void setOrgColor(c)} name="org-color" /></Group>}
      <Group id="icons-h" title="Icons" hint="Bold strokes are easier to see at small sizes and low zoom.">
        <RadioGroup className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5" aria-labelledby="icons-h" value={prefs.iconStyle} onValueChange={(v) => void save({ iconStyle: v as Preferences['iconStyle'] })}>
          {([['outline', 'Outline', 'Thin, light strokes.'], ['bold', 'Bold', 'Thicker strokes.']] as const).map(([id, title, hint]) => <label key={id} className={choiceCls(prefs.iconStyle === id)}><RadioGroupItem className={radioCls} value={id} /><span className="flex flex-col gap-0.5"><strong className="font-semibold">{title}</strong><span className={hintCls}>{hint}</span><span className={cn('mt-2 flex gap-3 text-foreground', id === 'bold' ? '[--icon-stroke:2.1]' : '[--icon-stroke:1.6]')} aria-hidden="true"><Icon name="home" size={18} /><Icon name="agents" size={18} /><Icon name="chat" size={18} /><Icon name="clock" size={18} /><Icon name="settings" size={18} /></span></span></label>)}
        </RadioGroup>
      </Group>
      <Card className="gap-0 px-5 py-1"><Row title="Zoom" hint="From 70% to 150%. Also Ctrl + and Ctrl − (⌘ on Mac); Ctrl 0 resets."><ZoomControl /></Row></Card>
    </>
  )
}

/** The sign-in each adapter can use and the Models key it falls back to. */
const ADAPTER_AUTH: Record<AccountEngine, { account: string; key: string; flag: keyof ProviderSettings }> = {
  'claude-code': { account: 'Claude', key: 'Claude', flag: 'anthropicKeySet' },
  codex: { account: 'ChatGPT', key: 'OpenAI', flag: 'openaiKeySet' },
  'gemini-cli': { account: 'Google', key: 'Gemini', flag: 'geminiKeySet' }
}

/**
 * Adapters (14 Nov 2026, owner): Tyslin downloads Claude Code, Codex and Gemini CLI itself and keeps them up to date,
 * so this card only shows the version, what is being downloaded, and what each one runs on. Nothing to sign in to or
 * pick here: a signed-in adapter uses its sign-in, otherwise the key from Models.
 */
function AdaptersCard(): JSX.Element {
  const list = useAdapterStates()
  const [accounts, setAccounts] = useState<AccountStatus[] | null>(null)
  const [keys, setKeys] = useState<ProviderSettings | null>(null)
  const [checking, setChecking] = useState(false)
  const doneAt = Math.max(0, ...list.map((a) => a.at ?? 0))
  useEffect(() => {
    void window.tyslin.accounts.status().then(setAccounts).catch(() => setAccounts([]))
    void window.tyslin.settings.get().then(setKeys).catch(() => undefined)
  }, [doneAt])
  const runsOn = (a: AdapterState): string => {
    const auth = ADAPTER_AUTH[a.id]
    if (!accounts || !keys) return 'Checking how it signs in…'
    const acct = accounts.find((x) => x.engine === a.id)
    if (acct?.signedIn) return `Uses your ${auth.account} sign-in${acct.email ? ` (${acct.email}${acct.plan ? `, ${acct.plan} plan` : ''})` : ''}`
    if (keys[auth.flag]) return `Uses your ${auth.key} key from Models`
    return `No ${auth.account} sign-in or ${auth.key} key on this computer yet`
  }
  const check = async (): Promise<void> => { setChecking(true); try { await window.tyslin.engines.checkAdapters() } finally { setChecking(false) } }
  const anyBusy = list.some((a) => isBusy(a) || a.phase === 'checking')
  return (
    <Group id="adapters-h" title="Adapters" hint="Workers run on Claude Code, Codex or Gemini CLI. Tyslin downloads them for you and keeps them up to date.">
      <div className="flex flex-col">
        {list.map((a) => (
          <div key={a.id} className="flex flex-col gap-2 border-b border-border py-3.5 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2.5 text-sm font-semibold"><Mark id={a.id} size={28} />{a.name}</span>
                <span className={hintCls}>{runsOn(a)}</span>
              </span>
              {a.phase === 'error'
                ? <span className="max-w-72 text-right text-[13px] text-destructive" title={a.error}>{adapterLine(a)}</span>
                : a.phase === 'idle' || a.phase === 'done' || (a.phase === 'checking' && a.version)
                  ? <Badge variant={a.version ? 'soft' : 'secondary'} className="h-6 gap-1.5 px-2 font-mono text-[11px]">{a.version && <span className="size-1.5 rounded-full bg-green" aria-hidden="true" />}{a.version ? `v${a.version}` : 'Not installed yet'}</Badge>
                  : !isBusy(a) && <span className="text-[13px] text-muted-foreground" role="status">{adapterLine(a)}</span>}
            </div>
            {isBusy(a) && <div className="flex flex-col gap-1"><span className="text-[13px]" role="status">{adapterLine(a)}</span><BusyBar track="bg-muted" /></div>}
            {a.phase === 'error' && a.error && <span className="font-mono text-[11px] break-words text-muted-foreground">{a.error}</span>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button type="button" variant="outline" size="sm" disabled={checking || anyBusy} onClick={() => void check()}>{checking || anyBusy ? 'Checking…' : 'Check for updates'}</Button>
        <span className={hintCls}>Tyslin also checks when it opens and every six hours.</span>
      </div>
    </Group>
  )
}

function AccountsTab({ agencies, activeAgency, onAuthChange, onChanged }: { agencies: AgencyView[]; activeAgency: string | null; onAuthChange?: (s: AuthStatus) => void; onChanged: () => void }): JSX.Element {
  const [channel, setChannel] = useState(false)
  const view = agencies.find((v) => v.agency.id === activeAgency) ?? agencies[0] ?? null
  return (
    <>
      <AdaptersCard />
      <Group id="google-h" title="Google account" hint="Your sign-in on this computer. Tyslin keeps only your name and email."><AccountBox onChange={onAuthChange} /></Group>
      <Group id="drive-h" title="Google Drive" hint="Keeps a copy of each team's folder in your Drive and brings back what you change there."><GoogleDriveCard /></Group>
      <Card className="gap-0 px-5 py-1">
        <Row title="Telegram and Slack" hint="Where a Lead reaches you when you're away. Set up once; each team chooses whether to use it.">{view ? <Button variant="outline" size="sm" onClick={() => setChannel(true)}>Manage</Button> : <span className={hintCls}>Create a team first.</span>}</Row>
        <Row title="Connectors (MCP)" hint="Per team, each with its own token: Team → Connectors."><span className={hintCls}>{agencies.length ? `${agencies.length} ${agencies.length === 1 ? 'team' : 'teams'}` : 'No teams yet'}</span></Row>
      </Card>
      {channel && view && <ChannelDialog view={view} kind={view.agency.channel.kind === 'slack' ? 'slack' : 'telegram'} onClose={() => setChannel(false)} onChanged={onChanged} />}
    </>
  )
}

function NotificationsTab(): JSX.Element {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [draft, setDraft] = useState('')
  const [saved, flash] = useFlash()
  useEffect(() => { void window.tyslin.settings.prefs().then((p) => { setPrefs(p); setDraft(p.sharedInstructions) }) }, [])
  if (!prefs) return <></>
  const save = async (p: Partial<Preferences>, msg: string): Promise<void> => { const next = await window.tyslin.settings.setPrefs(p); setPrefs(next); setDraft(next.sharedInstructions); flash(msg) }
  return (
    <>
      <Card className="gap-0 px-5 py-1">
        <Row title="Desktop notifications" hint="When a Lead needs you: questions and reviews. The app icon shows the count either way."><Switch checked={prefs.desktopNotifications} aria-label="Desktop notifications" onCheckedChange={(v) => void save({ desktopNotifications: v }, v ? 'Notifications on' : 'Notifications off')} /></Row>
        <Row title="Telegram and Slack" hint="What each Lead sends there is set per team: Team → Goals → Limits (everything, questions only, or a digest)."><span className={hintCls}>Per team</span></Row>
      </Card>
      <Group id="approvals-h" title="Approvals" hint="What external agents (Claude Code, Codex, Gemini CLI) may do without asking you.">
        <Card className="gap-0 px-5 py-1">
          <Row title="Allow read-only commands without asking" hint="Looking at files inside the team's folder (ls, cat, grep, git status, find) and version checks (node -v, which pnpm). Anything that writes, installs, runs code or reaches the network still asks."><Switch checked={prefs.autoAllowReadOnly} aria-label="Allow read-only commands without asking" onCheckedChange={(v) => void save({ autoAllowReadOnly: v }, v ? 'Read-only commands allowed' : 'Every command asks')} /></Row>
        </Card>
      </Group>
      <Group id="writes-h" title="File changes for new agents" hint="The starting choice when you add a worker. Each agent can change it on its page.">
        <RadioGroup className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5" aria-labelledby="writes-h" value={prefs.defaultWriteMode} onValueChange={(v) => void save({ defaultWriteMode: v as WriteMode }, 'Default saved')}>
          {([['ask', 'Ask before writing files', 'Review each change, accept or send it back.'], ['direct', 'Write directly', 'Changes go straight to disk.']] as [WriteMode, string, string][]).map(([m, t, h]) => <label key={m} className={choiceCls(prefs.defaultWriteMode === m)}><RadioGroupItem className={radioCls} value={m} /><span className="flex flex-col gap-0.5"><strong className="font-semibold">{t}</strong><span className={hintCls}>{h}</span></span></label>)}
        </RadioGroup>
        <p className={hintCls}>Each team also has Ask first or Auto for commands, under the message box in a task.</p>
      </Group>
      <Group id="shared-h" title="Guidelines for every agent, in every team" hint="Added to each agent's instructions. Team-level rules live under Team → Goals.">
        <div className="flex flex-col gap-1.5"><Label htmlFor="shared-ins">Guidelines</Label><Textarea id="shared-ins" rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={'e.g.\nUse British English.\nNever invent numbers; say when you are unsure.'} /></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={!draft && !prefs.sharedInstructions} onClick={() => void save({ sharedInstructions: '' }, 'Guidelines cleared')}>Clear</Button><Button type="button" disabled={draft.trim() === prefs.sharedInstructions} onClick={() => void save({ sharedInstructions: draft }, 'Guidelines saved')}>Save guidelines</Button></div>
      </Group>
      {saved && <span className={okCls} role="status">{saved}</span>}
    </>
  )
}

function ModelsTab({ onOpenAccounts }: { onOpenAccounts: () => void }): JSX.Element {
  const [s, setS] = useState<ProviderSettings | null>(null)
  const [pick, setPick] = useState<{ provider: ProviderId; model: string } | null>(null)
  const [saved, flash] = useFlash()
  // Honest about storage: without a system keychain (some Linux desktops) keys are saved unencrypted (QA, 10 Nov 2026).
  const [keychain, setKeychain] = useState(true)
  useEffect(() => { void window.tyslin.app.info().then((i) => setKeychain(i.keychain)).catch(() => undefined) }, [])
  const load = async (): Promise<void> => { const v = await window.tyslin.settings.get(); setS(v); setPick((p) => p ?? { provider: v.defaultModel.provider, model: v.defaultModel.model }) }
  useEffect(() => { void load() }, [])
  const current = s?.defaultModel
  const changed = !!pick && !!current && (!current.chosen || pick.provider !== current.provider || pick.model.trim() !== current.model)
  return (
    <>
      <Group id="default-h" title="Default model" hint="Leads run on it (a Lead you set to another model on its page keeps that one), and anything not set otherwise. It shows in the status bar.">
        {pick && <DefaultModelPicker settings={s} value={pick} onChange={setPick} />}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="button" disabled={!changed || !pick?.model.trim()} onClick={async () => { if (!pick) return; await window.tyslin.settings.setPrefs({ defaultProvider: pick.provider, defaultModel: pick.model.trim() }); await refreshDefaultModel(); await load(); flash(`Default model: ${modelLabel(pick)}`) }}>Save default model</Button>
          {current && !current.chosen && <span className={hintCls}>Not chosen yet: using {modelLabel(current)}.</span>}
        </div>
      </Group>
      <section aria-labelledby="keys-h" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1"><h2 id="keys-h" className="text-base font-semibold">Model providers</h2><p className={hintCls}>{keychain ? 'Keys are encrypted with your system keychain and only ever go to their own provider.' : "Keys only ever go to their own provider. This computer has no system keychain Tyslin can use, so keys are saved unencrypted in Tyslin's data folder."}</p></div>
        <ModelKeys settings={s} onSaved={async (msg) => { await load(); flash(msg) }} onOpenEngines={onOpenAccounts} />
      </section>
      {saved && <span className={okCls} role="status">{saved}</span>}
    </>
  )
}

function ResetBox(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async (): Promise<void> => { setBusy(true); setError(null); try { await window.tyslin.app.reset() } catch (e) { setError(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e)); setBusy(false) } }
  return (
    <Group id="reset-h" title="Reset Tyslin Studio" className="border-destructive-soft" hint="Start again as if Tyslin were just installed. Every project, team, agent, chat, task and skill is removed, along with your keys and sign-in. Your files move to the Trash.">
      <div><Button type="button" variant="destructive" onClick={() => { setOpen(true); setTyped('') }}>Reset…</Button></div>
      <AlertDialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o) }}>
        <AlertDialogContent className="w-[560px] gap-4 rounded-2xl border-0 sm:max-w-[560px]">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle className="text-xl font-semibold">Reset everything?</AlertDialogTitle>
            <AlertDialogDescription asChild><div className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground"><p><strong>Deleted from this computer:</strong> all projects and their teams, agents, chats, tasks and skills; API keys, Telegram, Slack and Google Drive connections; your sign-in.</p><p><strong>Moved to the Trash</strong> (you can restore them): the Documents/Tyslin Studio folder, and Tyslin's own folders inside team folders you picked yourself. Your other files stay where they are.</p><p><strong>Then</strong> Tyslin closes and opens again on the first-run setup.</p></div></AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5"><Label htmlFor="reset-confirm">Type RESET to confirm</Label><Input id="reset-confirm" className="font-mono" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} autoComplete="off" /></div>
          {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
          <AlertDialogFooter><AlertDialogCancel type="button" disabled={busy}>Cancel</AlertDialogCancel><Button type="button" variant="destructive" disabled={typed.trim() !== 'RESET' || busy} onClick={() => void go()}>{busy ? 'Resetting…' : 'Reset and restart'}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Group>
  )
}

function AboutTab({ orgName, agencyCount }: { orgName: string; agencyCount: number }): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  useEffect(() => { void window.tyslin.app.info().then(setInfo); void window.tyslin.updates.status().then(setUpdate); return window.tyslin.updates.onStatus(setUpdate) }, [])
  return (
    <>
      <Group id="upd-h" title="Updates" hint="Tyslin Studio checks GitHub Releases when it starts and every few hours.">
        <KV rows={[['Installed', <span key="v" className="font-mono">v{info?.version ?? '…'}</span>], ['Status', <span key="s" role="status">{update?.managedBy === 'snap' ? 'Updates install automatically from the Snap Store.' : update ? (update.state === 'error' ? `${UPDATE_TEXT.error} ${update.error ?? ''}` : UPDATE_TEXT[update.state]) : '…'}{update?.version && update.state !== 'none' && <span className="font-mono"> v{update.version}</span>}</span>]]} />
        <div className="flex flex-wrap items-center gap-2">
          {update?.managedBy !== 'snap' && <Button type="button" variant="outline" disabled={update?.state === 'checking'} onClick={() => void window.tyslin.updates.check().then(setUpdate)}>Check now</Button>}
          {update?.state === 'ready' && <Button type="button" variant="lime" onClick={() => void window.tyslin.updates.install()}>Restart to update</Button>}
          {update?.state === 'available' && <Button type="button" variant="lime" onClick={() => void window.tyslin.updates.openDownload()}>Download</Button>}
        </div>
      </Group>
      <Group id="org-h" title="Project" hint="Switch, rename or add one from your menu at the foot of the left column.">
        <KV rows={[['Current', orgName || '…'], ['Teams', String(agencyCount)], ['Location', <span key="l" className="font-mono text-xs break-all">{info?.dataPath ?? '…'}</span>]]} />
        <div><Button type="button" variant="outline" onClick={() => void window.tyslin.app.openDataFolder()}>Open the data folder</Button></div>
        <p className={hintCls}>Teams, agents, chats and skills live in a local database, one per project; boards, memory and the files your agents make are in each team's folder. Tyslin sends nothing anywhere except your work to the model providers and adapters you set up, the Lead's messages to the chats you link, Google when you sign in or sync Drive, and requests to GitHub for updates, skill packs and the star count.</p>
      </Group>
      <ResetBox />
      <section className="flex flex-col items-start gap-4 rounded-xl border border-border bg-card p-5 shadow-xs" aria-label="About">
        <img src={stacked} alt="Tyslin" className="w-24 dark:hidden" />
        <span className="hidden dark:block"><span className="flex w-24 flex-col items-center gap-2.5"><img src={mark} alt="Tyslin" className="w-20" /><img src={wordmarkWhite} alt="" className="w-24" /></span></span>
        <KV rows={[['Version', <span key="v" className="font-mono">{info?.version ?? '…'}</span>], ['Electron', <span key="e" className="font-mono">{info?.electron ?? '…'}</span>], ['Platform', <span key="p" className="font-mono">{info?.platform ?? '…'}</span>]]} />
        <GitHubStars />
        <span className={hintCls}>The Agent management studio. · <a href="https://tyslin.ai" target="_blank" rel="noreferrer" className="text-green underline-offset-4 hover:underline">tyslin.ai</a> · <a href="https://github.com/ReactiveSpace2/tyslin-studio/issues" target="_blank" rel="noreferrer" className="text-green underline-offset-4 hover:underline">Report an issue</a></span>
      </section>
    </>
  )
}

const TAB_LINE: Record<SettingsTab, string> = {
  models: 'The models your Leads and agents run on.',
  accounts: 'The adapters your workers run on, your Google account and Drive, and where the Leads reach you.',
  usage: 'What your teams spent this month, by team and provider.',
  appearance: 'How Tyslin looks on this computer.',
  notifications: 'What interrupts you, and the defaults new agents start with.',
  about: 'Version, updates and your data.'
}

interface Props {
  initialTab?: SettingsTab
  agencies: AgencyView[]
  activeAgency: string | null
  orgName: string
  onAuthChange?: (s: AuthStatus) => void
  onChanged: () => void
}

/** Settings: vertical sections. Models, Accounts and connectors, Appearance, Notifications, About. */
export function SettingsPage({ initialTab = 'models', agencies, activeAgency, orgName, onAuthChange, onChanged }: Props): JSX.Element {
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const title = TABS.find(([id]) => id === tab)?.[1] ?? ''
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-wrap gap-8 px-10 pt-8 pb-12 text-foreground">
      <div className="flex max-w-[220px] flex-[1_1_200px] flex-col gap-3">
        <h1 className="px-3 text-[22px] font-semibold tracking-tight">Settings</h1>
        <div className="flex flex-col gap-0.5" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
          {TABS.map(([id, label]) => <button key={id} type="button" role="tab" id={'tab-' + id} aria-selected={tab === id} aria-controls="settings-panel" className={cn('flex h-9 items-center rounded-md px-3 text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40', tab === id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')} onClick={() => setTab(id)}>{label}</button>)}
        </div>
      </div>
      <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-5 pt-11" role="tabpanel" id="settings-panel" aria-labelledby={'tab-' + tab}>
        <header className="flex flex-col gap-1"><h2 className="text-xl font-semibold tracking-tight">{title}</h2><p className="max-w-[760px] text-sm text-muted-foreground">{TAB_LINE[tab]}</p></header>
        {tab === 'models' && <ModelsTab onOpenAccounts={() => setTab('accounts')} />}
        {tab === 'accounts' && <AccountsTab agencies={agencies} activeAgency={activeAgency} onAuthChange={onAuthChange} onChanged={onChanged} />}
        {tab === 'usage' && <UsageTab agencies={agencies} />}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'about' && <AboutTab orgName={orgName} agencyCount={agencies.length} />}
      </div>
    </div>
  )
}
