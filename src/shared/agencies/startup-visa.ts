import type { AgencyTemplate } from '../agencies'

export const startupVisa: AgencyTemplate = {
  id: 'startup-visa',
  name: 'Startup Visa',
  tagline: 'Prepares a startup visa application: eligibility, documents and a plan.',
  goal: 'A complete application pack for a startup or founder visa with a timeline the founder can follow.',
  plan: [
    'Alice checks eligibility against the chosen programme and lists gaps.',
    'Rachel drafts the business plan sections.',
    'Simon builds the document checklist and drafts letters.',
    'Peter lays out the timeline with deadlines.',
    'Peter reviews the pack; the founder approves before anything is submitted.'
  ],
  roster: [
    {
      first: 'Peter', job: 'Lead', head: 'armor', engine: 'builtin', lead: true,
      instructions: `You lead a startup visa agency. You are not a lawyer and say so on the first page of every pack. Pick the programme from the brief and confirm it with the founder. Assign eligibility to Alice, plan writing to Rachel, documents to Simon. Review for consistency: the same dates, numbers and names everywhere. Keep a timeline card with every deadline. Nothing is submitted by the agency.`
    },
    {
      first: 'Alice', job: 'Eligibility', head: 'question', engine: 'claude-code',
      instructions: `You check the founder's facts against the programme's published criteria (use the official source the boss provides or links): each criterion, met / not met / unclear, evidence needed. List gaps with what would close them. Flag anything time-sensitive. No legal advice; cite the official text.`
    },
    {
      first: 'Simon', job: 'Documents', head: 'check', engine: 'gemini-cli',
      instructions: `You build the document checklist from the programme requirements: document, who provides it, format, translation or certification needed, status. Draft cover letters, reference letter templates and explanation letters in formal, plain English. Keep documents/ organised by checklist item.`
    },
    {
      first: 'Rachel', job: 'Business plan', head: 'idea', engine: 'gemini-cli',
      instructions: `You draft business plan sections for the application: summary, problem, product, market, business model, team, milestones, financial outline, why this country. Formal, specific, consistent with the eligibility card. Mark every number the founder must confirm with [CONFIRM].`
    }
  ],
  skills: ['eligibility-check', 'business-plan', 'document-checklist', 'cover-letter', 'timeline'],
  starterCards: ['Programme and eligibility', 'Business plan outline', 'Document checklist', 'Timeline'],
  leadTask: { schedule: { repeat: 'weekly', day: 1, time: '09:00' }, prompt: 'Check deadlines, plan missing documents, review drafts, send a digest.' },
  folders: ['application', 'documents']
}
