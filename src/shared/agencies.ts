import { pageInstructions, type AgencyPageSpec } from './pages'
import type { HeadId } from './heads'
import type { TaskSchedule } from './types'
import { appDevelopment } from './agencies/app-development'
import { mobileApps } from './agencies/mobile-apps'
import { webDesign } from './agencies/web-design'
import { socialMediaMarketing } from './agencies/social-media-marketing'
import { contentWriting } from './agencies/content-writing'
import { seo } from './agencies/seo'
import { paidAds } from './agencies/paid-ads'
import { emailMarketing } from './agencies/email-marketing'
import { salesLeadGen } from './agencies/sales-lead-gen'
import { dataAnalytics } from './agencies/data-analytics'
import { productManagement } from './agencies/product-management'
import { qaTesting } from './agencies/qa-testing'
import { devops } from './agencies/devops'

/**
 * Agencies: the unit Tyslin is organised around. An agency is a Lead agent with a goal, a plan, skills, a
 * roster of workers, a Kanban board and a channel to the boss (the person using the app). The templates
 * (one file per agency under agencies/) become ordinary agents in one project folder, a board file and
 * the Lead's scheduled task. Agents are named "First (Job)", e.g. "Sam (Backend)".
 */

/** How a worker runs: an external agent over ACP. The Lead always runs on the built-in runtime (default model). */
export const AGENCY_ADAPTERS = [
  { id: 'claude-code', name: 'Claude Code', by: 'Anthropic', description: 'Anthropic\'s coding agent, through its ACP adapter.' },
  { id: 'codex', name: 'Codex', by: 'OpenAI', description: 'OpenAI\'s coding agent, through its ACP adapter.' },
  { id: 'gemini-cli', name: 'Gemini CLI', by: 'Google', description: 'Google\'s open-source agent for the terminal.' }
] as const

export type AgencyAdapterId = (typeof AGENCY_ADAPTERS)[number]['id']
export type AgencyEngine = AgencyAdapterId | 'builtin'

export interface AgencyMember {
  first: string
  job: string
  /** The agent's own instructions, as written in the template; the shared rules are added by `memberInstructions`. */
  instructions: string
  head: HeadId
  /** 'builtin' for every Lead. */
  engine: AgencyEngine
  lead?: boolean
}

/** How screens group the templates (wizard, Home, the site). */
export type AgencyGroup = 'software' | 'documents' | 'marketing'

export const AGENCY_GROUPS: { id: AgencyGroup; title: string; hint: string }[] = [
  { id: 'software', title: 'Software', hint: 'Code in a repo' },
  { id: 'documents', title: 'Documents and data', hint: 'Specs, reports and writing' },
  { id: 'marketing', title: 'Marketing and sales', hint: 'Campaigns, outreach and growth' }
]

export interface AgencyTemplate {
  id: string
  name: string
  tagline: string
  group: AgencyGroup
  /** Shown as a card but can't be created yet. */
  comingSoon?: boolean
  goal: string
  /** Five steps; each starts with the first name of the member who does it. */
  plan: string[]
  /** The Lead first. */
  roster: AgencyMember[]
  /** Skill names every member gets (built-ins; see seedSkills.ts and seedSkillsAgencies.ts). */
  skills: string[]
  /** Cards the board starts with, in Inbox. */
  starterCards: string[]
  leadTask: { schedule: TaskSchedule; prompt: string }
  /** Folders created in the project folder. */
  folders: string[]
  /** Extra tabs on the Agency screen (shared/pages.ts). Table and calendar pages read data/<id>.json in the folder. */
  pages?: AgencyPageSpec[]
}

/**
 * The templates in screen order. Workers run on Claude Code, Codex or Gemini CLI only. Seven more templates
 * (Customer Support, Research & Intelligence, Startup Visa, Finance & Bookkeeping, Legal & Contracts,
 * HR & Recruiting, Video & Creative) are in archive/shared/agencies/; agencies made from them still open and run.
 */
export const AGENCY_TEMPLATES: AgencyTemplate[] = [
  appDevelopment, mobileApps, webDesign, qaTesting, devops,
  productManagement, dataAnalytics, contentWriting,
  socialMediaMarketing, seo, paidAds, emailMarketing, salesLeadGen
]

/** Templates that can be created today. */
export const AVAILABLE_TEMPLATES = AGENCY_TEMPLATES.filter((t) => !t.comingSoon)

