import type { HeadId } from './heads'
import type { TaskSchedule } from './types'

/**
 * Agencies: the unit the first-run wizard sets up. An agency is a Lead agent with a goal, a plan, skills,
 * a roster of worker agents, a Kanban board and a channel to you. The wizard turns a template into an
 * ordinary project, agents (workers report to the Lead), a board and the Lead's scheduled task.
 * Same idea as teams.ts; agents here have a first name with the job in brackets, e.g. "Sam (Backend)".
 */
export interface AgencyMember {
  first: string
  job: string
  description: string
  instructions: string
  head: HeadId
  skills: string[]
  /** File tools; writes still go through review unless the user turns that off. */
  write: boolean
  lead?: boolean
}

export interface AgencyPlanStep {
  title: string
  /** The member's job who takes the card. */
  owner: string
}

export interface AgencyTemplate {
  id: string
  name: string
  /** What the agency does, one or two sentences (fills the description field). */
  description: string
  /** One sentence. */
  goal: string
  /** Five steps; the Lead turns each into a card in the Inbox. */
  plan: AgencyPlanStep[]
  /** The Lead first. */
  members: AgencyMember[]
  /** Folders the agency works in, created in its project folder. */
  folders: string[]
  /** The Lead's scheduled task. */
  task: { name: string; prompt: string; schedule: TaskSchedule }
  /** Adapters it runs on; every template runs on all four today (they all work in a folder with files). */
  adapters?: AgencyAdapterId[]
}

/** "Sam (Backend)". */
export const agentName = (m: Pick<AgencyMember, 'first' | 'job'>): string => `${m.first} (${m.job})`

/** Skills of every member, without repeats. */
export const agencySkills = (t: AgencyTemplate): string[] => [...new Set(t.members.flatMap((m) => m.skills))]

/** Board columns every agency board starts with. */
export const AGENCY_COLUMNS = ['Inbox', 'Planned', 'In progress', 'Review', 'Done'] as const

/** How the agents run: external agents Tyslin drives over ACP. One is the roster's default. */
export const AGENCY_ADAPTERS = [
  { id: 'claude-code', name: 'Claude Code', by: 'Anthropic', description: 'Anthropic\'s coding agent, through its ACP adapter.' },
  { id: 'hermes', name: 'Hermes', by: 'Nous Research', description: 'Open-source agent from Nous Research.' },
  { id: 'gemini-cli', name: 'Gemini CLI', by: 'Google', description: 'Google\'s open-source agent for the terminal.' },
  { id: 'codex', name: 'Codex', by: 'OpenAI', description: 'OpenAI\'s coding agent, through its ACP adapter.' }
] as const

export type AgencyAdapterId = (typeof AGENCY_ADAPTERS)[number]['id']

/** The adapters a template supports (all four unless the template narrows it). */
export const templateAdapters = (t: AgencyTemplate): AgencyAdapterId[] => t.adapters ?? AGENCY_ADAPTERS.map((a) => a.id)

/** How much the Lead sends you on your channel. */
export type AgencyNotify = 'all' | 'questions' | 'digest'

const LEAD_SKILLS = ['task-delegation', 'spec-breakdown', 'weekly-update']

const leadInstructions = (agency: string, goal: string, team: string[]): string => `You lead the ${agency} agency. Goal: ${goal}

Your team: ${team.join(', ')}.

- Keep the work on the agency's Kanban board. New requests land in Inbox; turn each into cards small enough to finish in one sitting, give each card an owner and move it to Planned.
- Give each card to the teammate whose job fits; say why in the card's notes.
- Check results in Review before anything is called done. Never claim work is done that you haven't checked.
- You are the only one who messages the boss. Keep messages short: what moved, what is blocked, what you need.`

