import type { SkillPack, SkillPackResult, SkillPackSearch } from '@shared/types'
import * as db from './db'
import { parseSkillFile, validateSkill } from './skillFiles'

/**
 * Skill packs: openly licensed skill collections on GitHub that users install from the Skills
 * page. Tyslin doesn't bundle them; the user's machine downloads the SKILL.md files straight
 * from the repo at its latest commit. Only SKILL.md is read; a skill's other files
 * (references/, scripts/) are not installed.
 *
 * Featured packs are listed in PACKS. Any other repo tagged `agent-skills` on GitHub can be found
 * and installed from "More on GitHub"; it needs a licence GitHub recognises, and every SKILL.md
 * in the repo is installed.
 * To feature a pack: check its licence allows use, add it here with the folder holding its skills.
 */
interface PackDef {
  id: string
  name: string
  author: string
  description: string
  /** owner/name on GitHub. */
  repo: string
  license: string
  /** Folder whose subfolders each hold a SKILL.md; '' means one SKILL.md at the repo root; undefined means any SKILL.md in the repo. */
  skillsDir?: string
  stars?: number
  featured: boolean
}

const PACKS: PackDef[] = [
  {
    id: 'humanizer',
    name: 'Humanizer',
    author: 'Siqi Chen',
    description: 'Rewrites text so it reads like the writer, not a chatbot, without changing what it says.',
    repo: 'blader/humanizer',
    license: 'MIT',
    skillsDir: '',
    featured: true
  },
  {
    id: 'marketingskills',
    name: 'Marketing Skills',
    author: 'Corey Haines',
    description: 'Skills for copywriting, SEO, conversion, email, ads, pricing, launches and growth.',
    repo: 'coreyhaines31/marketingskills',
    license: 'MIT',
    skillsDir: 'skills',
    featured: true
  }
]

const TOPIC = 'agent-skills'
const PAGE_SIZE = 24
/** A repo with more skills than this is refused rather than flooding the library. */
const MAX_PACK_SKILLS = 300

const HEADERS = { 'user-agent': 'Tyslin-Studio', accept: 'application/vnd.github+json' }
const CHECK_TTL_MS = 15 * 60 * 1000
const PARALLEL = 8

/** Latest commit per pack, from the last check. */
const latest = new Map<string, { sha?: string; error?: string; at: number }>()

async function github<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, { headers: HEADERS })
  if (res.status === 403 || res.status === 429) throw new Error('GitHub rate limit reached. Try again in an hour.')
  if (!res.ok) throw new Error(`GitHub returned ${res.status}.`)
  return (await res.json()) as T
}

async function latestCommit(repo: string): Promise<string> {
  return (await github<{ sha: string }>(`/repos/${repo}/commits/HEAD`)).sha
}

const repoPackId = (repo: string): string => `gh:${repo.toLowerCase()}`

function toPack(def: PackDef): SkillPack {
  const row = db.getPackRow(def.id)
  const check = latest.get(def.id)
  const blockedReason = def.license ? undefined : 'No licence on GitHub, so Tyslin can\'t install it. You can still read it there.'
  return {
    id: def.id,
    name: def.name,
    author: def.author,
    description: def.description,
    url: `https://github.com/${def.repo}`,
    license: def.license,
    featured: def.featured,
    ...(def.stars !== undefined && { stars: def.stars }),
    installable: !blockedReason,
    ...(blockedReason && { blockedReason }),
    installed: !!row,
    skillCount: row?.skillCount ?? 0,
    ...(row && { installedCommit: row.commitSha, installedAt: row.installedAt }),
    ...(check?.sha && { latestCommit: check.sha }),
    ...(check?.error && { checkError: check.error }),
    updateAvailable: !!row && !!check?.sha && check.sha !== row.commitSha
  }
}

/** Topic repos seen in a search this session, so Install can use the details GitHub sent. */
const seen = new Map<string, PackDef>()

function rowToDef(row: db.PackRow): PackDef {
  let meta: Partial<PackDef> = {}
  try { meta = JSON.parse(row.meta) as Partial<PackDef> } catch { /* keep defaults */ }
  const [owner = '', name = row.repo] = row.repo.split('/')
  return {
    id: row.id,
    repo: row.repo,
    name: meta.name ?? name,
    author: meta.author ?? owner,
    description: meta.description ?? '',
    license: meta.license ?? '',
    ...(meta.stars !== undefined && { stars: meta.stars }),
    featured: false
  }
}

/** Featured packs plus every topic pack that is installed. */
function knownDefs(): PackDef[] {
  return [...PACKS, ...db.listRepoPackRows().map(rowToDef)]
}

function findDef(id: string): PackDef | undefined {
  const fromDb = db.getPackRow(id)
  return PACKS.find((p) => p.id === id) ?? seen.get(id) ?? (fromDb?.repo ? rowToDef(fromDb) : undefined)
}

export function listPacks(): SkillPack[] {
  return knownDefs().map(toPack)
}

export async function checkPacks(): Promise<SkillPack[]> {
  const defs = knownDefs()
  await Promise.all(defs.map(async (def) => {
    if (!def.featured && !db.getPackRow(def.id)) return
    const prev = latest.get(def.id)
    if (prev?.sha && Date.now() - prev.at < CHECK_TTL_MS) return
    try {
      latest.set(def.id, { sha: await latestCommit(def.repo), at: Date.now() })
    } catch (err) {
      latest.set(def.id, { ...(prev?.sha && { sha: prev.sha }), error: err instanceof Error ? err.message : String(err), at: Date.now() })
    }
  }))
  return listPacks()
}

