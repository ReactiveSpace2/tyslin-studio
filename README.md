<p align="center">
  <img src="resources/brand/logo-horizontal.png" alt="Tyslin" width="320">
</p>

<p align="center"><strong>Every agent you run. One studio.</strong></p>

<p align="center">Tyslin Studio is a free AI agent dashboard: an open-source desktop app for running AI agencies made of AI agents.</p>

> **BETA.** Tyslin Studio is in beta. Tested on Linux; macOS and Windows builds are not yet tested much or signed. Expect rough edges and breaking changes.

## Run your own AI agency

You give an agency a task. Its Lead plans the work and hands it to a team of agents on Claude Code, Codex or Gemini CLI. They work on their own, and you approve what ships. It is a free dashboard for agents: open source, on your machine, with your keys, and one place to see every agent, what it is doing and what it needs from you.

Three places, one left column (New task, Search, Agencies, Scheduled, Files; the logo and New task take you Home): **Home** (type a task, see what needs you: questions, file changes to review and plans waiting for your OK, and what is running), a **Task** (one conversation with the Lead: the plan, the workers' progress, questions and the changes to review), and the **Agency** (goals, team, skills, connectors, channel, memory, schedule).

- **Agency templates:** nine agencies you can create today: five software (App Development, Mobile Apps, Web Design, QA & Testing, DevOps) and four marketing and sales (Social Media Marketing, SEO, Email Marketing, Sales & Lead Gen), with Paid Ads and the Documents and data templates coming soon. Each is a Lead and a team with jobs, a goal, a plan and skills, around one folder.
- **One thread per task:** the Lead's plan, each worker's work, questions, reviews and the digest all land in the task. Away from the computer, the Lead reaches you on Telegram or Slack.
- **Memory:** plain Markdown notes per agency and per agent, added to every run.
- **Connectors:** tools from GitHub, Linear, Stripe and any MCP server, including search and install from the official MCP Registry.
- **Your keys or your sign-in:** API keys for Claude, OpenAI and Gemini, or your Claude, ChatGPT or Google sign-in through Claude Code, Codex and Gemini CLI.
- **You approve:** every file change is a diff you accept or reject, the plan waits for your OK and cards run one at a time, and each agency has a monthly budget. Agents on Claude Code, Codex or Gemini CLI ask before each command; read-only looks inside the folder (`ls`, `cat`, `git status`, version checks) are allowed without asking unless you turn that off in Settings → Notifications → Approvals.

<p align="center">
  <img src="docs/screenshots/home.png" alt="Tyslin Studio's Home screen: the mascot, the question What should your agency do?, a box to describe the task for Hannah, the Lead of the QA & Testing agency, and three starter cards: Build a feature, Fix a bug, Write the docs." width="900">
</p>

## Download

Installers are on the [latest GitHub release](https://github.com/ReactiveSpace2/tyslin-studio/releases/latest) and at [tyslin.ai](https://tyslin.ai/#download).

| Platform | File |
|---|---|
| macOS, Apple Silicon | `Tyslin-Studio-<version>-mac-arm64.dmg` |
| macOS, Intel | `Tyslin-Studio-<version>-mac-x64.dmg` |
| Windows 10/11 | `Tyslin-Studio-<version>-windows-x64-setup.exe` |
| Linux, any distro | `Tyslin-Studio-<version>-linux-x86_64.AppImage` |
| Linux, Debian and Ubuntu | `Tyslin-Studio-<version>-linux-amd64.deb` |
| Linux, snap | Not on the Snap Store yet |

The macOS and Windows builds are unsigned for now. On macOS, right-click the app and choose **Open**. On Windows, choose **More info**, then **Run anyway**.

Updates: the app checks GitHub Releases when it starts. Windows and the AppImage download and install updates in the app; macOS and the `.deb` tell you a new version is out; a snap install is updated by snapd.

## How an agency works

1. **Task:** on Home, type what the agency should do and send it to the Lead.
2. **Plan:** the Lead answers in the task with a plan: cards, each with a worker. Approve and run it, change a card, or ask the Lead to change the plan. (An agency set to run on its own skips the approval.)
3. **Work:** workers run their cards on their adapter, in the agency's folder. Each one's work folds into the task as it happens.
4. **Review:** every file change waits for you in the task's Changes panel, hunk by hunk, to accept or send back with a note.
5. **Done:** accepting a card's changes moves it to Done; the task shows where every card stands.
6. **Digest:** the Lead reports in the task, and on Telegram or Slack if you link one.

Only the Lead messages you; workers report to the Lead on the card (you can still open a direct chat with a worker from the task's title menu). Each agency has a budget: every card shows its estimated cost, and once the agency's total reaches the budget no more cards start until you raise it.

## The agencies

Nine agencies can be created today (the five software ones and Social Media Marketing, SEO, Email Marketing, Sales & Lead Gen, opened on 10 Nov 2026); the rest are shown as coming soon. Seven earlier templates (Customer Support, Research & Intelligence, Startup Visa, Finance & Bookkeeping, Legal & Contracts, HR & Recruiting, Video & Creative) are in `archive/shared/agencies/`. Each template comes with a goal, a five-step plan, starter cards, skills and the Lead's scheduled planning run. The Lead runs on your default model; the adapters below are where the workers run, and you can keep that mix or put every worker on one adapter.

<!-- agencies:start (generated by scripts/readme-agencies.mjs) -->
| Agency | Group | What it does | Lead | Agents | Adapters | Status |
|---|---|---|---|---|---|---|
| App Development | Software | Plans, builds, tests and ships web and desktop apps from a spec. | Alex | 5 | Claude Code, Codex, Gemini CLI | Available |
| Mobile Apps | Software | Designs and builds iOS and Android apps, then gets them ready for the stores. | Maya | 5 | Claude Code, Codex, Gemini CLI | Available |
| Web Design | Software | Designs and builds marketing sites and landing pages. | Jade | 5 | Claude Code, Gemini CLI, Codex | Available |
| QA & Testing | Software | Writes test plans, runs tests and reports bugs. | Hannah | 4 | Claude Code, Codex | Available |
| DevOps | Software | Sets up builds, deploys and monitoring. | Viktor | 4 | Codex, Claude Code | Available |
| Product Management | Documents and data | Turns feedback and goals into specs and a roadmap. | Erin | 4 | Claude Code, Gemini CLI | Coming soon |
| Data & Analytics | Documents and data | Cleans data, builds reports and explains what the numbers say. | Nadia | 4 | Codex, Claude Code | Coming soon |
| Content Writing | Documents and data | Researches, writes and edits articles, guides and newsletters. | Clara | 4 | Gemini CLI, Claude Code | Coming soon |
| Social Media Marketing | Marketing and sales | Plans, writes and schedules posts across your social channels. | Mia | 5 | Gemini CLI, Claude Code, Codex | Available |
| SEO | Marketing and sales | Finds what people search for, plans pages and improves rankings. | Owen | 4 | Gemini CLI, Claude Code | Available |
| Paid Ads | Marketing and sales | Plans, writes and reports on ad campaigns. | Ray | 4 | Gemini CLI, Claude Code, Codex | Coming soon |
| Email Marketing | Marketing and sales | Writes and plans newsletters and email sequences. | Nina | 4 | Gemini CLI, Codex, Claude Code | Available |
| Sales & Lead Gen | Marketing and sales | Finds leads, qualifies them and writes outreach. | Victor | 4 | Gemini CLI, Codex | Available |
<!-- agencies:end -->

Regenerate the table with `node scripts/readme-agencies.mjs --write`.

## Runs on

### Adapters

Workers run on agents you install. Tyslin drives them over the [Agent Client Protocol](https://agentclientprotocol.com). Settings → Agent engines shows the install command before anything runs.

| Adapter | Install command the app uses | Needs |
|---|---|---|
| Claude Code | `npm install -g @agentclientprotocol/claude-agent-acp` | A Claude sign-in (Settings → Models → Claude → Sign in with Claude), your Claude key, or your OpenRouter key with an `anthropic/…` model |
| Codex | `npm install -g @agentclientprotocol/codex-acp` | A ChatGPT sign-in (Settings → Models → ChatGPT → Sign in with ChatGPT), your OpenAI key, or your OpenRouter key with any model slug (`openai/gpt-5.5`) |
| Gemini CLI | `npm install -g @google/gemini-cli` | A Google sign-in (Settings → Models → Gemini → Sign in with Google), or your Gemini key |

The agency templates use only these three. Hermes, Goose, ZeroClaw, OpenClaw and custom ACP commands are still in the code (`src/main/engines.ts`) and keep working for agents already on them, but are hidden from the screens while `SHOW_OTHER_ENGINES` is false in `src/shared/engines.ts`.

### Models

The Lead, and any agent on the built-in runtime, uses one of these.

| Provider | Where the key goes |
|---|---|
| Claude (Anthropic) | Settings → Models, Anthropic API key |
| OpenAI | Settings → Models, OpenAI API key |
| Gemini (Google) | Settings → Models, Gemini API key |
| OpenRouter | Settings → Models, OpenRouter API key (checked with OpenRouter before it's saved), or *Or sign in with OpenRouter* |

Ollama (local models) is hidden for now (`SHOW_OLLAMA` in `ModelSetup.tsx`); an agent already on it keeps working. Keys are also passed to Claude Code, Codex and Gemini CLI unless the provider's card is set to use your signed-in account.

**OpenRouter for workers.** In a Claude Code or Codex worker's page, *Runs on* → *A model on OpenRouter* picks a model from OpenRouter's list (only models that take tool calls; Claude Code only `anthropic/…`). The worker then runs in a Tyslin-owned folder (`<app data>/adapters/claude-openrouter`, or `adapters/codex-openrouter/<agent>` with a `config.toml` naming an `openrouter` provider), so your own `~/.claude`, `~/.codex` and sign-ins are not used or changed, and the key is passed only in that process's environment. Gemini CLI has no OpenRouter option. OpenRouter errors (refused key, no credits, unknown model, rate limit) show in the task in plain words. Costs on OpenRouter models aren't estimated yet.

**Sign in instead of a key.** Settings → Accounts and connectors → Claude Code, Codex or Gemini CLI → *Sign in with …* installs the provider's own tool if needed (Claude Code, Codex or Gemini CLI) and opens its browser sign-in, so agents on that tool use your Claude Pro/Max, ChatGPT or Google plan. The tool keeps the login; Tyslin never stores it. Leads and the default model still use an API key.

### Preview

Open a task's Preview panel (the eye button) to see what the agency made without leaving Tyslin: pages, images, PDFs, Markdown, Word documents and spreadsheets from the agency's folder, with pages at desktop, tablet or phone width. Slides (.pptx) and older Office files (.doc, .odt, .rtf) are shown through your own [LibreOffice](https://www.libreoffice.org/download/) if it's installed. Each file has zoom, **Download as PDF** (or the original), Open in its app and Expand. Pick **All screens** to see every page and image side by side on one board. Pages open in a locked-down view that can only show files from that folder; a link to the web opens in your browser instead. "Send with screenshot" sends the Lead or worker a note with a picture of exactly what you see, so they can fix what you point at. Running the app itself (a dev server, Expo on your phone) is planned next.

### Agency pages

Some agencies get an extra tab on their Agency screen, built from shared page types:

| Agency | Page | Reads |
|---|---|---|
| App Development, Mobile Apps, Web Design | Screens | every page, image, PDF and Markdown file in the folder, opened in the Preview frame at Desktop, Tablet or Phone width |
| Sales & Lead Gen | Pipeline (table) | `data/pipeline.json` |
| SEO | Keywords (table) | `data/keywords.json` |
| QA & Testing | Test results (table) | `data/tests.json` |
| DevOps | Environments (table) | `data/environments.json` |
| Social Media Marketing | Calendar | `data/calendar.json` |

A table file is `{ "columns": [...], "rows": [...] }`; the calendar file is `{ "items": [{ "date", "channel", "title", "state" }] }`, with state draft, approved, scheduled or posted. The agency's agents keep these files up to date with their file tools, and the tab refreshes when a file changes. Email Marketing's Campaigns page comes later.

### Files

Files is a small code editor for the agency's folder: an Explorer, search in files, and Source control that runs your own installed git (stage, commit, branches, pull, push, history). Edit, diff and preview files in tabs. Your edits save directly; agents' changes still come to you for review. While an agent is working in the folder, files are read-only and commits wait. Commits use your own git name and email; push and pull use git's own sign-in, and Tyslin never asks for or stores a git password or token.

### Memory

Each agency keeps memory as plain Markdown in its folder, under `memory/`: `agency.md` for notes every agent should know, and one file per agent. Tyslin adds them to the agent's instructions on every run. Edit them in the agency's Memory tab or any editor; they also show in Files and sync with Google Drive.

### Connectors

Agents on Claude Code, Codex or Gemini CLI can use tools from other apps through MCP servers. Open an agency → Connectors: connect GitHub, Linear or Stripe with a token, search the official [MCP Registry](https://registry.modelcontextprotocol.io) and install a server from there, or add any MCP server yourself (a remote address or a command on this computer), then switch it on per agent. Each agency suggests the integrations that fit its work. Registry servers are published by companies and the community and aren't reviewed by Tyslin; check the publisher and source before installing. Tokens are encrypted with your keychain and sent only to that server. Agents on the built-in models don't use integrations yet.

### Budget and usage

Every run is recorded in a cost ledger: agency, task, card, agent, adapter, provider, model, tokens and cost. A cost is **actual** when the provider billed it to Tyslin's own runtime (OpenRouter reports the charge), **estimated** when it comes from Tyslin's price list or the adapter's own figure (Claude Code), and **not reported** when nothing was given (Codex, Gemini CLI, models missing from the price list); it is never shown as $0. Agency → **Budget** has the monthly cap and alert threshold (80% by default), spend this month with the reset date, a daily chart and every run. At the threshold, Home shows it under Needs you; at the cap, new cards wait (a running card always finishes) and the Lead's message card asks you to raise the cap or keep it paused until the 1st. Spend resets on the 1st of each month, local time. A run refused for lack of credit also shows on Home. A task's Details panel shows its cost per worker, and Settings → **Usage** lists this month by agency and provider for the organization.

## Your data

- One local SQLite database per organization, in the app's data folder (Settings → About → Open folder).
- One folder per agency under `Documents/Tyslin Studio/<organization>/<agency>/`, with its board, its `memory/` notes and the files its agents make.
- API keys are encrypted with your operating system's keychain.
- The app contacts only: the model providers and adapters you set up; GitHub, for updates, skill packs and the star count; Telegram or Slack, if you connect a channel; the MCP servers you add under Connectors; Google, if you sign in or connect Google Drive sync.
- No analytics. Nothing is collected about how you use the app.

## Build from source

Requires Node.js 22 (the version the release builds use) and npm.

```bash
git clone https://github.com/ReactiveSpace2/tyslin-studio.git
cd tyslin-studio
npm install        # also rebuilds the SQLite driver for Electron
npm run dev        # the app with hot reload
npm run typecheck  # run after every change
```

The interface is React with Tailwind CSS v4 and shadcn/ui (Radix) components only (`src/renderer/src/components/ui/`), themed with Tyslin's colour tokens in `src/renderer/src/index.css`. The window is one shadcn sidebar (Home, Agencies, Scheduled, Files, recent tasks) beside the screen: Home, a task, or an agency.

Running from a VS Code terminal? VS Code sets `ELECTRON_RUN_AS_NODE=1`, which stops Electron from opening a window. Start it with `env -u ELECTRON_RUN_AS_NODE npm run dev`.

Installers:

```bash
npm run dist:linux   # .AppImage, .deb and .snap
npm run dist:mac     # .dmg and .zip (run on macOS)
npm run dist:win     # .exe installer (run on Windows)
```

Output goes to `dist/`. Build each installer on its own platform; the release workflow in `.github/workflows/release.yml` builds all three when a `v*` tag is pushed.

## Roadmap

1. Runs while the app is closed: the Lead's scheduled runs and auto-run keep going when the window is shut.
2. Cost ledger on Home: spend per agency, agent and model.
3. Agents that write their own memory notes and propose new skills from your feedback (memory files exist today; you write the notes).
4. Integrations for the Lead too, and sign-in for MCP servers that need it (OAuth).
5. Discord and Email channels, next to Telegram and Slack.
6. Hosted plan: the same agencies with no setup, with a ready-made app catalogue.

Assistants, Automation, Canvas and Mind mapper from earlier versions are archived in `archive/`. On 10 Nov 2026 the app was rebuilt around Home, Task and Agency; the projects screens, assistants, Builder and the Studio assistant were retired (older databases keep their rows, hidden), and the Overview, Kanban, Live, Inbox and Channel screens folded into the task. Some may return.

## Contributing

Pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has the ten-minute setup, where things live, the rules that keep the app consistent and the three easiest contributions: an agency template, a skill, a connector preset. Issues labelled [good first issue](https://github.com/ReactiveSpace2/tyslin-studio/labels/good%20first%20issue) name the file to touch and how to check the result. Report bugs and ideas in [GitHub Issues](https://github.com/ReactiveSpace2/tyslin-studio/issues); security problems go to the address in [SECURITY.md](SECURITY.md), not to a public issue. Keep changes small and run `npm run typecheck`.

If Tyslin is useful to you, [star the repo](https://github.com/ReactiveSpace2/tyslin-studio). It is how other people find it.

**Add an agency template.** Create one file in `src/shared/agencies/` exporting an `AgencyTemplate` (see `src/shared/agencies.ts` for the type), and add it to `AGENCY_TEMPLATES` there. The roster lists the Lead first, with `engine: 'builtin'` and `lead: true`; workers run on `claude-code`, `codex` or `gemini-cli`. Set `group` (`software`, `documents` or `marketing`) and `comingSoon: true` to show it without letting people create it yet. Name agents by first name and job (they show as "Sam (Backend)"), give each a different head from `src/shared/heads.ts`, and start each of the five plan steps with the first name of the member who does it. Every name in `skills` must be a built-in skill. Then run `node scripts/readme-agencies.mjs --write`.

**Add a skill.** Built-in skills live in `src/main/seedSkills.ts` and `src/main/seedSkillsAgencies.ts`. Names are kebab-case and a skill body is at most 40,000 characters. Bump `SKILL_LIBRARY_VERSION` in `seedSkills.ts` so existing installs get the new skill. Write skills fresh; don't copy them from other products.

## Licence

[PLACEHOLDER — licence not chosen yet]

The Tyslin name, logo and mascot in `resources/brand` and `src/renderer/src/assets` are © ReactiveSpace and not covered by the code licence.

---

<p align="center">
  <a href="https://tyslin.ai">tyslin.ai</a> · <a href="mailto:info@tyslin.ai">info@tyslin.ai</a> · <a href="https://x.com/tyslinai">X @tyslinai</a> · <a href="https://t.me/tyslinai">Telegram @tyslinai</a><br>
  A <a href="https://reactivespace.com">ReactiveSpace</a> product
</p>