const workerInstructions = (first: string, job: string, agency: string, description: string, lead: string): string => `You are ${first}, the ${job.toLowerCase()} in the ${agency} agency. ${description}

- You work on the cards ${lead} gives you. Stay inside the card's scope.
- Read what is already in the project folder before you add to it, and keep each change small.
- End with what you did, the files you touched and anything ${lead} should check.
- If the card is unclear, ask ${lead} one precise question instead of guessing. You never message the boss directly.`

type MemberRow = [first: string, job: string, head: HeadId, skills: string[], write: boolean, description: string]

/** Builds a template: the Lead plus members, with instructions written from the rows. */
function agency(
  id: string, name: string, description: string, goal: string, folders: string[],
  lead: [first: string, head: HeadId, skills: string[]],
  rows: MemberRow[],
  plan: [title: string, owner: string][]
): AgencyTemplate {
  const leadName = `${lead[0]} (Lead)`
  const members: AgencyMember[] = [
    {
      first: lead[0], job: 'Lead', head: lead[1], lead: true, write: true,
      skills: [...new Set([...LEAD_SKILLS, ...lead[2]])],
      description: `Plans the work, hands out cards and reports to you.`,
      instructions: leadInstructions(name, goal, rows.map(([f, j]) => `${f} (${j})`))
    },
    ...rows.map(([first, job, head, skills, write, desc]) => ({
      first, job, head, skills, write, description: desc,
      instructions: workerInstructions(first, job, name, desc, leadName)
    }))
  ]
  return {
    id, name, description, goal, folders, members,
    plan: plan.map(([title, owner]) => ({ title, owner })),
    task: {
      name: `${name}: plan the Inbox`,
      prompt: `Read the Inbox on the ${name} board. Turn each item into cards with an owner, move them to Planned and send me a three-line summary.`,
      schedule: { repeat: 'weekdays', time: '09:00' }
    }
  }
}

