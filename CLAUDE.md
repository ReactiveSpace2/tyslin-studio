# Tyslin Studio — CLAUDE.md

Shared by both Tyslin repositories: the **landing site** (tyslin.ai) and the **desktop app**. The product, brand and voice sections apply to both. Then read the section for the repo you are in.

## Product

- **Name:** Tyslin Studio. Brand: Tyslin. Domain: tyslin.ai. Tagline: "Every agent you run. One studio."
- **What it is:** an open-source studio for building and working with AI agents. Each agent has a job, instructions, skills, tools, a model the user picks, and a character.
- **Who it's for:** founders, builders and small teams who want AI agents doing real work without stitching tools together.
- **Model:** open source (free, self-hosted desktop app) plus a paid hosted plan (no setup, managed models, team features). Vertical agent packs (for example a Startup Visa pack) are a planned add-on.
- **Owner:** ReactiveSpace (Dubai). Contact info@tyslin.ai · X and Telegram @tyslinai.
- **Inspiration:** Block's open-source Berd (github.com/block/berd). Tyslin is its own product; never copy Berd's code, characters (Gloopies) or copy.

## Brand rules (both repos)

- **Colours**
  - Parchment `#FAFAF7` — page background
  - Ink `#0F0F0D` — text, dark buttons
  - Lime `#7DB800` — fills only, and always with Ink text on top (never lime text)
  - Dark green `#4A7000` — green text, links, lines
  - Supporting neutrals: panel `#F3F3EE`, border `#E4E4DD`, muted text `#5C5C57`
- **Type:** Geist for text, Geist Mono for numbers, labels, model names and code.
- **Logo:** robot mascot (white helmet, lime crest and ear pieces, black visor, lime square eyes) with the TYSLIN wordmark. Files: icon, mark, horizontal, stacked, wordmark black, wordmark white. Never recolour, stretch or redraw the mascot.
- **Agent characters:** simple robot shapes in the brand colours (block, round, hex, pill × lime, ink, paper). The mascot is reserved for Builder, the built-in agent.
- **Style:** calm, light, lots of whitespace, rounded cards (12–16 px radius), thin borders, no gradients, no emoji, inline stroke SVG icons.
- **Accessibility:** text contrast 4.5:1 minimum, real buttons and links, labels on every input, touch targets 44 px.

## Voice

Plain, confident, short. Talk about the work agents do, not about AI. Prefer "your agents" over "AI assistants". No hype words ("revolutionary", "supercharge", "unleash"). No invented numbers or testimonials; use `[PLACEHOLDER]` until real ones exist.

## Repo: desktop app (`tyslin-studio`)

Electron + React + TypeScript, built with electron-vite. Local SQLite (better-sqlite3).

- `npm install` · `npm run dev` · `npm run typecheck` (run after every change) · `npm run build` · `npm run dist:mac|win|linux`
- Running from a VS Code terminal or extension: VS Code sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as plain Node and crash with `Cannot read properties of undefined (reading 'whenReady')`. Use `env -u ELECTRON_RUN_AS_NODE npm run dev`.
- `.dmg` builds need a Mac; build all platforms in CI (GitHub Actions) for releases.
- `src/main/` Node side, the only place that touches the DB, files, network and secrets
  - `db.ts` schema (`migrate`), seed data, all queries
  - `runtime.ts` `AgentRuntime` interface; Anthropic and OpenAI-compatible (OpenAI, Ollama) streaming runtimes
  - `secrets.ts` API keys encrypted with Electron `safeStorage`
  - `index.ts` window and every `ipcMain.handle` channel
- `src/preload/index.ts` exposes `window.tyslin`, typed by `TyslinApi` in `src/shared/types.ts`
- `src/renderer/src/` React UI. Never import Node or Electron here; go through `window.tyslin`
- Brand tokens live as CSS variables in `src/renderer/src/styles.css`; logos in `src/renderer/src/assets/`; app icon `resources/icon.png`

**Adding a feature that needs data:** type in `shared/types.ts` → query in `db.ts` (new tables in `migrate` with `CREATE TABLE IF NOT EXISTS`) → `ipcMain.handle` in `main/index.ts` → expose in `preload/index.ts` → use in the renderer.

## Repo: landing site (tyslin.ai)

- Folder: `tyslin-web`. Stack: Next.js 16 (App Router, TypeScript), fully static pages; Geist via the `geist` package.
- Commands: `npm run dev` (http://localhost:3000) · `npm run build` · `npm start`
- Content lives in `lib/site.ts` (name, URL, contacts, colours) and `lib/content.ts` (features, steps, FAQ).
- Hosting: Google Cloud Run service `tyslin-web`, project `tyslin-auth`, region `us-central1`. No load balancer, no database. Deploy:
  `gcloud run deploy tyslin-web --source . --region us-central1 --project tyslin-auth --allow-unauthenticated`
- Domains: `tyslin.ai` and `www.tyslin.ai` use Cloud Run domain mappings (Google-managed certificates). DNS is at Namecheap: `@` A/AAAA to Google's 216.239.32/34/36/38.21 addresses, `www` CNAME to `ghs.googlehosted.com.`
- Pages today: one landing page with waitlist form. Planned: download, pricing (open source vs hosted), docs link, GitHub link, contact.
- Download buttons point to the desktop app's GitHub Releases (`.dmg`, `.exe`, `.AppImage`).
- Use the same colour tokens and fonts as the app so the site and product feel like one thing.
- Hero copy anchors on the tagline: "Every agent you run. One studio."

## Working rules

- Keep changes small and focused; don't reformat unrelated code.
- Typecheck/build before saying something is done.
- Never commit API keys or `.env` files.
- Ask before changing brand colours, the logo, pricing or the license.
