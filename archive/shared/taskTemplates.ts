import type { TaskSchedule } from './types'

/**
 * Starting points on the Tasks screen. Written for Tyslin's starter agents and assistants and for
 * what they can do today (project files, no email or calendar access yet). `agent` is matched by
 * name; when that agent is missing the user picks one.
 */
export interface TaskTemplate {
  id: string
  name: string
  description: string
  icon: 'sun' | 'checklist' | 'idea' | 'search' | 'chart' | 'knowledge'
  agent: string
  prompt: string
  schedule: TaskSchedule
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'daily-plan',
    name: 'Daily plan',
    description: 'The three things that matter most today, from your goals and this week\'s plan.',
    icon: 'sun',
    agent: 'Atlas',
    schedule: { repeat: 'weekdays', time: '08:00' },
    prompt: 'Read ops/goals.md and this week\'s plan in ops/plans/. Write today\'s plan: the three tasks that matter most, who does each, and anything blocked. Keep it under 120 words.'
  },
  {
    id: 'weekly-review',
    name: 'Weekly review',
    description: 'A Friday summary of what moved, what stalled and what comes next.',
    icon: 'checklist',
    agent: 'Atlas',
    schedule: { repeat: 'weekly', day: 5, time: '16:00' },
    prompt: 'Review this week\'s plan in ops/plans/. Mark each task done, moved or blocked, then write a short summary: what moved, what stalled and why, and the three priorities for next week.'
  },
  {
    id: 'content-ideas',
    name: 'Content ideas',
    description: 'A few post ideas each week from your brief, in your brand voice.',
    icon: 'idea',
    agent: 'Quill',
    schedule: { repeat: 'weekly', day: 1, time: '09:00' },
    prompt: 'Read the content brief in the project folder. Draft five post ideas for this week, each with a hook, the main point and the format (thread, post or article). Mark your favourite.'
  },
  {
    id: 'research-brief',
    name: 'Research brief',
    description: 'A one-page brief on the open question in your notes, with sources.',
    icon: 'search',
    agent: 'Scout',
    schedule: { repeat: 'weekly', day: 3, time: '10:00' },
    prompt: 'Read research/questions.md. Take the top open question, compare the options using the files in the project, and write a one-page brief with sources and a recommendation.'
  },
  {
    id: 'metrics-report',
    name: 'Metrics report',
    description: 'Clean the latest numbers and write the weekly metrics report.',
    icon: 'chart',
    agent: 'Ledger',
    schedule: { repeat: 'weekly', day: 1, time: '09:00' },
    prompt: 'Read the latest data files in the project. Check them for gaps and obvious errors, then write this week\'s metrics report: the key numbers, what changed since last week and one thing to look into.'
  },
  {
    id: 'daily-lesson',
    name: 'Daily lesson',
    description: 'Learn one idea a day on a topic you choose, with a quick check question.',
    icon: 'knowledge',
    agent: 'Tutor',
    schedule: { repeat: 'daily', time: '09:00' },
    prompt: 'Teach me one new idea about [your topic] that builds on the basics. Explain it with a simple example, then ask me one short question to check I understood.'
  }
]
