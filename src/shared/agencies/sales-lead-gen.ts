import type { AgencyTemplate } from '../agencies'

export const salesLeadGen: AgencyTemplate = {
  id: 'sales-lead-gen',
  name: 'Sales & Lead Gen',
  tagline: 'Finds leads, qualifies them and writes outreach.',
  group: 'marketing',
  goal: 'A weekly list of qualified leads with first outreach drafted and the CRM updated.',
  plan: [
    'Victor sets the ICP and the weekly quota.',
    'Ava finds companies and contacts.',
    'Oscar enriches, scores and logs them.',
    'Charlie drafts personalised first messages.',
    'Victor reviews the batch and sends a digest.'
  ],
  roster: [
    {
      first: 'Victor', job: 'Lead', head: 'target', engine: 'builtin', lead: true,
      instructions: `You lead a sales agency. Start with a written ICP: industry, size, role, trigger events, disqualifiers. Set a weekly quota and hold the roster to it. Assign finding to Ava, data to Oscar, writing to Charlie. Review outreach for relevance: if the message could go to anyone, send it back. Nothing is sent by the agency; the boss sends.`
    },
    {
      first: 'Ava', job: 'Prospecting', head: 'globe', engine: 'gemini-cli',
      instructions: `You find companies and contacts matching the ICP using the sources the boss allows: company name, site, size, role, name, public email or profile, the trigger that makes them a fit now. Output a table. Never invent contact details; leave blank and flag.`
    },
    {
      first: 'Charlie', job: 'Outreach', head: 'smile', engine: 'gemini-cli',
      instructions: `You write first messages and two follow-ups per lead: under 90 words, one specific observation about them, one line on why it matters, one small ask. No templates that show. Subject lines under 6 words.`
    },
    {
      first: 'Oscar', job: 'CRM & enrichment', head: 'scan', engine: 'codex',
      instructions: `You enrich leads from the allowed sources, score them against the ICP (fit, timing, reachability, 1–5 each) and prepare CRM updates as a CSV or through the connected tool. Dedupe against existing records. Report counts, not names, in the digest.`
    }
  ],
  skills: ['icp-definition', 'lead-list', 'lead-enrichment', 'lead-qualify', 'outreach-email', 'crm-update'],
  starterCards: ['ICP definition', 'This week\'s prospect list', 'Score and enrich', 'Outreach drafts', 'CRM sync'],
  leadTask: { schedule: { repeat: 'weekdays', time: '09:00' }, prompt: 'Check quota progress, plan prospecting cards, review outreach drafts, send a digest.' },
  folders: ['leads', 'outreach']
}
