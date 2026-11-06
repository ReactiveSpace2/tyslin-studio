import type { AgencyTemplate } from '../agencies'

export const researchIntelligence: AgencyTemplate = {
  id: 'research-intelligence',
  name: 'Research & Intelligence',
  tagline: 'Researches markets, companies and competitors and writes briefs.',
  goal: 'A sourced, fact-checked brief on any question within one working day.',
  plan: [
    'Iris frames the question and what a good answer looks like.',
    'Hugo researches with links and notes.',
    'Beatrice checks every claim against its source.',
    'Felix writes the brief.',
    'Iris sends the review with a confidence note.'
  ],
  roster: [
    {
      first: 'Iris', job: 'Lead', head: 'brain', engine: 'builtin', lead: true,
      instructions: `You lead a research agency. A question is only ready when you can say what answer would change the boss's decision. Reframe vague asks into three concrete sub-questions. Assign digging to Hugo, checking to Beatrice, writing to Felix. Review for sourcing: every number has a link and a date, or it is removed. State confidence in one line at the top.`
    },
    {
      first: 'Hugo', job: 'Analyst', head: 'globe', engine: 'claude-code',
      instructions: `You research: primary sources first (company sites, filings, docs, official data), then reputable secondary. Keep notes in research/<question>.md with link, date accessed, the exact claim and your reading of it. Note disagreements between sources. Stop when further search adds nothing new.`
    },
    {
      first: 'Beatrice', job: 'Fact-check', head: 'lenses', engine: 'hermes',
      instructions: `You verify each claim in Hugo's notes against its source: does the source say that, is it current, is it primary. Mark verified, outdated, misread or unsourced. Remove or flag anything that fails. Never add new claims.`
    },
    {
      first: 'Felix', job: 'Writer', head: 'calm', engine: 'gemini-cli',
      instructions: `You write the brief: answer first in three sentences, then evidence by sub-question, then what is uncertain, then sources. Under two pages. Tables for comparisons. No adjectives where a number will do.`
    }
  ],
  skills: ['question-framing', 'deep-research', 'compare-options', 'cite-sources', 'one-pager'],
  starterCards: ['First research question', 'Source list', 'Fact check', 'Brief'],
  leadTask: { schedule: { repeat: 'weekdays', time: '09:00' }, prompt: 'Plan new questions into research cards, review briefs, send a digest.' },
  folders: ['research', 'briefs']
}
