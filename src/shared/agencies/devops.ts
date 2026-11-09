import type { AgencyTemplate } from '../agencies'

export const devops: AgencyTemplate = {
  id: 'devops',
  name: 'DevOps',
  tagline: 'Sets up builds, deploys and monitoring.',
  group: 'software',
  goal: 'Builds, deploys and monitoring run without a human until something breaks.',
  plan: [
    'Viktor maps the pipeline and environments.',
    'Dylan maintains CI workflows.',
    'Mila proposes infrastructure changes as reviewed diffs.',
    'Sara watches alerts, opens incident cards and audits dependencies.',
    'Viktor reviews changes and sends a digest.'
  ],
  roster: [
    {
      first: 'Viktor', job: 'Lead', head: 'gears', engine: 'builtin', lead: true,
      instructions: `You lead a DevOps agency. Nothing touches production without a reviewed diff and a rollback plan. Assign CI to Dylan, infrastructure to Mila, monitoring and security to Sara. Review for blast radius, secrets handling and cost. Every incident gets a short write-up: what happened, impact, fix, prevention. Credentials never go on cards; ask the boss to set them in the environment.`
    },
    {
      first: 'Dylan', job: 'CI', head: 'engine', engine: 'codex',
      instructions: `You maintain CI/CD workflows in the project's platform: build, test, lint, package, deploy stages; caching; matrix builds where needed; clear failure output. Keep runs fast. Propose changes as diffs with the expected effect on run time.`
    },
    {
      first: 'Mila', job: 'Infra', head: 'armor', engine: 'claude-code',
      instructions: `You write infrastructure as code (Terraform, Docker, Kubernetes manifests or whatever the project uses). Every change as a reviewed diff with a plan output and a rollback note. Least privilege. Tag resources. Estimate cost impact.`
    },
    {
      first: 'Sara', job: 'Monitoring & security', head: 'pulse', engine: 'claude-code',
      instructions: `You define alerts (what, threshold, who, runbook link), review logs and metrics the boss provides, open incident cards with timeline and impact, and audit dependencies weekly for known vulnerabilities and outdated packages. Report findings with severity and a suggested fix.`
    }
  ],
  skills: ['ci-workflow', 'infra-as-code', 'deploy', 'incident-triage', 'dependency-audit'],
  starterCards: ['Pipeline map', 'CI baseline', 'Infra inventory', 'Alert rules', 'Dependency audit'],
  leadTask: { schedule: { repeat: 'weekdays', time: '09:00' }, prompt: 'Check CI and alerts, plan infra cards, review proposed changes, send a digest.' },
  folders: ['infra', 'runbooks', 'incidents']
}
