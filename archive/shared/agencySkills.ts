// Skills only the archived agency templates used (removed from src/main/seedSkillsAgencies.ts on 9 Nov 2026).
// Copy entries back into AGENCY_SKILLS if a template that needs them returns.
export const ARCHIVED_AGENCY_SKILLS = [
  {
    name: 'ticket-reply',
    description: 'Answer a customer ticket well.',
    body: `Acknowledge the problem in one line. Answer from the knowledge base; link the article. Give the next step. Short, warm, specific; no jargon. If the answer is not in the knowledge base, do not guess: escalate with what you tried. Tag the ticket with its type.`
  },
  {
    name: 'escalation',
    description: 'Hand a ticket up with everything the next person needs.',
    body: `An escalation has: the customer's words, what was tried, what you think is wrong, steps to reproduce, expected and actual, logs or screenshots if any, urgency. Keep the customer informed every day it stays open. Refunds, legal threats and security reports go straight to the boss.`
  },
  {
    name: 'kb-article',
    description: 'Write a help article from a solved ticket.',
    body: `Title as the question a user would type. First paragraph is the answer. Then numbered steps, then related articles. Plain language, no internal names. Update an existing article rather than writing a duplicate. Keep the index current.`
  },
  {
    name: 'tone-check',
    description: 'Check replies for tone and accuracy.',
    body: `Read a sample of replies. For each: is it correct against the knowledge base, is it kind, is it short, does it give a next step, would you be happy to receive it. Note each miss with a better line. Report patterns, not just instances.`
  },
  {
    name: 'sla-report',
    description: 'Report service levels from ticket data.',
    body: `From exported ticket data: volume, first-reply time, resolution time, percentage within SLA, by type and by day. Top five issues with counts. One product suggestion backed by the numbers. Compare with last week. Only numbers from the data.`
  },
  {
    name: 'question-framing',
    description: 'Turn a vague ask into questions with answers that matter.',
    body: `Write the decision the answer would change. Split the ask into two or three sub-questions that can each be answered with evidence. For each, say what a good answer looks like and what sources would count. If no decision depends on it, say so before researching.`
  },
  {
    name: 'business-plan',
    description: 'Draft a business plan for an application.',
    body: `Sections: summary, problem, product, market, business model, team, milestones, financial outline, why this country or programme. Formal and specific. Every number the founder must confirm is marked [CONFIRM]. Keep facts consistent with the eligibility check. No claims you cannot back.`
  },
  {
    name: 'cover-letter',
    description: 'Write formal letters for an application pack.',
    body: `Cover, reference and explanation letters: who is writing, to whom, purpose in the first sentence, the facts in order, what is enclosed, a polite close. Formal, plain English, one page. Mark anything to confirm with [CONFIRM]. Keep names, dates and numbers identical to the rest of the pack.`
  },
  {
    name: 'timeline',
    description: 'Lay out deadlines so nothing is missed.',
    body: `List every deadline with its date, what must be done by then, who does it, and what it depends on. Work backwards from the final date. Flag items with less than two weeks of slack. Keep it as one table and update it whenever a date changes.`
  },
  {
    name: 'invoice-draft',
    description: 'Draft an invoice from the project\'s records.',
    body: `From timesheets, orders or contracts: client details, invoice number, date, items with quantity, rate and total, tax as the settings file says, grand total, due date, payment terms and details. Keep a register of issued and paid. Draft reminders for overdue ones; the boss sends.`
  },
  {
    name: 'expense-categorise',
    description: 'Put each expense in the right account.',
    body: `Match each receipt or bank line to the chart of accounts. Flag duplicates, personal items and missing receipts. Ask when a category is unclear instead of guessing. Keep the expenses file current with date, vendor, amount, category, receipt reference.`
  },
  {
    name: 'cash-forecast',
    description: 'Forecast cash for the next three months.',
    body: `Start from the cash position. Add expected receipts by date, subtract expected payments by date. List every assumption (payment delays, recurring costs, one-offs). Show the low point and when it happens. Tables first, then five sentences on what to watch.`
  },
  {
    name: 'contract-template',
    description: 'Keep a library of contract templates.',
    body: `For each template: purpose, parties, defined terms, the clauses that change per deal (marked), the clauses that do not, and a note on when to use it. Every template carries the line that a qualified lawyer must sign off before signature. Version each change.`
  },
  {
    name: 'contract-draft',
    description: 'Draft a contract from a template and a term sheet.',
    body: `Fill the template from the term sheet: parties, dates, amounts, schedules. Keep defined terms and numbering consistent. Mark anything missing [TERM NEEDED]. Plain, precise language. List every change from the template separately so review is quick. You are not a lawyer; say so in the document.`
  },
  {
    name: 'clause-review',
    description: 'Review a contract clause by clause.',
    body: `For each clause on the checklist (liability caps, indemnities, IP, termination, payment, confidentiality, governing law, unusual terms): risk level, what it means in one sentence, suggested change. Worst risks first. Do not rewrite the document; propose edits. Flag what needs a lawyer.`
  },
  {
    name: 'compliance-check',
    description: 'Check the rules that apply to a document or process.',
    body: `From the list the boss gives: required notices, data protection, consumer rules, licensing, signature requirements. For each: applies or not, met or not, the source you checked, what to change. Cite the source every time. Flag anything that needs professional confirmation.`
  },
  {
    name: 'role-scorecard',
    description: 'Define a role by outcomes before hiring for it.',
    body: `Outcomes for the first year (three to five, measurable), must-have skills, nice-to-haves, disqualifiers, how we will assess each. Every candidate is scored against the same card. No criteria that touch protected characteristics.`
  },
  {
    name: 'job-post',
    description: 'Write an honest job post.',
    body: `The role in one paragraph, what you will do, what you need, what we offer, how to apply. Salary range when the boss gives one. No buzzwords, no "rockstar", no list of twenty requirements. Under 500 words. Plain language a candidate can judge themselves against.`
  },
  {
    name: 'candidate-sourcing',
    description: 'Find candidates on allowed channels.',
    body: `For each candidate: name, current role, public profile link, why they match the scorecard, how to reach them. Only channels the boss allows. Never invent contact details. Draft a short, honest first message per candidate; the boss sends.`
  },
  {
    name: 'cv-screening',
    description: 'Score applications against the scorecard.',
    body: `For each application: a score per criterion with the line from the CV that supports it, a total, and recommend / maybe / no with one sentence. Same criteria for everyone, applied the same way. Note missing information to ask for rather than assuming.`
  },
  {
    name: 'interview-questions',
    description: 'Write structured interview questions.',
    body: `One or two questions per scorecard criterion, asked of every candidate in the same order. For each question: what a strong answer contains, what a weak one looks like, a follow-up. Behavioural questions ask for a real example. Nothing about protected characteristics.`
  },
  {
    name: 'onboarding-plan',
    description: 'Plan a new hire\'s first 90 days.',
    body: `Before day one: accounts, equipment, access. First week: who to meet, what to read, a small first task. 30, 60 and 90-day goals tied to the scorecard outcomes. Check-in dates. Keep it as a checklist the hire and their manager can both see.`
  },
  {
    name: 'video-brief',
    description: 'Decide what a video is for before writing it.',
    body: `Format (short, explainer, demo, talking head), length, platform, audience, the one message, call to action, what must appear, tone. Half a page. The brief is agreed before the script starts.`
  },
  {
    name: 'script-writing',
    description: 'Write scripts meant to be spoken.',
    body: `Hook in the first line. One idea per section. Spoken language: read it aloud and cut what you would not say. Timing marks every 15 seconds or so. On-screen text noted in brackets. About 150 words per minute. Three hook options when asked.`
  },
  {
    name: 'storyboard',
    description: 'Turn a script into a shot list.',
    body: `Table: shot number, duration, what is on screen, camera or motion note, voice line, on-screen text, assets needed. Flag shots that need footage or images the project does not have. Keep shots short on short-form platforms.`
  },
  {
    name: 'thumbnail-brief',
    description: 'Brief titles and thumbnails that get the click honestly.',
    body: `Five title options under the platform's limit, each with a different angle. Three thumbnail briefs: text under four words, the focal element, a contrast note, what to avoid. The title and thumbnail must match what the video delivers.`
  },
  {
    name: 'captions',
    description: 'Produce captions and descriptions from the final script.',
    body: `Timestamped captions in SRT from the final script, broken into lines under 40 characters, two lines per caption at most. A description with the message in the first line, then links, then tags. Respect each platform's limits.`
  }
]
