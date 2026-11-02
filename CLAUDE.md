# Tyslin AI — notes for Claude Code

Tyslin AI is an open-source desktop studio for building and working with AI agents (a ReactiveSpace product, tyslin.ai). Electron + React + TypeScript, local SQLite, built with electron-vite.

## Commands
- `npm install` — install deps (postinstall rebuilds better-sqlite3 for Electron)
- `npm run dev` — run the app with hot reload
- `npm run typecheck` — TypeScript check for main/preload and renderer; run after every change
- `npm run build` — production build to `out/`
- `npm run dist:mac | dist:win | dist:linux` — installers to `dist/`

## Architecture
- `src/main/` runs in Node (Electron main). Only place that touches the DB, files, network and secrets.
  - `db.ts` SQLite schema (`migrate`), seed data (`seed`), and all queries.
  - `runtime.ts` `AgentRuntime` interface + Anthropic and OpenAI-compatible (OpenAI, Ollama) streaming runtimes.
  - `secrets.ts` API keys encrypted with `safeStorage`.
  - `index.ts` window + every `ipcMain.handle` channel.
- `src/preload/index.ts` exposes `window.tyslin` (typed by `TyslinApi` in `src/shared/types.ts`).
- `src/renderer/src/` React UI. Never import Node or Electron here; go through `window.tyslin`.
- `src/shared/types.ts` single source of truth for data types and the IPC API.

## Adding a feature that needs data
1. Add the type / API method to `src/shared/types.ts`.
2. Add the query in `src/main/db.ts` (new tables go in `migrate`, using `CREATE TABLE IF NOT EXISTS`; add columns with guarded `ALTER TABLE`).
3. Register an `ipcMain.handle` channel in `src/main/index.ts`.
4. Expose it in `src/preload/index.ts`.
5. Use it from the renderer.

## Brand (keep consistent)
- Colours (CSS variables in `src/renderer/src/styles.css`): Parchment #FAFAF7 background, Ink #0F0F0D text and dark buttons, Lime #7DB800 fills only (always ink text on top), Dark green #4A7000 for green text and lines.
- Fonts: Geist (text), Geist Mono (numbers, labels, model names).
- Logos in `src/renderer/src/assets/` and `resources/brand/`; app icon `resources/icon.png`.
- No emoji in the UI; icons are inline stroke SVGs in `components/Icon.tsx`.

## Roadmap
See README.md: Goose (ACP) runtime, scheduler, agent hand-offs, skills editor, hosted (web + Postgres) version.
