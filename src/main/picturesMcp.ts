/**
 * Tyslin's pictures tool (owner, 18 Nov 2026): a small MCP server over stdio that the Design and Web Design teams'
 * workers get (assets.ts picturesServer). Started by the agent's adapter as `<Tyslin> picturesMcp.js` with
 * ELECTRON_RUN_AS_NODE=1, so it is plain Node: no Electron, no database. Its environment carries the user's Unsplash
 * key (TYSLIN_UNSPLASH_KEY), the project's shared Assets folder (TYSLIN_ASSETS_DIR) and the team's name (TYSLIN_TEAM);
 * the key never goes into the conversation.
 * Tools: search_photos, use_photo (tells Unsplash, saves a copy in Assets/unsplash/ and its credit), list_assets.
 */
import { createInterface } from 'readline'
import { join } from 'path'
import { addCredit, ASSETS_URL_PREFIX, listAssets, safeFileName, saveAsset } from './assetStore'
import { getPhoto, photoBytes, searchPhotos, trackDownload, type Orientation } from './unsplashApi'

type Json = Record<string, unknown>
type Rpc = { jsonrpc: '2.0'; id?: number | string; method?: string; params?: Json }

export const PICTURE_TOOLS = [
  {
    name: 'search_photos',
    description: 'Search Unsplash for free photos. Returns each photo\'s id, a description, its size and the photographer. Pick one, then call use_photo with its id before putting it on a page.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the photo shows, in a few plain words ("electric bus in a city street").' },
        orientation: { type: 'string', enum: ['landscape', 'portrait', 'squarish'], description: 'Landscape for wide heroes and banners, portrait for stories and phones, squarish for square posts.' },
        count: { type: 'number', description: 'How many results, 1 to 20 (default 8).' },
        page: { type: 'number', description: 'Page of results, from 1.' }
      },
      required: ['query']
    }
  },
  {
    name: 'use_photo',
    description: 'Use an Unsplash photo: tells Unsplash it was chosen, saves a copy in the project\'s shared Assets folder for every team, and returns the address to put in your HTML and the credit line to show with it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The photo id from search_photos.' },
        name: { type: 'string', description: 'A short file name for the shared copy, without extension ("hero-bus").' }
      },
      required: ['id']
    }
  },
  {
    name: 'list_assets',
    description: 'List the pictures in the project\'s shared Assets folder (from every team), with their credits.',
    inputSchema: { type: 'object', properties: {} }
  }
]

export type PictureEnv = { key: string; assetsDir: string; team: string }

const text = (t: string, isError = false): Json => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) })

export async function callPictureTool(name: string, args: Json, env: PictureEnv): Promise<Json> {
  try {
    if (name === 'list_assets') {
      const list = listAssets(env.assetsDir, 200)
      if (!list.length) return text(`The shared Assets folder (${env.assetsDir}) has no pictures yet.`)
      return text([`Shared Assets folder: ${env.assetsDir}`, `On pages and artboards, show a picture from here at /${ASSETS_URL_PREFIX}<path> (for example /${ASSETS_URL_PREFIX}${list[0].file}).`,
        ...list.map((a) => `- ${a.file}${a.credit?.author ? ` · by ${a.credit.author} (${a.credit.source})` : a.credit ? ` · ${a.credit.source}` : ''}${a.credit?.hotlinkUrl ? ` · show from ${a.credit.hotlinkUrl}` : ''}${a.credit?.creditHtml ? ` · credit: ${a.credit.creditHtml}` : ''}`)].join('\n'))
    }
    if (!env.key) return text('No Unsplash key on this computer yet. Use a labelled placeholder box with what the picture should show, and say in your result that the boss can add a free Unsplash key in Settings → Accounts and connectors.', true)
    if (name === 'search_photos') {
      const query = String(args.query ?? '').trim()
      if (!query) return text('Say what the photo should show.', true)
      const o = String(args.orientation ?? '')
      const photos = await searchPhotos(env.key, query, { orientation: (['landscape', 'portrait', 'squarish'].includes(o) ? o : undefined) as Orientation | undefined, count: Math.min(20, Number(args.count) || 8), page: Number(args.page) || 1 })
      if (!photos.length) return text(`No Unsplash photos for "${query}". Try fewer or plainer words.`)
      return text(photos.map((p) => `- id ${p.id}: ${p.description || '(no description)'} · ${p.width} x ${p.height} · main colour ${p.color} · by ${p.author}`).join('\n') + '\n\nCall use_photo with the id you pick.')
    }
    if (name === 'use_photo') {
      const photo = await getPhoto(env.key, String(args.id ?? ''))
      await trackDownload(env.key, photo.downloadLocation)
      const stem = safeFileName(String(args.name ?? '') || photo.description.split(/\s+/).slice(0, 6).join('-') || 'photo').toLowerCase().replace(/\s+/g, '-')
      let file: string | null = null
      try { file = saveAsset(env.assetsDir, 'unsplash', `${stem}-${photo.id}.jpg`, await photoBytes(photo.raw)) } catch (err) { console.error('[pictures] copy not saved:', err) }
      if (file) addCredit(env.assetsDir, { file, source: 'unsplash', title: photo.description, author: photo.author, authorUrl: photo.authorUrl, pageUrl: photo.pageUrl, hotlinkUrl: photo.url, creditHtml: photo.creditHtml, team: env.team || undefined, addedAt: Date.now() })
      return text([
        `Use this address in your HTML: ${photo.url}`,
        `Alt text: ${photo.description || '(write one that says what the photo shows)'} · ${photo.width} x ${photo.height}`,
        `Put this credit next to the photo or in the page's footer: ${photo.creditHtml}`,
        file ? `A copy for every team is saved in the shared Assets folder: ${join(env.assetsDir, file)}` : 'The shared copy could not be saved this time; the address above still works.'
      ].join('\n'))
    }
    return text(`No tool named ${name}.`, true)
  } catch (err) {
    return text(err instanceof Error ? err.message : String(err), true)
  }
}

export async function handle(msg: Rpc, env: PictureEnv): Promise<Json | null> {
  if (msg.id === undefined) return null
  const ok = (result: Json): Json => ({ jsonrpc: '2.0', id: msg.id, result })
  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '')
      return ok({ protocolVersion: /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'tyslin-pictures', version: '1' } })
    }
    case 'ping': return ok({})
    case 'tools/list': return ok({ tools: PICTURE_TOOLS })
    case 'tools/call': return ok(await callPictureTool(String(msg.params?.name ?? ''), (msg.params?.arguments as Json) ?? {}, env))
    default: return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Unknown method ${msg.method}` } }
  }
}

function main(): void {
  const env: PictureEnv = { key: process.env.TYSLIN_UNSPLASH_KEY ?? '', assetsDir: process.env.TYSLIN_ASSETS_DIR ?? '', team: process.env.TYSLIN_TEAM ?? '' }
  if (!env.assetsDir) { console.error('[pictures] TYSLIN_ASSETS_DIR is not set'); process.exit(1) }
  const rl = createInterface({ input: process.stdin })
  rl.on('line', (line) => {
    if (!line.trim()) return
    let msg: Rpc
    try { msg = JSON.parse(line) as Rpc } catch { return }
    void handle(msg, env).then((reply) => { if (reply) process.stdout.write(JSON.stringify(reply) + '\n') })
  })
  rl.on('close', () => process.exit(0))
}

if (process.env.TYSLIN_PICTURES_MCP === '1') main()
