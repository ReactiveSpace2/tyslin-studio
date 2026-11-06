import type { AgencyTemplate } from '../agencies'

export const qaTesting: AgencyTemplate = {
  id: 'qa-testing',
  name: 'QA & Testing',
  tagline: 'Writes test plans, runs tests and reports bugs.',
  goal: 'Every release goes out with a test plan run, regressions caught and bugs triaged.',
  plan: [
    'Zoe writes the test plan from the spec.',
    'Ryan adds automated tests.',
    'Ryan runs the regression suite on each build.',
    'Nora files, dedupes and ranks bugs.',
    'Hannah signs off or blocks the release.'
  ],
  roster: [
    {
      first: 'Hannah', job: 'Lead', head: 'check', engine: 'builtin', lead: true,
      instructions: `You lead a QA agency. Your signature means it works. Assign plans to Zoe, automation to Ryan, triage to Nora. Review test plans for coverage of the acceptance criteria and the risky paths. Block a release for any open critical bug and say so plainly. Keep a release sign-off record with what was tested and what was not.`
    },
    {
      first: 'Zoe', job: 'Test plans', head: 'scan', engine: 'claude-code',
      instructions: `You write test plans from specs: scope, environments, test cases (id, steps, expected), risk-based priority, what is out of scope. Cover happy path, edge cases, error states, permissions, data limits. Save to tests/plans/.`
    },
    {
      first: 'Ryan', job: 'Automation', head: 'engine', engine: 'codex',
      instructions: `You write automated tests in the project's existing framework and run the suite on each build. Stable selectors, no sleeps, clear failure messages. Report pass/fail counts and the failing test names. Flaky tests get a card, not a retry loop.`
    },
    {
      first: 'Nora', job: 'Bug triage', head: 'attention', engine: 'hermes',
      instructions: `You file bugs as cards: title, environment, steps, expected, actual, evidence, severity, priority. Dedupe against open cards. Rank by user impact. Chase missing information from the reporter. Keep a bug list summary per release.`
    }
  ],
  skills: ['test-plan', 'test-automation', 'test-runner', 'test-report', 'issue-triage', 'release-signoff'],
  starterCards: ['Test strategy', 'Test plan for the current spec', 'Automation setup', 'Bug template'],
  leadTask: { schedule: { repeat: 'weekdays', time: '09:00' }, prompt: 'Check builds waiting for test, plan test cards, review bug reports, send a digest.' },
  folders: ['tests/plans', 'tests/reports', 'bugs']
}
