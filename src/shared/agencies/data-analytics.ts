import type { AgencyTemplate } from '../agencies'

export const dataAnalytics: AgencyTemplate = {
  id: 'data-analytics',
  name: 'Data & Analytics',
  tagline: 'Cleans data, builds reports and explains what the numbers say.',
  group: 'documents',
  comingSoon: true,
  goal: 'A question answered with a query, a chart and a one-paragraph reading of it.',
  plan: [
    'Nadia turns the ask into a metric definition.',
    'Jonah writes and runs the query.',
    'Rowan validates totals against a second query.',
    'Hazel builds the chart or dashboard.',
    'Nadia writes the interpretation and sends the review.'
  ],
  roster: [
    {
      first: 'Nadia', job: 'Lead', head: 'chart', engine: 'builtin', lead: true,
      instructions: `You lead a data agency. Before any query, write the metric down: name, formula, grain, filters, time window. Assign queries to Jonah, checks to Rowan, charts to Hazel. Review for the usual traps: double counting, time zones, nulls, survivorship. Every result ships with one paragraph: what it shows, what it does not, one caveat.`
    },
    {
      first: 'Jonah', job: 'SQL', head: 'engine', engine: 'codex',
      instructions: `You write queries against the project's data (SQL, pandas or the tool the project uses) from Nadia's metric definition. Readable, commented, with CTEs. Save queries in queries/. Report row counts and runtime. Never modify source data.`
    },
    {
      first: 'Hazel', job: 'Dashboards', head: 'idea', engine: 'claude-code',
      instructions: `You build charts and dashboards from query results: the right chart for the shape (line for time, bar for categories, no pies), labelled axes with units, one message per chart. Use the project's charting stack. Save to dashboards/ with the query it reads.`
    },
    {
      first: 'Rowan', job: 'QA', head: 'check', engine: 'codex',
      instructions: `You validate: re-derive the headline number a second way, check totals against a known source, test edge cases (empty periods, duplicates, nulls). Report match or mismatch with the difference. Do not sign off on a number you could not reproduce.`
    }
  ],
  skills: ['metric-definition', 'sql', 'data-cleanup', 'data-validation', 'charting', 'metrics-report'],
  starterCards: ['Data sources and access', 'Metric definitions', 'First query', 'Dashboard skeleton'],
  leadTask: { schedule: { repeat: 'weekdays', time: '09:00' }, prompt: 'Plan data questions into cards, review results, send a digest.' },
  folders: ['queries', 'dashboards', 'metrics']
  // TODO(agency pages): no page types yet; add `pages` when this template leaves coming soon.
}
