import { pageInstructions, type AgencyPageSpec } from './pages'
import type { HeadId } from './heads'
import type { TaskSchedule } from './types'
import { researchPlanning } from './agencies/research-planning'
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
import { design } from './agencies/design'

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
  /** 'direct': the worker's file writes skip the review (the Design team's designer, so the board updates live). Default: ask. */
  writeMode?: 'direct'
}

/** How screens group the templates (wizard, Home, the site). */
export type AgencyGroup = 'planning' | 'software' | 'design' | 'documents' | 'marketing'

export const AGENCY_GROUPS: { id: AgencyGroup; title: string; hint: string }[] = [
  { id: 'planning', title: 'Research and planning', hint: 'Before you build' },
  { id: 'software', title: 'Software', hint: 'Code in a repo' },
  { id: 'design', title: 'Design', hint: 'Artboards for web, apps, posts and print' },
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
  /**
   * Openly licensed skills from a skill pack (skillPacks.ts id), never bundled in the app: the pack is
   * installed from GitHub when the team is created (if it isn't already) and the skill attached to the
   * members named in `for` (first names; all members when left out). Until the download lands the skill
   * is simply missing at run time, so creation never waits for GitHub.
   */
  packSkills?: { pack: string; skill: string; for?: string[] }[]
  /** Cards the board starts with, in Inbox. */
  starterCards: string[]
  leadTask: { schedule: TaskSchedule; prompt: string }
  /** Folders created in the project folder. */
  folders: string[]
  /** Extra tabs on the Agency screen (shared/pages.ts). Table and calendar pages read data/<id>.json in the folder. */
  pages?: AgencyPageSpec[]
  /**
   * What the Lead asks the boss before planning a new brief (owner, 14 Nov 2026), e.g. the site's address and
   * GitHub access for SEO. Added to the Lead's system prompt at run time (runtime.ts), so older agencies get it too.
   */
  intake?: string[]
  /**
   * Starts work at once (Design, owner 17 Nov 2026: "whenever I give a prompt it should open the artboard and start
   * drawing"): cards run on their own without plan approval, the Lead asks only when it can't tell what to make
   * (`quickInstructions` instead of the intake list), and a finished card goes straight to Done with no Lead review
   * round, because the boss checks and tweaks the result on the board.
   */
  quick?: boolean
}

/** The template of an agency, when it still exists. */
export const templateOf = (templateId: string | null | undefined): AgencyTemplate | undefined => AGENCY_TEMPLATES.find((t) => t.id === templateId)

/** Whether an agency's template starts work at once (see `AgencyTemplate.quick`). */
export const isQuick = (templateId: string | null | undefined): boolean => !!templateOf(templateId)?.quick

/**
 * Who takes the boss's messages in a quick team (owner, 18 Nov 2026: "waiting for the team to start and finish"):
 * the first member who isn't the Lead and isn't paused. The Lead doesn't plan these; the message becomes this
 * member's card at once (cards.ts handToWorker).
 */
export function quickWorkerOf<A extends { id: string; agency?: string | null; kind?: string; isMascot?: boolean; paused?: boolean; createdAt?: number }>(agency: { id: string; leadId: string | null; templateId: string }, agents: A[]): A | null {
  if (!isQuick(agency.templateId)) return null
  return agents.filter((a) => a.agency === agency.id && a.id !== agency.leadId && (a.kind ?? 'agent') === 'agent' && !a.isMascot && !a.paused)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0] ?? null
}

/** The Lead's "start right away" paragraph for a quick template. */
export function quickInstructions(t: Pick<AgencyTemplate, 'name' | 'intake'>): string {
  return `## Start right away
The boss wants to see work start the moment they ask. For a new request:
- Don't send a list of questions. Ask one short question only when you can't tell at all what to make; for anything else pick a sensible default and say it in one line.
- In the same turn, add the card(s) to Planned with an assignee and full notes (what to make, sizes, the exact copy, the style), then reply in two or three lines. The cards start on their own as soon as you finish: there is no plan to approve.
- One card per small set of work, so the first result shows quickly.
- Cards still in Planned from an earlier request would run before the new one: move them to Inbox with board_move_card, unless the boss asked for them now.
- Use what the boss attached or already told you (memory, agency-log.md). Never ask for passwords, API keys or tokens.
Things a ${t.name} brief may need, to fill from defaults rather than ask: ${(t.intake ?? []).map((q) => q.replace(/\?.*$/, '')).join('; ')}.`
}

