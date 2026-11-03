# Tyslin Studio

**Every agent you run. One studio.**

Tyslin Studio is an open-source studio for building and working with AI agents. Give each agent a job, instructions, skills, a model you pick and a character, link your projects, and work with your agents in chat. Free and self-hosted as a desktop app; a hosted plan is coming for teams that don't want setup.

Runs entirely on your computer: agents, chats, projects and skills are stored in a local SQLite database, and API keys are encrypted with your system keychain.

A ReactiveSpace product · [tyslin.ai](https://tyslin.ai) · info@tyslin.ai · X and Telegram [@tyslinai](https://x.com/tyslinai)

## Download

Get the latest installer from [Releases](https://github.com/Umar-Abbas/tyslin-studio/releases/latest).

| Platform | File |
|---|---|
| macOS (Apple silicon) | `Tyslin-Studio-<version>-mac-arm64.dmg` |
| macOS (Intel) | `Tyslin-Studio-<version>-mac-x64.dmg` |
| Windows 10/11 | `Tyslin-Studio-<version>-windows-x64-setup.exe` |
| Linux (any distro) | `Tyslin-Studio-<version>-linux-x86_64.AppImage` |
| Linux (Debian, Ubuntu) | `Tyslin-Studio-<version>-linux-amd64.deb` |

Early builds are not code-signed yet:

- **macOS:** right-click the app in Applications and choose **Open**, then **Open** again. If macOS still blocks it, run `xattr -cr "/Applications/Tyslin Studio.app"`.
- **Windows:** on the SmartScreen prompt choose **More info**, then **Run anyway**.
- **Linux:** `chmod +x Tyslin-Studio-*.AppImage` and run it, or `sudo apt install ./Tyslin-Studio-*.deb`.

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

Open **Settings** in the app and add an Anthropic or OpenAI key, or point it at a running Ollama (`http://localhost:11434`).

## Build installers

```bash
npm run dist:mac     # .dmg
npm run dist:win     # .exe (NSIS installer)
npm run dist:linux   # .AppImage and .deb
```

Output goes to `dist/`. Running from a VS Code terminal? Use `env -u ELECTRON_RUN_AS_NODE npm run dev` (VS Code sets that variable and it stops Electron from starting).

## Releasing

Releases are built by GitHub Actions (`.github/workflows/release.yml`) on macOS, Windows and Linux runners, and the installers are attached to the GitHub Release automatically.

```bash
# bump "version" in package.json, commit, then:
git tag v0.1.0
git push origin v0.1.0
```

The workflow can also be started by hand from the **Actions** tab (Release → Run workflow → enter the tag).

For public releases, sign the builds: an Apple Developer ID (plus notarisation) for macOS and a code-signing certificate for Windows. Without them users see security warnings.

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
