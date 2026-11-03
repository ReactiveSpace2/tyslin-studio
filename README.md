# Tyslin Studio

**Every agent you run. One studio.**

Tyslin Studio is a desktop studio for building and working with AI agents. Runs entirely on your computer: agents, chats, projects and skills are stored in a local SQLite database, and API keys are encrypted with your system keychain.

A ReactiveSpace product · [tyslin.ai](https://tyslin.ai) · info@tyslin.ai

## What works today

- **Agents** — create, edit and delete agents with a name, instructions, provider, model, skills, schedule and a character (shape + colour). Builder, the built-in agent, uses the Tyslin mascot.
- **Chat** — streamed conversations with any agent; history is saved per agent and project.
- **Projects** — link a folder on disk; agents in that project see its file list.
- **Skills** — reusable instruction blocks added to an agent's system prompt.
- **Providers** — Anthropic (Claude), OpenAI, and local models through Ollama.
- **Local-first** — SQLite database at the app's user-data folder (`tyslin.db`); no server needed.

## Requirements

- Node.js 20 or 22
- For packaging: macOS for `.dmg`, Windows for `.exe` (or CI runners for each)

## Run it

```bash
npm install        # also rebuilds the SQLite driver for Electron
npm run dev        # starts the app with hot reload
```

Running from a VS Code terminal? VS Code sets `ELECTRON_RUN_AS_NODE=1`, which stops Electron from opening a window. Start it with `env -u ELECTRON_RUN_AS_NODE npm run dev` instead.

Open **Settings** in the app and add an Anthropic or OpenAI key, or point it at a running Ollama (`http://localhost:11434`).

## Build installers

```bash
npm run dist:mac     # .dmg
npm run dist:win     # .exe (NSIS installer)
npm run dist:linux   # .AppImage and .deb
```

Output goes to `dist/`. Build each installer on its own platform (`.dmg` requires macOS); GitHub Actions can build all three for a release. For public releases, sign the builds: an Apple Developer ID (plus notarisation) for macOS and a code-signing certificate for Windows. Without them users see security warnings.

## Project layout

```
src/
  main/        Electron main process
    index.ts     window + IPC handlers
    db.ts        SQLite schema, seed data and queries
    runtime.ts   AgentRuntime interface + Anthropic / OpenAI-compatible runtimes
    secrets.ts   API keys encrypted with Electron safeStorage
  preload/     safe bridge exposing window.tyslin to the UI
  renderer/    React UI (pages: Agents, Chat, Agent editor, Skills, Settings)
  shared/      types shared by all three
resources/     app icon and brand files
```

## Roadmap (next steps)

1. **Goose runtime** — implement `AgentRuntime` over Goose's Agent Client Protocol (ACP), running `goose` as a bundled sidecar. This gives agents real tools: reading/writing files, running commands, MCP connectors.
2. **Scheduler** — run agents on their saved schedule.
3. **Agent hand-offs** — pass a result from one agent to another.
4. **Skills editor** — create and import skills (Markdown with frontmatter).
5. **Hosted plan** — swap SQLite for Postgres behind the same `db.ts` interface and serve the same React UI from a web server with auth and billing.

## License

To be decided before the first public release (AGPL-3.0 is the usual choice for open source with a hosted plan).

Brand assets in `resources/brand` and `src/renderer/src/assets` are © ReactiveSpace and not covered by the code license.