export const AGENCY_TEMPLATES: AgencyTemplate[] = [
  agency('app-development', 'App Development',
    'Plans, builds, tests and ships web and desktop apps from a spec.',
    'Ship a working first version of the app, tested and documented.',
    ['specs', 'docs'],
    ['Alex', 'gears', ['issue-triage']],
    [
      ['Sam', 'Backend', 'engine', ['careful-edits'], true, 'Builds the server, data and APIs.'],
      ['Riya', 'Frontend', 'idea', ['careful-edits'], true, 'Builds the screens and interactions.'],
      ['Martin', 'QA', 'check', ['test-report'], true, 'Tests each change against its card.'],
      ['Noor', 'Code review', 'lenses', ['code-review'], false, 'Reviews every diff before it lands.']
    ],
    [['Write the spec and split it into cards', 'Lead'], ['Set up the project and data model', 'Backend'], ['Build the main screens', 'Frontend'], ['Test the first build end to end', 'QA'], ['Review the code and list fixes', 'Code review']]),
  agency('mobile-apps', 'Mobile Apps',
    'Designs and builds iOS and Android apps, then gets them ready for the stores.',
    'Get a tested build of the app ready for TestFlight and Play testing.',
    ['specs', 'store'],
    ['Maya', 'gears', ['issue-triage']],
    [
      ['Leo', 'Mobile dev', 'engine', ['careful-edits'], true, 'Builds the app screens and logic.'],
      ['Ines', 'UX', 'idea', ['agent-design'], true, 'Designs flows and screens.'],
      ['Omar', 'QA', 'check', ['test-report'], true, 'Tests on each platform.'],
      ['Kit', 'Store listing', 'calm', ['edit-for-clarity'], true, 'Writes store text and release notes.']
    ],
    [['Agree the core flows', 'Lead'], ['Sketch the main screens', 'UX'], ['Build the first flow', 'Mobile dev'], ['Test it on iOS and Android', 'QA'], ['Draft the store listing', 'Store listing']]),
  agency('web-design', 'Web Design',
    'Designs and builds marketing sites and landing pages.',
    'Launch a fast, clear website that explains the offer.',
    ['site', 'copy'],
    ['Jade', 'idea', ['one-pager']],
    [
      ['Theo', 'Designer', 'focus', ['agent-design'], true, 'Lays out pages and visual style.'],
      ['Ana', 'Web developer', 'engine', ['careful-edits'], true, 'Builds the pages.'],
      ['Ravi', 'Copywriter', 'calm', ['human-voice', 'edit-for-clarity'], true, 'Writes the page copy.'],
      ['Lena', 'QA', 'check', ['test-report'], false, 'Checks pages on phones and desktops.']
    ],
    [['Write the site brief and page list', 'Lead'], ['Draft the home page copy', 'Copywriter'], ['Design the home page', 'Designer'], ['Build the home page', 'Web developer'], ['Check it on phone and desktop', 'QA']]),
  agency('social-media', 'Social Media Marketing',
    'Plans, writes and schedules posts across your social channels.',
    'Post consistently every week with a plan you approve.',
    ['social', 'calendar'],
    ['Mia', 'pulse', ['daily-plan']],
    [
      ['Zane', 'Strategist', 'target', ['competitor-brief'], false, 'Picks themes and channels.'],
      ['Ella', 'Writer', 'calm', ['human-voice'], true, 'Writes the posts.'],
      ['Nico', 'Designer', 'idea', ['agent-design'], true, 'Briefs visuals for each post.'],
      ['Hana', 'Analyst', 'chart', ['metrics-report'], false, 'Reports what worked.']
    ],
    [['Set this month\'s themes', 'Lead'], ['Review three competitors\' channels', 'Strategist'], ['Write the first week of posts', 'Writer'], ['Brief the visuals', 'Designer'], ['Set up the weekly report', 'Analyst']]),
  agency('content-writing', 'Content Writing',
    'Researches, writes and edits articles, guides and newsletters.',
    'Publish well-researched articles on a steady schedule.',
    ['drafts', 'published'],
    ['Clara', 'calm', ['decision-memo']],
    [
      ['Ben', 'Researcher', 'globe', ['deep-research', 'cite-sources'], false, 'Finds sources and facts.'],
      ['Ivy', 'Writer', 'smile', ['human-voice'], true, 'Writes the drafts.'],
      ['Hugo', 'Editor', 'focus', ['edit-for-clarity', 'plain-language'], true, 'Edits for clarity and voice.']
    ],
    [['Pick the first five topics', 'Lead'], ['Research topic one', 'Researcher'], ['Write the first draft', 'Writer'], ['Edit the draft', 'Editor'], ['Plan the publishing calendar', 'Lead']]),
  agency('seo', 'SEO',
    'Finds what people search for, plans pages and improves rankings.',
    'Grow organic traffic with pages that answer real searches.',
    ['seo', 'pages'],
    ['Owen', 'target', ['seo-outline']],
    [
      ['Lina', 'Keyword research', 'scan', ['deep-research'], false, 'Finds and groups keywords.'],
      ['Cole', 'Content', 'calm', ['seo-outline', 'human-voice'], true, 'Writes and updates pages.'],
      ['Priya', 'Technical SEO', 'gears', ['careful-edits'], true, 'Fixes site issues.']
    ],
    [['Audit the current site', 'Technical SEO'], ['Build the keyword list', 'Keyword research'], ['Pick the first ten pages', 'Lead'], ['Outline and write page one', 'Content'], ['Fix the top technical issues', 'Technical SEO']]),
  agency('paid-ads', 'Paid Ads',
    'Plans, writes and reports on ad campaigns.',
    'Run ad campaigns that hit a cost per lead of [PLACEHOLDER].',
    ['ads', 'reports'],
    ['Ray', 'target', ['compare-options']],
    [
      ['Elif', 'Media planner', 'chart', ['compare-options'], false, 'Splits budget across channels.'],
      ['Dan', 'Ad copy', 'smile', ['human-voice'], true, 'Writes ads and variants.'],
      ['Sofia', 'Analyst', 'pulse', ['metrics-report', 'data-analysis'], false, 'Tracks results and suggests changes.']
    ],
    [['Define the audience and offer', 'Lead'], ['Draft the channel plan', 'Media planner'], ['Write ten ad variants', 'Ad copy'], ['Set up the results sheet', 'Analyst'], ['Review the first week', 'Lead']]),
  agency('email-marketing', 'Email Marketing',
    'Writes and plans newsletters and email sequences.',
    'Send a regular newsletter and a welcome sequence that people open.',
    ['emails'],
    ['Nina', 'pulse', ['weekly-update']],
    [
      ['Jon', 'Copywriter', 'smile', ['human-voice', 'follow-up-email'], true, 'Writes the emails.'],
      ['Aya', 'Segments', 'scan', ['data-cleanup'], false, 'Cleans and splits the list.'],
      ['Felix', 'Analyst', 'chart', ['metrics-report'], false, 'Reports opens and clicks.']
    ],
    [['Plan the welcome sequence', 'Lead'], ['Write email one', 'Copywriter'], ['Clean the list', 'Segments'], ['Write the first newsletter', 'Copywriter'], ['Set up the monthly report', 'Analyst']]),
  agency('sales-lead-gen', 'Sales & Lead Gen',
    'Finds leads, qualifies them and writes outreach.',
    'Fill the pipeline with qualified leads every week.',
    ['leads', 'outreach'],
    ['Victor', 'target', ['lead-qualify']],
    [
      ['Tara', 'Researcher', 'globe', ['company-research', 'lead-list'], false, 'Builds lead lists.'],
      ['Max', 'Outreach', 'smile', ['outreach-email', 'follow-up-email'], true, 'Writes first emails and follow-ups.'],
      ['June', 'Qualifier', 'check', ['lead-qualify', 'objection-reply'], false, 'Scores leads and drafts replies.']
    ],
    [['Write the ideal customer profile', 'Lead'], ['Build the first 50 leads', 'Researcher'], ['Score the leads', 'Qualifier'], ['Write the first outreach email', 'Outreach'], ['Plan the follow-ups', 'Outreach']]),
  agency('customer-support', 'Customer Support',
    'Answers customers, writes help articles and spots patterns.',
    'Answer every customer quickly and turn repeat questions into help articles.',
    ['support', 'help'],
    ['Grace', 'smile', ['inbox-triage']],
    [
      ['Eli', 'Agent', 'calm', ['inbox-triage', 'plain-language'], true, 'Drafts replies to customers.'],
      ['Rosa', 'Help writer', 'focus', ['edit-for-clarity'], true, 'Writes help articles.'],
      ['Ken', 'Insights', 'chart', ['feedback-themes'], false, 'Finds themes in tickets.']
    ],
    [['Set reply tone and rules', 'Lead'], ['Draft replies to open tickets', 'Agent'], ['List the top ten questions', 'Insights'], ['Write three help articles', 'Help writer'], ['Send the weekly support summary', 'Lead']]),
  agency('research', 'Research & Intelligence',
    'Researches markets, companies and competitors and writes briefs.',
    'Answer the questions that matter with sourced briefs.',
    ['research', 'briefs'],
    ['Iris', 'brain', ['decision-memo']],
    [
      ['Paul', 'Market research', 'globe', ['deep-research', 'cite-sources'], false, 'Sizes markets and trends.'],
      ['Mei', 'Competitors', 'lenses', ['competitor-brief'], true, 'Tracks competitors.'],
      ['Arjun', 'Analyst', 'chart', ['data-analysis'], false, 'Works the numbers.']
    ],
    [['Write the research questions', 'Lead'], ['Size the market', 'Market research'], ['Brief the top five competitors', 'Competitors'], ['Pull the numbers together', 'Analyst'], ['Write the summary memo', 'Lead']]),
  agency('data-analytics', 'Data & Analytics',
    'Cleans data, builds reports and explains what the numbers say.',
    'Give a clear weekly report on the numbers that matter.',
    ['data', 'reports'],
    ['Nadia', 'chart', ['metrics-report']],
    [
      ['Tom', 'Data engineer', 'gears', ['data-cleanup'], true, 'Cleans and joins data.'],
      ['Lucia', 'Analyst', 'pulse', ['data-analysis'], true, 'Finds patterns and answers questions.'],
      ['Sami', 'Reporting', 'focus', ['metrics-report', 'plain-language'], true, 'Writes the reports.']
    ],
    [['Agree the key metrics', 'Lead'], ['Collect and clean the data', 'Data engineer'], ['Answer the first three questions', 'Analyst'], ['Draft the weekly report', 'Reporting'], ['Review the report', 'Lead']]),
  agency('product-management', 'Product Management',
    'Turns feedback and goals into specs and a roadmap.',
    'Keep a clear roadmap and ready-to-build specs.',
    ['product', 'specs'],
    ['Erin', 'target', ['decision-memo']],
    [
      ['Kai', 'Research', 'question', ['feedback-themes'], false, 'Sorts user feedback.'],
      ['Lara', 'Spec writer', 'focus', ['spec-breakdown'], true, 'Writes specs.'],
      ['Ade', 'Roadmap', 'chart', ['compare-options'], true, 'Keeps the roadmap.']
    ],
    [['Write the product goals', 'Lead'], ['Group this month\'s feedback', 'Research'], ['Rank the top ideas', 'Roadmap'], ['Spec the first feature', 'Spec writer'], ['Share the roadmap', 'Lead']]),
  agency('qa-testing', 'QA & Testing',
    'Writes test plans, runs tests and reports bugs.',
    'Catch bugs before your users do.',
    ['tests', 'bugs'],
    ['Hannah', 'check', ['test-report']],
    [
      ['Rob', 'Test writer', 'scan', ['test-report'], true, 'Writes test cases and automated tests.'],
      ['Yuki', 'Manual tester', 'lenses', ['test-report'], true, 'Tests by hand and files bugs.'],
      ['Femi', 'Bug triage', 'attention', ['issue-triage'], false, 'Sorts and ranks bugs.']
    ],
    [['Write the test plan', 'Lead'], ['Write tests for the main flow', 'Test writer'], ['Test the main flow by hand', 'Manual tester'], ['Rank the open bugs', 'Bug triage'], ['Send the quality report', 'Lead']]),
  agency('devops', 'DevOps',
    'Sets up builds, deploys and monitoring.',
    'Ship every change through a reliable, automated pipeline.',
    ['infra', 'runbooks'],
    ['Viktor', 'gears', ['issue-triage']],
    [
      ['Lou', 'CI/CD', 'engine', ['careful-edits'], true, 'Builds the pipelines.'],
      ['Mara', 'Infrastructure', 'armor', ['careful-edits'], true, 'Writes infrastructure as code.'],
      ['Ian', 'Monitoring', 'pulse', ['metrics-report'], true, 'Sets up alerts and runbooks.']
    ],
    [['List environments and risks', 'Lead'], ['Set up the build pipeline', 'CI/CD'], ['Write the infrastructure code', 'Infrastructure'], ['Add alerts and a runbook', 'Monitoring'], ['Review the deploy process', 'Lead']]),
  agency('startup-visa', 'Startup Visa',
    'Prepares a startup visa application: eligibility, business plan and documents.',
    'Submit a complete startup visa application.',
    ['application', 'documents'],
    ['Samir', 'armor', ['eligibility-check']],
    [
      ['Elena', 'Eligibility', 'question', ['eligibility-check'], false, 'Checks the rules for each country.'],
      ['Ravi', 'Business plan', 'idea', ['one-pager', 'decision-memo'], true, 'Writes the business plan.'],
      ['Chloe', 'Documents', 'check', ['document-checklist'], true, 'Keeps the document checklist.']
    ],
    [['Pick the target country', 'Lead'], ['Check eligibility', 'Eligibility'], ['Draft the business plan', 'Business plan'], ['Build the document checklist', 'Documents'], ['Review the full application', 'Lead']]),
  agency('finance', 'Finance & Bookkeeping',
    'Keeps the books, reconciles accounts and prepares monthly reports.',
    'Close the books every month with a clear report.',
    ['finance', 'reports'],
    ['Leah', 'chart', ['metrics-report']],
    [
      ['Mark', 'Bookkeeper', 'check', ['data-cleanup'], true, 'Records and categorises transactions.'],
      ['Rana', 'Reconciliation', 'scan', ['data-analysis'], true, 'Matches accounts to statements.'],
      ['Joel', 'Reporting', 'focus', ['metrics-report', 'plain-language'], true, 'Writes the monthly report.']
    ],
    [['List accounts and the close checklist', 'Lead'], ['Categorise last month\'s transactions', 'Bookkeeper'], ['Reconcile the bank accounts', 'Reconciliation'], ['Draft the monthly report', 'Reporting'], ['Review and send the report', 'Lead']]),
  agency('legal', 'Legal & Contracts',
    'Drafts and reviews contracts and keeps a clause library. Not legal advice; a lawyer signs off.',
    'Turn around contract drafts and reviews quickly, ready for a lawyer to sign off.',
    ['contracts', 'clauses'],
    ['Diana', 'armor', ['decision-memo']],
    [
      ['Ahmed', 'Drafting', 'calm', ['plain-language'], true, 'Drafts contracts from templates.'],
      ['Sara', 'Review', 'lenses', ['document-checklist'], false, 'Flags risky clauses.'],
      ['Ivo', 'Clause library', 'focus', ['edit-for-clarity'], true, 'Keeps standard clauses.']
    ],
    [['List the contracts you use', 'Lead'], ['Build the clause library', 'Clause library'], ['Draft the first contract', 'Drafting'], ['Review it for risks', 'Review'], ['Prepare notes for your lawyer', 'Lead']]),
  agency('hr-recruiting', 'HR & Recruiting',
    'Writes job posts, screens candidates and plans onboarding.',
    'Hire the right people and onboard them well.',
    ['hiring', 'onboarding'],
    ['Olivia', 'profile', ['meeting-prep']],
    [
      ['Jake', 'Job posts', 'smile', ['human-voice'], true, 'Writes job posts.'],
      ['Amara', 'Screening', 'check', ['lead-qualify'], false, 'Screens candidates against the role.'],
      ['Tim', 'Onboarding', 'calm', ['document-checklist'], true, 'Builds onboarding plans.']
    ],
    [['Define the role', 'Lead'], ['Write the job post', 'Job posts'], ['Set screening criteria', 'Screening'], ['Draft interview questions', 'Lead'], ['Write the onboarding plan', 'Onboarding']]),
  agency('video-creative', 'Video & Creative',
    'Plans, scripts and storyboards videos and creative assets.',
    'Produce scripts and storyboards ready to shoot or edit.',
    ['scripts', 'storyboards'],
    ['Luca', 'idea', ['slide-outline']],
    [
      ['Zoe', 'Scriptwriter', 'smile', ['human-voice'], true, 'Writes scripts.'],
      ['Finn', 'Storyboard', 'focus', ['agent-design'], true, 'Plans shots and scenes.'],
      ['Mina', 'Editor notes', 'scan', ['edit-for-clarity'], true, 'Writes edit notes and captions.']
    ],
    [['Write the creative brief', 'Lead'], ['Write the first script', 'Scriptwriter'], ['Storyboard the script', 'Storyboard'], ['Write captions and edit notes', 'Editor notes'], ['Review the package', 'Lead']])
]