interface SearchRepo {
  full_name: string
  name: string
  owner: { login: string }
  description: string | null
  stargazers_count: number
  license: { spdx_id: string | null } | null
  archived: boolean
}

const searches = new Map<string, { at: number; result: { total: number; repos: SearchRepo[] } }>()

/** One page of the GitHub topic, most stars first (search results cached for 15 minutes). */
export async function discoverPacks(query: string, page: number): Promise<SkillPackSearch> {
  const words = query.replace(/[^\p{L}\p{N}\s._-]/gu, ' ').trim().slice(0, 100)
  const key = `${words}\n${page}`
  let hit = searches.get(key)
  if (!hit || Date.now() - hit.at > CHECK_TTL_MS) {
    const q = encodeURIComponent(`topic:${TOPIC} archived:false ${words}`.trim())
    const r = await github<{ total_count: number; items: SearchRepo[] }>(`/search/repositories?q=${q}&sort=stars&order=desc&per_page=${PAGE_SIZE}&page=${page}`)
    hit = { at: Date.now(), result: { total: r.total_count, repos: r.items } }
    searches.set(key, hit)
  }
  const featured = new Set(PACKS.map((p) => p.repo.toLowerCase()))
  const packs: SkillPack[] = []
  for (const r of hit.result.repos) {
    if (featured.has(r.full_name.toLowerCase())) continue
    const spdx = r.license?.spdx_id
    const def: PackDef = {
      id: repoPackId(r.full_name),
      repo: r.full_name,
      name: r.name,
      author: r.owner.login,
      description: (r.description ?? '').slice(0, 300),
      license: spdx && spdx !== 'NOASSERTION' ? spdx : '',
      stars: r.stargazers_count,
      featured: false
    }
    seen.set(def.id, def)
    packs.push(toPack(def))
  }
  // GitHub search returns at most 1,000 results.
  const more = page * PAGE_SIZE < Math.min(hit.result.total, 1000)
  return { packs, total: hit.result.total, ...(more && { nextPage: page + 1 }) }
}

/** Runs `fn` over `items`, a few at a time. */
async function mapLimit<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }))
  return out
}

export async function installPack(id: string): Promise<SkillPackResult> {
  const def = findDef(id)
  if (!def) throw new Error('Unknown skill pack. Search for it again and retry.')
  if (!def.license) throw new Error('This repo has no licence on GitHub, so Tyslin can\'t install it.')
  const sha = await latestCommit(def.repo)
  latest.set(def.id, { sha, at: Date.now() })

  let paths: string[]
  if (def.skillsDir === '') {
    paths = ['SKILL.md']
  } else {
    const tree = await github<{ tree: { path: string; type: string }[]; truncated: boolean }>(`/repos/${def.repo}/git/trees/${sha}?recursive=1`)
    const re = def.skillsDir !== undefined
      ? new RegExp(`^${def.skillsDir}/[^/]+/SKILL\\.md$`)
      : /(^|\/)SKILL\.md$/
    paths = tree.tree.filter((t) => t.type === 'blob' && re.test(t.path) && !t.path.split('/').includes('node_modules')).map((t) => t.path)
    if (!paths.length && tree.truncated) throw new Error(`${def.repo} is too large for Tyslin to look through.`)
  }
  if (!paths.length) throw new Error(`No skills found in ${def.repo}. Tyslin installs folders that contain a SKILL.md file.`)
  if (paths.length > MAX_PACK_SKILLS) throw new Error(`${def.repo} has ${paths.length} skills. Tyslin installs packs of up to ${MAX_PACK_SKILLS}.`)

  const skipped: string[] = []
  const files = await mapLimit(paths, async (path) => {
    const res = await fetch(`https://raw.githubusercontent.com/${def.repo}/${sha}/${path}`, { headers: { 'user-agent': HEADERS['user-agent'] } })
    if (!res.ok) throw new Error(`Could not download ${path} (GitHub returned ${res.status}).`)
    return { path, text: await res.text() }
  })

  const repoName = def.repo.split('/')[1] ?? def.id
  const names = new Set<string>()
  const skills: db.PackSkill[] = []
  for (const { path, text } of files) {
    const folder = path.split('/').slice(-2, -1)[0] ?? repoName
    const s = parseSkillFile(text, `${folder.toLowerCase()}.md`)
    const problem = validateSkill(s)
    if (problem) {
      skipped.push(`${s.name || folder}: ${problem}`)
      continue
    }
    if (names.has(s.name)) {
      skipped.push(`${s.name}: the pack has more than one skill with this name (${path})`)
      continue
    }
    names.add(s.name)
    const dir = path.replace(/\/?SKILL\.md$/, '')
    const sourceUrl = dir ? `https://github.com/${def.repo}/tree/HEAD/${dir}` : `https://github.com/${def.repo}`
    skills.push({ name: s.name, description: s.description, body: s.body, sourceUrl })
  }
  if (!skills.length) throw new Error(`None of the skills in ${def.repo} could be installed. ${skipped.slice(0, 3).join('; ')}`)

  const source = def.featured ? undefined : {
    repo: def.repo,
    meta: JSON.stringify({ name: def.name, author: def.author, description: def.description, license: def.license, stars: def.stars })
  }
  const r = db.applyPack(def.id, sha, skills, source)
  return { pack: toPack(def), added: r.added, updated: r.updated, removed: r.removed, skipped: [...skipped, ...r.skipped] }
}

export function uninstallPack(id: string): void {
  if (!PACKS.some((p) => p.id === id) && !db.getPackRow(id)) throw new Error('Unknown skill pack.')
  db.removePack(id)
}
