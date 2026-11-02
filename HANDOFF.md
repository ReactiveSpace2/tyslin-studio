# Tyslin Studio — Handoff

*Every agent you run. One studio.*

Date: 3 November 2026 · Owner: Umar Abbas (CTO, ReactiveSpace) · umar@reactivespace.com

## 1. The idea in one paragraph

Tyslin Studio is an open-source studio for building and working with AI agents. Users create a crew of agents (each with a job, instructions, skills, tools, a model and a robot character), link projects to folders, and work with the agents in chat. It is inspired by Block's open-source Berd, but is its own product with its own brand. It runs free and self-hosted as a desktop app, with a paid hosted plan for people who don't want setup.

## 2. Decisions made

| Topic | Decision |
|---|---|
| Name | **Tyslin Studio**, tagline "Every agent you run. One studio." (confirmed) |
| Domain | tyslin.ai |
| Business model | Open source + hosted plan (open core). Vertical agent packs as a later add-on |
| First platform | Desktop app (Electron) with built-in SQLite; same React UI reused for the hosted web version later |
| Agent engine | Direct model calls now; Goose (Agent Client Protocol) as the next runtime for real tools |
| Models | Bring your own key: Anthropic (Claude), OpenAI, local via Ollama |
| Brand | Parchment / Ink / Lime / Dark green, Geist + Geist Mono, robot mascot logo |

## 3. Still open

- **License.** AGPL-3.0 recommended (free to self-host; others offering it as a hosted service must share changes). Alternatives: Apache 2.0 (more adoption, no protection) or fair-code.
- **Trademark** registration for the name.
- **Code signing:** Apple Developer account ($99/year) and a Windows certificate before public release.
- **Hosted plan** pricing and what's free vs paid.
- **Landing site** stack.

## 4. What exists today

**Desktop app** (`tyslin-studio.zip`, git repo)
- Electron + React + TypeScript (electron-vite); typechecks and builds cleanly.
- SQLite database: agents, projects, sessions, messages, skills, settings.
- Agents: create, edit, delete; character picker (4 shapes × 3 colours); Builder uses the mascot.
- Chat: streamed replies, saved history per agent and project.
- Projects: linked to a folder; agents see the file list.
- Skills: reusable instructions added to the agent's prompt (3 seeded).
- Settings: API keys encrypted with the OS keychain; Ollama URL.
- Packaging: `npm run dist:mac|win|linux`.
- Not yet tested by launching Electron on a real machine; first run should be on the Mac.

**Design concept** — a 3-screen clickable canvas (Agents home, Working with an agent, Build an agent) in the Tyslin brand.

**Brand files** — icon, mark, horizontal logo, stacked logo, black and white wordmarks.

## 5. Next steps, in order

1. **First run** — unzip, `npm install`, `npm run dev`, add a key, chat with Builder. Fix anything that breaks on macOS/Windows.
2. **Goose runtime** — implement `AgentRuntime` in `src/main/runtime.ts` over ACP with `goose` bundled as a sidecar binary. This unlocks file editing, terminal commands and MCP connectors.
3. **Tool permissions UI** — per-agent toggles (files, web, terminal, connectors) and "ask before acting" prompts.
4. **Skills editor** — create/import skills as Markdown with frontmatter.
5. **Scheduler** — run agents on their saved schedule (already stored on each agent).
6. **Hand-offs** — pass one agent's output to another ("Hand to Writer").
7. **Landing site** on tyslin.ai with download buttons pointing to GitHub Releases.
8. **Public release** — license, code signing, auto-update (`electron-updater`), GitHub repo.
9. **Hosted plan** — Postgres behind the same `db.ts` functions, auth, billing, web build of the UI.

## 6. How to work on it

- Put `CLAUDE.md` in the root of both the app and the landing repo; it holds the brand, voice and architecture.
- Ask Claude Code for one step at a time from section 5, e.g. "Implement step 2: a Goose ACP runtime behind the AgentRuntime interface."
- Run `npm run typecheck` after every change.

## 7. Name (decided: Tyslin Studio)

| Option | Verdict |
|---|---|
| Tyslin AI | Fine as the company/brand, but "AI" is redundant with tyslin.ai and says nothing about what it does |
| Tyslin Agent Studio | Clear but long; "Agent Studio" is generic and used by Microsoft, Google and others |
| Tyslin AI Agent Studio | Too long for an app name or dock icon |
| **Tyslin Studio** | **Chosen.** Short, fits the dock and installers, the tagline explains "agents", and it leaves room for more Tyslin products |

Suggested usage: brand **Tyslin**, product **Tyslin Studio**, domain **tyslin.ai**, tagline **"Every agent you run. One studio."**
