import { useEffect, useState } from 'react'
import type { Agent, AppInfo, Project, Session } from '@shared/types'
import logo from '../assets/logo-horizontal.png'
import mark from '../assets/logo-mark.png'
import wordmarkWhite from '../assets/wordmark-white.png'
import standing from '../assets/mascot-pose-1.png'
import tablets from '../assets/mascot-pose-5.png'
import type { AgencyView } from '../agencies'
import { agencyStatus } from '../agencies'
import { Avatar } from '../components/Avatar'
import { Activity } from '../components/Activity'
import { Icon } from '../components/Icon'
import { AGENCY_TEMPLATES, templateSummary } from '@shared/agencies'
import { HEAD_SRC } from '../heads'
import { money, plural, useBoardStats } from '../boardStats'
import { STATUS_LABEL, useAgentStatuses } from '../agentStatus'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard } from '../components/StatCard'

interface Props {
  you: string
  orgName: string
  agencies: AgencyView[]
  agents: Agent[]
  projects: Project[]
  sessions: Session[]
  focus?: 'activity'
  onOpenAgency: (projectId: string) => void
  onAllAgencies: () => void
  /** With a template id: the wizard opens with that template picked. */
  onNewAgency: (templateId?: string) => void
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
}

const greeting = (): string => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

