import type { AgencyTemplate } from '../agencies'

export const productManagement: AgencyTemplate = {
  id: 'product-management',
  name: 'Product Management',
  tagline: 'Turns feedback and goals into specs and a roadmap.',
  group: 'documents',
  comingSoon: true,
  goal: 'A prioritised roadmap, specs ready for App Development, and release notes per version.',
  plan: [
    'Kai summarises feedback, tickets and interviews into themes.',
    'Erin scores ideas by impact and effort.',
    'Elsie keeps the roadmap doc current.',
    'Adam writes specs that App Development can take as cards.',
    'Elsie writes release notes from merged work.'
  ],
  roster: [
    {
      first: 'Erin', job: 'Lead', head: 'target', engine: 'builtin', lead: true,
      instructions: `You lead a product agency. Decisions come from evidence and a scoring sheet, not the loudest voice. Assign synthesis to Kai, specs to Adam, roadmap and notes to Elsie. Review specs for a clear problem statement, measurable success and explicit non-goals. Keep the roadmap to three horizons: now, next, later. Say no in writing with the reason.`
    },
    {
      first: 'Adam', job: 'Specs', head: 'focus', engine: 'claude-code',
      instructions: `You write specs: problem, who has it, evidence, proposed solution, user flow, acceptance criteria, non-goals, open questions, success metric. Short enough to read in ten minutes. Each acceptance criterion testable. Link to the feedback it came from.`
    },
    {
      first: 'Kai', job: 'User research', head: 'question', engine: 'gemini-cli',
      instructions: `You synthesise feedback from tickets, interviews, reviews and surveys the boss provides: themes with counts, representative quotes, who said it (segment), severity. No interpretation beyond the data. Output themes.md updated weekly.`
    },
    {
      first: 'Elsie', job: 'Roadmap & release notes', head: 'chart', engine: 'claude-code',
      instructions: `You maintain roadmap.md (now / next / later, each item with its score and status) and write release notes per version from merged cards: user-facing language, what changed and why it matters, grouped by area. No internal ticket numbers in notes.`
    }
  ],
  skills: ['feedback-themes', 'prioritisation', 'roadmap', 'spec-writing', 'changelog'],
  starterCards: ['Feedback inventory', 'Scoring sheet', 'Roadmap v1', 'First spec'],
  leadTask: { schedule: { repeat: 'weekly', day: 1, time: '09:00' }, prompt: 'Review new feedback themes, rescore, update the roadmap, send a digest.' },
  intake: [
    "Which product, and where can we see it (link, repository, screenshots)?",
    "Where does feedback come from: support emails, reviews, interviews, issues? Attach exports if you have them.",
    "What is the main business goal for the next three months?",
    "Is there a roadmap or specs already? Attach or link them.",
    "Who builds from our specs: an App Development agency here, or another team?"
  ],
  folders: ['feedback', 'specs']
  // TODO(agency pages): no page types yet; add `pages` when this template leaves coming soon.
}
