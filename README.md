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

Everything runs on your computer. Agents, chats, projects and skills live in a local SQLite database, and your API keys are encrypted with your system keychain. Bring your own key for Anthropic (Claude), OpenAI or Google Gemini, or run models locally with Ollama.

> **Status: early preview (v0.1.0).** Tested on Linux. macOS and Windows builds are not yet tested or signed. Expect rough edges and breaking changes.

## What works today

- **Agents:** create, edit and delete agents with a name, instructions, provider, model, skills, schedule and a character (shape and colour). Builder, the built-in agent, uses the Tyslin mascot.
- **Chat:** streamed conversations with any agent; history is saved per agent and project.
- **Projects:** link a folder on disk; agents in that project can list, read and change its files.
- **Review before it's written:** when an agent wants to change a file, you see a diff first and accept or reject each change, or all at once. The agent hears what you decided and carries on. Each agent can be switched to "Write directly" instead.
- **Skills:** reusable instruction blocks added to an agent's system prompt. 23 are built in: meeting notes, follow-up emails, meeting prep, daily plans, weekly updates, decision memos, research, competitor briefs, feedback themes, outreach, objection replies, lead qualifying, one-pagers, slide outlines, editing, data analysis, careful file edits and more. Create, edit, search and delete skills in the app, or import and export them as Markdown files (frontmatter `name` and `description`, then the instructions).
- **Providers:** Anthropic (Claude), OpenAI, Google Gemini (key from Google AI Studio), and local models through Ollama.
- **Settings:** API keys and Ollama; defaults for new agents and guidelines added to every agent's instructions; update status, app version and where your data lives.
- **Local-first:** one SQLite file (`tyslin.db`) in the app's user-data folder; no server, no account.

## Download

Get the latest installer from [tyslin.ai](https://tyslin.ai/#download) or [GitHub Releases](https://github.com/Umar-Abbas/tyslin-studio/releases/latest).

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

### Updates

From v0.2.0, Tyslin Studio checks GitHub Releases when it starts.

- **Windows and Linux AppImage:** the update downloads in the background; restart when prompted to install it.
- **macOS and Linux .deb:** the app tells you a new version is available and links to the download. (Automatic install on macOS needs a signed build, which is coming.)

If you're on v0.1.0, download the new version once by hand; updates after that arrive in the app.

## Run from source

Requires Node.js 20 or 22.

```bash
git clone https://github.com/Umar-Abbas/tyslin-studio.git
cd tyslin-studio
npm install        # also rebuilds the SQLite driver for Electron
npm run dev        # starts the app with hot reload
```

Running from a VS Code terminal? VS Code sets `ELECTRON_RUN_AS_NODE=1`, which stops Electron from opening a window. Start it with `env -u ELECTRON_RUN_AS_NODE npm run dev` instead.

Then open **Settings** and add an Anthropic, OpenAI or Gemini key, or point it at a running Ollama (`http://localhost:11434`), and say hello to Builder.

## Build installers

```bash
npm run dist:linux   # .AppImage and .deb
npm run dist:mac     # .dmg (run on macOS)
npm run dist:win     # .exe NSIS installer (run on Windows)
```

Output goes to `dist/`. Build each installer on its own platform; GitHub Actions can build all three for a release. Public releases need signing (an Apple Developer ID with notarisation for macOS, a code-signing certificate for Windows), otherwise users see security warnings.

## Releasing

Releases are built by GitHub Actions (`.github/workflows/release.yml`) on macOS, Windows and Linux runners. The installers, plus the update files the app reads (`latest*.yml`, `*.blockmap` and the macOS `.zip`), are attached to the GitHub Release automatically.

```bash
# 1. bump "version" in package.json (e.g. 0.2.0) and commit
# 2. tag that commit with the same version and push the tag
git tag v0.2.0
git push origin v0.2.0
```

The tag must match `package.json`; installed apps compare their own version against the newest release. The workflow can also be started by hand from the **Actions** tab (Release → Run workflow → enter the tag).

## Project layout

```
src/
  main/        Electron main process (the only code that touches DB, files, network, secrets)
    index.ts     window + IPC handlers
    db.ts        SQLite schema, seed data and queries
    runtime.ts   AgentRuntime interface + Anthropic / OpenAI-compatible (OpenAI, Gemini, Ollama) runtimes (tool loop, run events)
    tools.ts     project file tools; staged writes and the review hand-back
    skillFiles.ts  skill Markdown import/export and validation
    seedSkills.ts  built-in skill library (versioned; new skills reach existing installs)
    secrets.ts   API keys encrypted with Electron safeStorage
  preload/     safe bridge exposing window.tyslin to the UI
  renderer/    React UI (Agents, Chat, Agent editor, Skills, Settings with Models / Agents / About & updates tabs)
  shared/      types shared by all three, plus diff.ts (hunk split and apply, used by main and UI)
resources/     app icon and brand files
```

Runtimes report progress as a typed event stream shaped like AG-UI events (`RunEvent` in `shared/types.ts`: run_started, text_delta, tool_call_start/args/end, tool_result, approval_needed, state_update, run_finished, run_error). The UI listens to that stream only.

Adding a feature that needs data: type in `shared/types.ts` → query in `db.ts` → `ipcMain.handle` in `main/index.ts` → expose in `preload/index.ts` → use in the renderer. Run `npm run typecheck` after every change.

## Roadmap

1. **Goose runtime:** run agents over Goose's Agent Client Protocol (ACP) with `goose` bundled as a sidecar, so agents can run commands and use MCP connectors (file reading and writing already work).
2. **Tool permissions:** per-agent toggles for files, web, terminal and connectors, with "ask before acting".
3. **Scheduler:** run agents on their saved schedule.
4. **Hand-offs:** pass one agent's result to another.
5. **Releases:** signed installers and auto-update.
6. **Hosted plan:** the same UI on the web, with Postgres, accounts and billing, for people who don't want to self-host.

## Contributing

Issues and ideas are welcome. Pull requests will open once the license is set. Keep changes small and focused, and run `npm run typecheck` before submitting.

## License

The code license will be set before the first public release (AGPL-3.0 is planned).

Brand assets in `resources/brand` and `src/renderer/src/assets` (the Tyslin name, logo and mascot) are © ReactiveSpace and not covered by the code license.
