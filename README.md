<p align="center">
  <img src="resources/brand/logo-beta.png" alt="Tyslin Studio beta" width="360">
</p>

<h1 align="center">Tyslin Studio</h1>

<p align="center"><strong>Every agent you run. One studio.</strong></p>

<p align="center">
  <a href="https://tyslin.ai">tyslin.ai</a> · info@tyslin.ai · A ReactiveSpace product
</p>

---

Tyslin Studio is an open-source desktop studio for building and working with AI agents. Give each agent a job, instructions, skills, a model and a character, link it to your projects, and work with it in chat.

Everything runs on your computer. Agents, chats, projects and skills live in a local SQLite database, and your API keys are encrypted with your system keychain. Bring your own key for Anthropic (Claude) or OpenAI, or run models locally with Ollama.

> **Status: early preview (v0.1.0).** Tested on Linux. macOS and Windows builds are not yet tested or signed. Expect rough edges and breaking changes.

## What works today

- **Agents:** create, edit and delete agents with a name, instructions, provider, model, skills, schedule and a character (shape and colour). Builder, the built-in agent, uses the Tyslin mascot.
- **Chat:** streamed conversations with any agent; history is saved per agent and project.
- **Projects:** link a folder on disk; agents in that project see its file list.
- **Skills:** reusable instruction blocks added to an agent's system prompt (three included).
- **Providers:** Anthropic (Claude), OpenAI, and local models through Ollama.
- **Local-first:** one SQLite file (`tyslin.db`) in the app's user-data folder; no server, no account.

## Install

Installers will be published on [GitHub Releases](https://github.com/Umar-Abbas/tyslin-studio/releases) (`.dmg`, `.exe`, `.AppImage`, `.deb`). Until then, build from source as below.

## Run from source

Requires Node.js 20 or 22.

```bash
git clone https://github.com/Umar-Abbas/tyslin-studio.git
cd tyslin-studio
npm install        # also rebuilds the SQLite driver for Electron
npm run dev        # starts the app with hot reload
```

Running from a VS Code terminal? VS Code sets `ELECTRON_RUN_AS_NODE=1`, which stops Electron from opening a window. Start it with `env -u ELECTRON_RUN_AS_NODE npm run dev` instead.

Then open **Settings** and add an Anthropic or OpenAI key, or point it at a running Ollama (`http://localhost:11434`), and say hello to Builder.

## Build installers

```bash
npm run dist:linux   # .AppImage and .deb
npm run dist:mac     # .dmg (run on macOS)
npm run dist:win     # .exe NSIS installer (run on Windows)
```

Output goes to `dist/`. Build each installer on its own platform; GitHub Actions can build all three for a release. Public releases need signing (an Apple Developer ID with notarisation for macOS, a code-signing certificate for Windows), otherwise users see security warnings.

## Project layout

```
src/
  main/        Electron main process (the only code that touches DB, files, network, secrets)
    index.ts     window + IPC handlers
    db.ts        SQLite schema, seed data and queries
    runtime.ts   AgentRuntime interface + Anthropic / OpenAI-compatible runtimes
    secrets.ts   API keys encrypted with Electron safeStorage
  preload/     safe bridge exposing window.tyslin to the UI
  renderer/    React UI (Agents, Chat, Agent editor, Skills, Settings)
  shared/      types shared by all three
resources/     app icon and brand files
```

Adding a feature that needs data: type in `shared/types.ts` → query in `db.ts` → `ipcMain.handle` in `main/index.ts` → expose in `preload/index.ts` → use in the renderer. Run `npm run typecheck` after every change.

## Roadmap

1. **Goose runtime:** run agents over Goose's Agent Client Protocol (ACP) with `goose` bundled as a sidecar, so agents can read and write files, run commands and use MCP connectors.
2. **Tool permissions:** per-agent toggles for files, web, terminal and connectors, with "ask before acting".
3. **Skills editor:** create and import skills as Markdown with frontmatter.
4. **Scheduler:** run agents on their saved schedule.
5. **Hand-offs:** pass one agent's result to another.
6. **Releases:** signed installers and auto-update.
7. **Hosted plan:** the same UI on the web, with Postgres, accounts and billing, for people who don't want to self-host.

## Contributing

Issues and ideas are welcome. Pull requests will open once the license is set. Keep changes small and focused, and run `npm run typecheck` before submitting.

## License

The code license will be set before the first public release (AGPL-3.0 is planned).

Brand assets in `resources/brand` and `src/renderer/src/assets` (the Tyslin name, logo and mascot) are © ReactiveSpace and not covered by the code license.
