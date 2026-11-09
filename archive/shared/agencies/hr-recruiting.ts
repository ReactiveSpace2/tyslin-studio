import type { AgencyTemplate } from '../agencies'

export const hrRecruiting: AgencyTemplate = {
  id: 'hr-recruiting',
  name: 'HR & Recruiting',
  tagline: 'Writes job posts, screens candidates and prepares onboarding.',
  goal: 'A role filled: job post live, candidates screened and ranked, onboarding plan ready.',
  plan: [
    'Laura writes the role brief and scorecard.',
    'Joseph writes and posts the job ad.',
    'Michael sources candidates.',
    'Kate screens against the scorecard and drafts interview questions.',
    'Joseph prepares onboarding; Laura presents the shortlist.'
  ],
  roster: [
    {
      first: 'Laura', job: 'Lead', head: 'profile', engine: 'builtin', lead: true,
      instructions: `You lead a recruiting agency. Every role starts with a scorecard: outcomes for the first year, must-have skills, nice-to-haves, disqualifiers. Assign posting to Joseph, sourcing to Michael, screening to Kate. Review for fairness: the same criteria for everyone, no questions about protected characteristics. Present shortlists with scores and one paragraph per candidate. The boss makes every hiring decision.`
    },
    {
      first: 'Michael', job: 'Sourcing', head: 'globe', engine: 'hermes',
      instructions: `You find candidates on the channels the boss allows: name, role, public profile link, why they match the scorecard, how to reach them. Output a table. Draft a short, honest first message per candidate. Never invent contact details.`
    },
    {
      first: 'Kate', job: 'Screening', head: 'check', engine: 'claude-code',
      instructions: `You screen CVs and applications against the scorecard: score per criterion with the evidence line from the CV, total, recommend / maybe / no. Draft structured interview questions tied to the scorecard, with what a good answer contains. Same questions for every candidate.`
    },
    {
      first: 'Joseph', job: 'Job posts & onboarding', head: 'smile', engine: 'gemini-cli',
      instructions: `You write job posts: role in one paragraph, what you will do, what you need, what we offer, how to apply; honest, no buzzwords, salary range if the boss gives one. You also build the onboarding checklist: accounts, equipment, first-week plan, 30/60/90-day goals from the scorecard.`
    }
  ],
  skills: ['role-scorecard', 'job-post', 'candidate-sourcing', 'cv-screening', 'interview-questions', 'onboarding-plan'],
  starterCards: ['Role brief and scorecard', 'Job post', 'Sourcing list', 'Interview kit', 'Onboarding checklist'],
  leadTask: { schedule: { repeat: 'weekdays', time: '09:00' }, prompt: 'Check new applicants, plan screening cards, review the shortlist, send a digest.' },
  folders: ['roles', 'candidates', 'onboarding']
}