/** The templates of one group, in order. */
export const templatesIn = (g: AgencyGroup): AgencyTemplate[] => AGENCY_TEMPLATES.filter((t) => t.group === g)

/** "Sam (Backend)". */
export const agentName = (m: Pick<AgencyMember, 'first' | 'job'>): string => `${m.first} (${m.job})`

/** The adapters a template's workers run on, in roster order, without repeats. */
export const templateAdapters = (t: AgencyTemplate): AgencyAdapterId[] =>
  [...new Set(t.roster.filter((m) => m.engine !== 'builtin').map((m) => m.engine as AgencyAdapterId))]

/** Which member a plan step belongs to: the member whose first name the step starts with. */
export const planOwner = (t: AgencyTemplate, step: string): AgencyMember | undefined =>
  t.roster.find((m) => step.startsWith(m.first + ' '))

/** The card log line that marks a brief the boss typed in the Inbox (cards.ts briefLead; the chat reads it back). */
export const BRIEF_LOG = 'Brief from you, in the Inbox'

/** Board columns every agency board starts with. */
export const AGENCY_COLUMNS = ['Inbox', 'Planned', 'In progress', 'Review', 'Done'] as const

/** How much the Lead sends the boss on the channel. */
export type AgencyNotify = 'all' | 'questions' | 'digest'

export const LEAD_RULES = `You are the Lead of this agency. The boss is the person using Tyslin Studio.
- Work from the board. A brief arrives in Inbox; you break it into cards in Planned, one card per worker task, each with an assignee, what "done" looks like and an estimate.
- Assign cards to the workers on your roster. Match the job to the worker; never do a worker's job yourself unless the roster has no one for it.
- Review every card that reaches Review before it goes to Done. Send it back to Planned with a note if it misses the brief.
- Only you talk to the boss. Workers report to you. Send the boss one of four messages: brief received, a question with two or three options, a review request, or a digest. Never send more than one message per card unless the boss replies.
- Stop and ask when a card would exceed the budget, needs a credential, would send anything outside the project folder, or when the brief is unclear in a way that changes the plan.
- Keep a short running log in the project folder (agency-log.md): date, card, decision, cost.
- Be plain and short. Say what was done, what is next, what you need.`

export const WORKER_RULES = `You are a worker in an agency inside Tyslin Studio. You report to the Lead, never to the boss directly.
- Take one card at a time. Read the card, the brief it came from and the files it names before starting.
- Work only inside the project folder. Create and change files with your file tools (write_file, edit_file), never through the shell (no echo/cat/tee redirection, no python or node scripts that write files, no touch): shell writes skip Tyslin's review and the Changes panel. The shell is for reading, running tests and builds.
- Never read-and-rewrite or move anything in boards/ (the board files): Tyslin moves your card when your run ends, and only the Lead edits the board.
- When done, put a short result on the card: what you changed, where it is, what you could not do and why.
- If the card is unclear or you need something you do not have, write the question on the card and stop. Do not guess.
- Keep output in the format the card asks for. No preamble, no summary of what you are about to do.`

/**
 * The instructions an agent is created with: the member's own text, the shared rules, the roster and the
 * agency prompt (what every agent in this agency follows).
 */
/** The pages a template shows (none for templates without any, or an agency whose template is gone). */
export const templatePages = (templateId: string | null | undefined): AgencyPageSpec[] => AGENCY_TEMPLATES.find((t) => t.id === templateId)?.pages ?? []

export function memberInstructions(t: AgencyTemplate, m: AgencyMember, agencyPrompt: string): string {
  const roster = t.roster.filter((x) => x !== m).map((x) => `${agentName(x)}${x.lead ? ', your Lead' : ''}`).join(', ')
  const parts = [
    m.instructions.trim(),
    m.lead ? LEAD_RULES : WORKER_RULES,
    `Your agency: ${t.name}. Goal: ${t.goal}\nThe rest of the roster: ${roster}.`,
    agencyPrompt.trim() ? `Agency prompt (the boss's standing instructions for everyone here):\n${agencyPrompt.trim()}` : '',
    // Appended after the template's own text, which stays as written (10 Nov 2026).
    pageInstructions(t.pages ?? [])
  ]
  return parts.filter(Boolean).join('\n\n')
}

/** Short lines for a template card: "5 agents · Alex leads". */
export const templateSummary = (t: AgencyTemplate): string => `${t.roster.length} agents · ${t.roster.find((m) => m.lead)?.first ?? '?'} leads`
