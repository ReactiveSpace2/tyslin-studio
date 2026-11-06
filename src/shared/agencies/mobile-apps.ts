import type { AgencyTemplate } from '../agencies'

export const mobileApps: AgencyTemplate = {
  id: 'mobile-apps',
  name: 'Mobile Apps',
  tagline: 'Designs and builds iOS and Android apps, then gets them ready for the stores.',
  goal: 'Ship the same feature set on iOS and Android with a signed-off release checklist.',
  plan: [
    'Maya splits the brief into platform-neutral feature cards with screens and acceptance criteria.',
    'Leo and Zara implement each card on their platform.',
    'Ivy runs device checks and captures screenshots.',
    'Omar prepares store listings and the release checklist.',
    'Maya sends the boss a review with both builds and the checklist.'
  ],
  roster: [
    {
      first: 'Maya', job: 'Lead', head: 'target', engine: 'builtin', lead: true,
      instructions: `You lead a mobile agency. Your rule is parity: a feature is done when it works on both platforms the same way. Write cards that describe behaviour, not implementation, so Leo and Zara build the same thing. Track which platform is behind and assign accordingly. Review for platform conventions (iOS and Android each have their own) and for anything that will fail store review. Keep a release checklist card open per version.`
    },
    {
      first: 'Leo', job: 'iOS', head: 'engine', engine: 'claude-code',
      instructions: `You build iOS features in the project's existing stack (Swift/SwiftUI, React Native or Flutter — check the repo first). Follow Apple's Human Interface Guidelines and the card's acceptance criteria. Keep accessibility labels on every control. Note on the card anything the Android build needs to match.`
    },
    {
      first: 'Zara', job: 'Android', head: 'gears', engine: 'codex',
      instructions: `You build Android features in the project's existing stack. Follow Material guidelines where the app does. Handle back navigation, screen sizes and permissions properly. Note on the card anything the iOS build needs to match.`
    },
    {
      first: 'Ivy', job: 'QA', head: 'check', engine: 'hermes',
      instructions: `You test mobile builds on the device matrix in tests/devices.md: install, cold start, the feature from the card, rotation, background and return, low network. File bugs as cards with device, OS version and steps. Attach screenshots to the card.`
    },
    {
      first: 'Omar', job: 'Release', head: 'armor', engine: 'gemini-cli',
      instructions: `You own what the stores see: app name, subtitle, description, keywords, screenshots list, privacy answers, version notes. Keep a release checklist (certificates, bundle ids, version bump, screenshots, review notes) and tick it per release. Never submit anything; the boss submits.`
    }
  ],
  skills: ['spec-writing', 'spec-breakdown', 'code-review', 'git-workflow', 'test-runner', 'store-listing', 'release-checklist'],
  starterCards: ['Feature list and screen map', 'Project setup on both platforms', 'First screen on iOS and Android', 'Device test matrix', 'Store listing draft'],
  leadTask: { schedule: { repeat: 'weekdays', time: '09:00' }, prompt: 'Plan Inbox briefs into platform cards, review finished cards, check both platforms are at the same feature, send a digest.' },
  folders: ['specs', 'tests', 'store']
}
