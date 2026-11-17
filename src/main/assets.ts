import { app } from 'electron'
import { existsSync, mkdirSync, realpathSync, statSync } from 'fs'
import { basename, join } from 'path'
import type { McpServer } from '@agentclientprotocol/sdk'
import type { Agency, Agent } from '@shared/types'
import * as db from './db'
import { getSecret } from './secrets'
import { safeName } from './studio'
import { ASSETS_DIRNAME, ASSETS_URL_PREFIX, addCredit, copyIntoAssets, insideAssets, listAssets, readCredits, type AssetCredit } from './assetStore'

/**
 * The project's shared Assets folder and the pictures tool (owner, 18 Nov 2026). See assetStore.ts for the folder's
 * rules and picturesMcp.ts for the tool. The folder is Documents/Tyslin Studio/<project>/Assets, remembered per
 * project in the setting `assets:folder` so renaming the project doesn't move it.
 */

/** Teams whose workers get the pictures tool (Unsplash). Add a template id here to give it to another team. */
export const PICTURE_TEMPLATES = new Set(['design', 'web-design'])
export const UNSPLASH_SECRET = 'unsplash'

export function assetsFolder(): string {
  let folder = db.getSetting('assets:folder') || ''
  if (!folder) {
    folder = join(app.getPath('documents'), 'Tyslin Studio', safeName(db.currentOrg().name), ASSETS_DIRNAME)
    db.setSetting('assets:folder', folder)
  }
  try { mkdirSync(join(folder, 'vecteezy'), { recursive: true }) } catch (err) { console.warn('[assets] folder not made:', err) }
  return folder
}

/** For tools.ts setExtraReadDirs: every team's agents may read the shared Assets folder. */
export const assetsReadDirs = (): string[] => { try { return [realpathSync(assetsFolder())] } catch { return [] } }

/** A file the preview serves at /__assets__/<rel>, confined to the folder (symlinks refused). */
export function assetFileFor(rel: string): string {
  const root = assetsFolder()
  const abs = insideAssets(root, rel)
  const real = realpathSync(abs)
  const realRoot = realpathSync(root)
  if (!real.startsWith(realRoot + '/') && !real.startsWith(realRoot + '\\')) throw new Error('Outside the Assets folder')
  return abs
}

/** The pictures tool for this agent's run, or null (Lead, other teams, or no Unsplash key yet). */
export function picturesServer(agent: Agent): McpServer | null {
  if (agent.engine === 'builtin' || !agent.agency) return null
  const agency = db.getAgency(agent.agency)
  if (!agency || !PICTURE_TEMPLATES.has(agency.templateId)) return null
  const key = getSecret(UNSPLASH_SECRET)
  if (!key) return null
  const script = join(__dirname, 'picturesMcp.js')
  if (!existsSync(script) && !script.includes('.asar')) { console.warn('[assets] pictures tool not built:', script); return null }
  return {
    name: 'tyslin-pictures',
    command: process.execPath,
    args: [script],
    env: [
      { name: 'ELECTRON_RUN_AS_NODE', value: '1' },
      { name: 'TYSLIN_PICTURES_MCP', value: '1' },
      { name: 'TYSLIN_UNSPLASH_KEY', value: key },
      { name: 'TYSLIN_ASSETS_DIR', value: assetsFolder() },
      { name: 'TYSLIN_TEAM', value: agency.name }
    ]
  }
}

/** The "## Shared pictures" section every team's agents get. */
export function assetsPrompt(agent: Agent): string {
  if (!agent.agency) return ''
  const folder = assetsFolder()
  const agency = db.getAgency(agent.agency)
  const tool = agency && PICTURE_TEMPLATES.has(agency.templateId) && agent.engine !== 'builtin'
  const hasKey = !!getSecret(UNSPLASH_SECRET)
  const list = listAssets(folder, 30)
  const lines = [
    '## Shared pictures',
    `Every team in this project shares one Assets folder: ${folder}. Pictures the boss attaches, Unsplash photos the teams use and the Design team's finished artboards are copied there by Tyslin, with who made each one in ${join(folder, 'credits.json')}. You may read it; never write, move or delete anything in it.`,
    `To show one of these pictures on a page or artboard in your folder, use the address /${ASSETS_URL_PREFIX}<path inside Assets> (it works in Tyslin's preview and on the Design board). When a site will be published elsewhere, say in your result which Assets pictures it uses so the boss can copy them along.`,
    'When a picture has a credit (Unsplash, a photographer), show the credit line on the page that uses it. Pictures in vecteezy/ were downloaded by the boss from Vecteezy, whose free licence requires a credit: show "Stock photos by Vecteezy" linked to https://www.vecteezy.com (or the exact line the boss gives) on every page that uses one.'
  ]
  if (tool) lines.push(hasKey
    ? 'For new photos use the pictures tool: search_photos, then use_photo with the id you pick. Put the address use_photo gives you in your HTML (Unsplash asks that pages show photos from its own address) and its credit line next to the photo or in the footer. Never download pictures from the web any other way.'
    : 'There is no Unsplash key yet, so you have no photo search. Where a photo should go, draw a labelled box saying what it should show, and say in your result that the boss can add a free Unsplash key in Settings → Accounts and connectors.')
  if (list.length) lines.push('Pictures in Assets now (newest first):', ...list.map((a) => `- ${a.file}${a.credit?.author ? ` (by ${a.credit.author}, ${a.credit.source})` : a.credit ? ` (${a.credit.source}${a.credit.team ? `, ${a.credit.team}` : ''})` : ''}`))
  return lines.join('\n')
}

function credit(file: string | null, c: Omit<AssetCredit, 'file' | 'addedAt'>): void {
  if (!file) return
  try {
    const known = readCredits(assetsFolder()).find((x) => x.file === file)
    if (known && known.source === c.source && known.title === c.title) return
    addCredit(assetsFolder(), { ...c, file, addedAt: Date.now() })
  } catch (err) { console.warn('[assets] credit not saved:', err) }
}

/** A picture the boss attached to a task: copied into Assets/attachments/. */
export function shareAttachment(src: string, name: string, agency: Agency | null): void {
  try {
    const file = copyIntoAssets(assetsFolder(), 'attachments', src, name)
    credit(file, { source: 'attachment', title: name, team: agency?.name })
  } catch (err) { console.warn('[assets] attachment not shared:', err) }
}

/** The Design team's exported artboards: copied into Assets/designs/<team>/. */
export function shareDesign(src: string, agency: Agency, title: string): void {
  try {
    if (!existsSync(src) || statSync(src).size === 0) return
    const file = copyIntoAssets(assetsFolder(), join('designs', safeName(agency.name)), src, basename(src), { replace: true })
    credit(file, { source: 'design', title, team: agency.name })
  } catch (err) { console.warn('[assets] design not shared:', err) }
}