/** The Lead's "ask before you plan" paragraph for a template's intake questions ('' when it has none). */
export function intakeInstructions(t: Pick<AgencyTemplate, 'name' | 'intake' | 'quick'> | undefined): string {
  if (t?.quick) return quickInstructions(t)
  if (!t?.intake?.length) return ''
  return `## Before you plan: questions for the boss
When a new brief comes in, first check what you already know: the brief and anything attached to it, the memory notes, agency-log.md and the files in the team folder. Then ask the boss only what is still missing from the list below, all at once, as one short numbered list in your reply in the task. On a scheduled run, with no one in the chat, send it as one message_boss with kind "question" instead.
- Say why a question matters when it isn't obvious, and offer an easy default where there is one ("If there's no logo yet, we'll set the name in a clean typeface").
- Tell the boss they can attach files and images in the chat (logos, sketches, screenshots, exports).
- Don't add cards to Planned until the boss answers, unless the boss says to start anyway; then write your assumptions into the card notes and say them in your reply.
- Put the answers each card needs into its notes, and record them with agency_log so the team keeps them. Never ask again what the boss already told you.
- Never ask for passwords, API keys or tokens in the chat. Access to GitHub and other services goes through a connector: put it in the card's needs.
- For a small follow-up in a task that is already under way, skip the list and ask only what that request needs.

Questions for a ${t.name} brief:
${t.intake.map((q) => `- ${q}`).join('\n')}`
}

/**
 * The templates in screen order (Research & Planning first since 12 Nov 2026, in its own group). Workers run on Claude Code, Codex or Gemini CLI only. Seven more templates
 * (Customer Support, Research & Intelligence, Startup Visa, Finance & Bookkeeping, Legal & Contracts,
 * HR & Recruiting, Video & Creative) are in archive/shared/agencies/; agencies made from them still open and run.
 */
export const AGENCY_TEMPLATES: AgencyTemplate[] = [
  researchPlanning,
  appDevelopment, mobileApps, webDesign, qaTesting, devops,
  design,
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

export const LEAD_RULES = `You are the Lead of this team. The boss is the person using Tyslin Studio.
- Work from the board. A brief arrives in Inbox; you break it into cards in Planned, one card per worker task, each with an assignee, what "done" looks like and an estimate.
- Assign cards to the workers on your roster. Match the job to the worker; never do a worker's job yourself unless the roster has no one for it.
- Review every card that reaches Review before it goes to Done. Send it back to Planned with a note if it misses the brief.
- Only you talk to the boss. Workers report to you. Send the boss one of four messages: brief received, a question with two or three options, a review request, or a digest. Never send more than one message per card unless the boss replies.
- Stop and ask when a card would exceed the budget, needs a credential, would send anything outside the team folder, or when the brief is unclear in a way that changes the plan.
- Keep a short running log in the team folder (agency-log.md): date, card, decision, cost.
- Be plain and short. Say what was done, what is next, what you need.`

export const WORKER_RULES = `You are a worker in a team inside Tyslin Studio. You report to the Lead, never to the boss directly.
- Take one card at a time. Read the card, the brief it came from and the files it names before starting.
- Work only inside the team folder. Create and change files with your own file-editing tools (named in the Folder section below), never through the shell (no echo/cat/tee redirection, no python or node scripts that write files, no touch): shell writes skip Tyslin's review and the Changes panel. The shell is for reading, running tests and builds.
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
    `Your team: ${t.name}. Goal: ${t.goal}\nThe rest of the roster: ${roster}.`,
    agencyPrompt.trim() ? `Team prompt (the boss's standing instructions for everyone here):\n${agencyPrompt.trim()}` : '',
    // Appended after the template's own text, which stays as written (10 Nov 2026).
    pageInstructions(t.pages ?? [])
  ]
  return parts.filter(Boolean).join('\n\n')
}

/** Short lines for a template card: "5 agents · Alex leads". */
export const templateSummary = (t: AgencyTemplate): string => `${t.roster.length} agents · ${t.roster.find((m) => m.lead)?.first ?? '?'} leads`

/** One wording for the agency's notify setting, wherever it is shown (QA, 10 Nov 2026: Goals and Channel differed). */
export const NOTIFY_LABEL: Record<'all' | 'questions' | 'digest', string> = { all: 'Everything', questions: 'Questions and reviews', digest: 'Digests only' }
