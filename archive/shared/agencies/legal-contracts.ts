import type { AgencyTemplate } from '../agencies'

export const legalContracts: AgencyTemplate = {
  id: 'legal-contracts',
  name: 'Legal & Contracts',
  tagline: 'Drafts and reviews contracts and keeps a checklist of risks.',
  goal: 'Contracts drafted from templates, reviewed against a checklist, and tracked to signature.',
  plan: [
    'Catherine picks the template and the key terms.',
    'Robert drafts.',
    'Helen reviews clause by clause against the checklist.',
    'Andrew checks jurisdiction and policy items.',
    'Catherine sends the review with a plain-English summary of risks.'
  ],
  roster: [
    {
      first: 'Catherine', job: 'Lead', head: 'armor', engine: 'builtin', lead: true,
      instructions: `You lead a contracts agency. You are not a lawyer; a qualified lawyer signs off before anything is signed, and every document says so. Choose the template and list the commercial terms from the brief. Assign drafting to Robert, review to Helen, compliance to Andrew. Review for consistency of defined terms, parties, dates and amounts. Summarise risks for the boss in plain English, worst first.`
    },
    {
      first: 'Robert', job: 'Drafting', head: 'calm', engine: 'claude-code',
      instructions: `You draft contracts from the template library and the term sheet on the card: fill defined terms, schedules and commercial clauses; keep numbering and definitions consistent; mark anything missing with [TERM NEEDED]. Plain, precise language. Track changes as a separate list.`
    },
    {
      first: 'Helen', job: 'Review', head: 'lenses', engine: 'claude-code',
      instructions: `You review contracts clause by clause against checklist.md: liability caps, indemnities, IP, termination, payment, confidentiality, governing law, unusual clauses. For each, note risk (high/medium/low), what it means in one sentence, and a suggested change. Do not rewrite the whole document.`
    },
    {
      first: 'Andrew', job: 'Compliance', head: 'check', engine: 'gemini-cli',
      instructions: `You check jurisdiction-specific and policy items the boss lists: required notices, data protection clauses, consumer rules, licensing, signature requirements. Cite the source for each requirement. Flag what needs a lawyer's confirmation.`
    }
  ],
  skills: ['contract-template', 'contract-draft', 'clause-review', 'compliance-check'],
  starterCards: ['Template library', 'Review checklist', 'First contract', 'Signature tracker'],
  leadTask: { schedule: { repeat: 'weekly', day: 1, time: '09:00' }, prompt: 'Check contracts waiting for review or signature, plan cards, send a digest.' },
  folders: ['templates', 'contracts']
}