/** Home: the organization and its agencies, then what the studio is doing. Built with Tailwind + shadcn/ui. */
export function OrgHome({ you, orgName, agencies, agents, projects, sessions, focus, onOpenAgency, onAllAgencies, onNewAgency, onOpenChat }: Props): JSX.Element {
  useEffect(() => { if (focus === 'activity') document.getElementById('activity')?.scrollIntoView({ block: 'start' }) }, [focus])
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => { void window.tyslin.app.info().then(setInfo) }, [])
  const leads = agencies.filter((v) => v.lead).length
  const workers = agencies.reduce((n, v) => n + v.workers.length, 0)
  const statuses = useAgentStatuses()
  /** Ready only when the Lead can run; a Lead that needs setup or whose last run failed says so. */
  const statusOf = (v: AgencyView): { label: string; tone: 'on' | 'off' | 'idle' | 'warn'; reason?: string } => {
    const s = v.lead && !v.paused ? statuses.get(v.lead.id) : undefined
    return s && (s.state === 'setup' || s.state === 'failed') ? { label: STATUS_LABEL[s.state], tone: 'warn', reason: s.reason } : agencyStatus(v)
  }
  const ready = agencies.filter((v) => statusOf(v).tone === 'on').length
  const boards = useBoardStats(agencies.map((v) => v.agency))
  const review = Object.values(boards).reduce((n, b) => n + b.review, 0)
  const working = Object.values(boards).reduce((n, b) => n + b.inProgress, 0)
  const spent = Object.values(boards).reduce((n, b) => n + b.spentWeek, 0)
  // Parts that are zero are left out.
  const status = agencies.length === 0 ? 'No agencies yet.' : [
    plural(agencies.length, 'agency', 'agencies'),
    review > 0 ? `${plural(review, 'card')} waiting for your review` : '',
    spent > 0 ? `${money(spent)} spent this week` : ''
  ].filter(Boolean).join(' · ')
  const org = orgName || 'Your organization'

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-10 pt-8 pb-12 text-foreground">
      {/* Hero: same look as the social banners and the site (logo, headline, green tagline, poses 5 and 1 on a lime circle). */}
      <section aria-labelledby="home-title" className="flex items-center justify-between gap-8">
        <div className="flex max-w-[560px] flex-col gap-4">
          <img src={logo} alt="Tyslin" className="h-10 w-auto self-start dark:hidden" />
          <span className="hidden items-center gap-2.5 self-start dark:flex">
            <img src={mark} alt="Tyslin" className="size-10" />
            <img src={wordmarkWhite} alt="" className="h-4 w-auto" />
          </span>
          <div className="flex gap-2">
            <Badge variant="outline" className="border-green font-mono text-green">v{info?.version ?? '…'}</Badge>
            <Badge variant="secondary" className="font-mono">Beta</Badge>
          </div>
          <h1 id="home-title" className="text-[44px] leading-[1.05] font-semibold tracking-[-0.03em]">Your agencies</h1>
          <p className="-mt-1 text-lg font-semibold text-green">Every agent you run. One studio.</p>
          <p role="status" className="font-mono text-sm text-muted-foreground">{status}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Button size="lg" onClick={() => (agencies.length ? onAllAgencies() : onNewAgency())}>
              <Icon name="agency" size={16} />
              {agencies.length ? `Open your ${agencies.length} ${agencies.length === 1 ? 'agency' : 'agencies'}` : 'Create an agency'}
            </Button>
            {agencies.length > 0 && (
              <Button size="lg" variant="outline" onClick={() => onNewAgency()}><Icon name="plus" size={14} /> New agency</Button>
            )}
          </div>
        </div>
        <div aria-hidden="true" className="relative hidden h-[400px] w-[440px] shrink-0 items-end justify-center min-[981px]:flex">
          <span className="absolute top-0 right-0 size-[400px] rounded-full bg-lime-soft" />
          <img src={tablets} alt="" className="relative -mr-4 h-[320px] w-auto" />
          <img src={standing} alt="" className="relative h-[370px] w-auto" />
        </div>
      </section>

      <section aria-labelledby="org-title" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-xs tracking-[0.08em] text-green uppercase">{orgName || 'Organization'}</span>
            <h2 id="org-title" className="text-[28px] font-semibold tracking-tight">{greeting()}{you !== 'You' ? `, ${you}` : ''}</h2>
            <p className="text-sm text-muted-foreground">
              {agencies.length ? `${org} runs ${plural(agencies.length, 'agency', 'agencies')}. Each has its own Lead, team, board and folder.` : `${org} has no agencies yet.`}
            </p>
          </div>
        </div>

        {agencies.length === 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-semibold">Set up your first agency</h3>
              <p className="text-sm text-muted-foreground">Pick a template to start: you get a Lead and a team with a goal, a plan, a board and a line to you. You can change everything before it's created.</p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
              {AGENCY_TEMPLATES.map((t) => {
                const l = t.roster.find((m) => m.lead)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onNewAgency(t.id)}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left shadow-xs transition-colors hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
                  >
                    <span className="flex items-center gap-2.5">
                      <img src={HEAD_SRC[l?.head ?? 'smile'] ?? HEAD_SRC.smile} alt="" width={30} height={30} />
                      <strong className="text-sm font-semibold">{t.name}</strong>
                    </span>
                    <span className="text-[13px] text-muted-foreground">{t.tagline}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{templateSummary(t)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {agencies.length > 0 && (<>
          <div className="grid grid-cols-2 gap-4 min-[900px]:grid-cols-4">
            <StatCard label="Agencies" value={agencies.length} badge={`${ready} ready`} strong={`${leads} with a Lead`} muted="Each with its own board and folder" />
            <StatCard label="Agents" value={leads + workers} badge={plural(leads, 'Lead')} strong={plural(workers, 'worker')} muted="Across all agencies" />
            <StatCard label="In progress" value={working} strong={working ? 'Cards being worked on' : 'Nothing running'} muted="From the agency boards" />
            <StatCard label="Waiting for review" value={review} attention={review > 0} strong={review ? 'Open the agency to review' : 'Nothing waiting'} muted="Cards in the Review column" />
          </div>

          <div className="mt-2 flex items-center justify-between">
            <h3 className="text-base font-semibold">Your agencies</h3>
            <Button variant="link" size="sm" className="px-0" onClick={onAllAgencies}>See all</Button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {agencies.map((v) => {
              const st = statusOf(v)
              const b = boards[v.agency.id]
              const line = b ? [
                b.inProgress ? `${b.inProgress} in progress` : '',
                b.review ? `${b.review} to review` : '',
                b.inbox ? `${b.inbox} in Inbox` : ''
              ].filter(Boolean).join(' · ') : ''
              return (
                <button
                  key={v.project.id}
                  type="button"
                  onClick={() => onOpenAgency(v.project.id)}
                  className="text-left focus-visible:outline-none [&:focus-visible>div]:ring-[3px] [&:focus-visible>div]:ring-ring/40"
                >
                  <Card className="h-full gap-4 py-5 transition-colors hover:border-border-strong">
                    <CardHeader className="px-5">
                      <div className="flex items-center gap-3">
                        {v.lead
                          ? <Avatar shape={v.lead.shape} tone={v.lead.tone} head={v.lead.head} size={40} />
                          : <span className="flex size-10 items-center justify-center rounded-lg bg-muted"><Icon name="agency" size={16} /></span>}
                        <div className="flex min-w-0 flex-col gap-1">
                          <CardTitle className="truncate text-[15px]">{v.project.name}</CardTitle>
                          <CardDescription className="text-[13px]">{v.lead ? `Lead · ${v.lead.name.replace(/\s*\(Lead\)$/i, '')}` : 'No Lead yet'}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 px-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex -space-x-2">
                          {v.workers.slice(0, 5).map((w) => (
                            <span key={w.id} className="rounded-full bg-card ring-2 ring-card"><Avatar shape={w.shape} tone={w.tone} head={w.head} size={26} /></span>
                          ))}
                          {v.workers.length > 5 && <span className="flex size-[26px] items-center justify-center rounded-full bg-muted font-mono text-[11px] ring-2 ring-card">+{v.workers.length - 5}</span>}
                        </span>
                        <Badge variant={st.tone === 'on' ? 'soft' : st.tone === 'warn' ? 'destructive' : st.tone === 'off' ? 'secondary' : 'outline'} title={st.reason || undefined}>
                          {st.tone === 'on' && <span className="size-1.5 rounded-full bg-green" />}
                          {st.label}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                        <span>{line || 'Board is clear'}</span>
                        <span className="font-mono">{plural(v.workers.length + (v.lead ? 1 : 0), 'agent')}</span>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => onNewAgency()}
              className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong p-5 text-center transition-colors hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-lime text-on-lime"><Icon name="plus" size={14} /></span>
              <strong className="text-sm font-semibold">New agency</strong>
              <span className="max-w-[220px] text-[13px] text-muted-foreground">Start from one of 20 templates or describe your own.</span>
            </button>
          </div>
        </>)}
      </section>

      <Activity agents={agents} projects={projects} sessions={sessions} onOpenChat={onOpenChat} />
    </div>
  )
}
