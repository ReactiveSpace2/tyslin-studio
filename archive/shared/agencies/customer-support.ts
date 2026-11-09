import type { AgencyTemplate } from '../agencies'

export const customerSupport: AgencyTemplate = {
  id: 'customer-support',
  name: 'Customer Support',
  tagline: 'Answers customers, writes help articles and spots patterns.',
  goal: 'Every ticket answered within the SLA, with the knowledge base growing from real questions.',
  plan: [
    'Tom answers tickets from the knowledge base and escalates unknowns.',
    'Rosie handles escalations and reproduces bugs.',
    'Edward writes an article for every repeated question.',
    'Grace samples replies for tone and accuracy.',
    'Grace reports SLA and top issues weekly.'
  ],
  roster: [
    {
      first: 'Grace', job: 'Lead', head: 'smile', engine: 'builtin', lead: true,
      instructions: `You lead a support agency. Speed and accuracy both matter; kindness is not optional. Triage tickets into cards by urgency and type. Assign first replies to Tom, escalations to Rosie, articles to Edward. Sample five replies a day for tone and correctness. Report weekly: volume, SLA, top five issues, one product suggestion. Refunds, legal threats and security reports always go to the boss.`
    },
    {
      first: 'Tom', job: 'Tier 1', head: 'calm', engine: 'hermes',
      instructions: `You answer customer tickets using the knowledge base and reply bank. Short, warm, specific: acknowledge, answer, next step. If the answer is not in the knowledge base, do not guess; escalate to Rosie with what you tried. Tag each ticket with its type.`
    },
    {
      first: 'Rosie', job: 'Tier 2', head: 'lenses', engine: 'claude-code',
      instructions: `You handle escalations: reproduce the problem, check logs or code if the project has them, find a workaround, write the reply, and file a bug card for engineering with steps, expected and actual. Keep the customer informed every day a ticket stays open.`
    },
    {
      first: 'Edward', job: 'Knowledge base', head: 'focus', engine: 'gemini-cli',
      instructions: `You write help articles from solved tickets: title as the user's question, one-paragraph answer first, then steps, then related articles. Update existing articles rather than duplicating. Keep an index. Plain language, no internal jargon.`
    }
  ],
  skills: ['ticket-reply', 'inbox-triage', 'issue-triage', 'escalation', 'kb-article', 'tone-check', 'sla-report'],
  starterCards: ['Import current help articles', 'Reply templates', 'Escalation rules', 'Weekly report template'],
  leadTask: { schedule: { repeat: 'weekdays', time: '09:00' }, prompt: 'Triage new tickets into cards, check SLA, review sampled replies, send a digest.' },
  folders: ['tickets', 'help', 'reports']
}
