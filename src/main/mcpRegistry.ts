import type { RegistryField, RegistryServer } from '@shared/types'

/**
 * Search over the official MCP Registry (registry.modelcontextprotocol.io, run by the MCP project). Publishers prove
 * their namespace (a GitHub account or a domain), but the servers themselves are not reviewed by anyone, Tyslin
 * included; the screen says so. Each result is turned into the first way Tyslin can install it: a remote address
 * (streamable HTTP or SSE), or a local npm, Python (uvx) or Docker package that speaks stdio.
 */
const API = process.env.TYSLIN_MCP_REGISTRY || 'https://registry.modelcontextprotocol.io/v0.1/servers'

type Input = { name?: string; description?: string; isRequired?: boolean; isSecret?: boolean; value?: string; default?: string; placeholder?: string; type?: string; valueHint?: string }
type Remote = { type: string; url: string; headers?: Input[]; variables?: Record<string, Input> }
type Pkg = {
  registryType: string; identifier: string; version?: string; runtimeHint?: string; transport?: { type: string }
  environmentVariables?: Input[]; packageArguments?: Input[]; runtimeArguments?: Input[]
}
type Entry = { server: { name: string; title?: string; description?: string; version?: string; websiteUrl?: string; repository?: { url?: string }; remotes?: Remote[]; packages?: Pkg[] } }

const quote = (v: string): string => (/[\s"']/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v)
const varsIn = (t: string): string[] => [...t.matchAll(/\{([A-Za-z0-9_.-]+)\}/g)].map((m) => m[1])

/** Arguments with a fixed value become part of the command; one the user must type makes the package not installable here. */
function args(list: Input[] | undefined): string[] | null {
  const out: string[] = []
  for (const a of list ?? []) {
    if (a.value === undefined && a.default === undefined) {
      if (a.isRequired) return null
      continue
    }
    const v = a.value ?? a.default ?? ''
    if (a.type === 'named' && a.name) out.push(a.name, v)
    else out.push(v)
  }
  return out
}

function remoteInstall(r: Remote): RegistryServer['install'] {
  const fields: RegistryField[] = []
  for (const v of varsIn(r.url)) {
    const d = r.variables?.[v]
    fields.push({ target: 'url-var', name: v, description: d?.description ?? '', required: d?.isRequired ?? true, secret: !!d?.isSecret, placeholder: d?.placeholder, defaultValue: d?.default })
  }
  for (const h of r.headers ?? []) {
    if (!h.name) continue
    const template = h.value ?? ''
    const inTemplate = varsIn(template)
    if (inTemplate.length) {
      for (const v of inTemplate) fields.push({ target: 'header-var', name: v, header: h.name, template, description: h.description ?? '', required: !!h.isRequired, secret: !!h.isSecret, placeholder: h.placeholder })
    } else if (!template) {
      fields.push({ target: 'header', name: h.name, description: h.description ?? '', required: !!h.isRequired, secret: !!h.isSecret, placeholder: h.placeholder, defaultValue: h.default })
    }
  }
  return { kind: 'remote', transport: 'http', url: r.url, fields }
}

function packageInstall(p: Pkg): RegistryServer['install'] {
  if (p.transport?.type && p.transport.type !== 'stdio') return null
  const pkgArgs = args(p.packageArguments)
  const runArgs = args(p.runtimeArguments)
  if (!pkgArgs || !runArgs) return null
  const fields: RegistryField[] = (p.environmentVariables ?? []).filter((e) => e.name).map((e) => ({
    target: 'env', name: e.name!, description: e.description ?? '', required: !!e.isRequired, secret: !!e.isSecret, placeholder: e.placeholder, defaultValue: e.default ?? e.value
  }))
  let parts: string[]
  if (p.registryType === 'npm') parts = ['npx', '-y', ...runArgs, p.version ? `${p.identifier}@${p.version}` : p.identifier, ...pkgArgs]
  // Runtime arguments go to uvx before the package; the package itself is always named (as the command when --from is given).
  else if (p.registryType === 'pypi') parts = ['uvx', ...runArgs, p.version && !runArgs.includes('--from') ? `${p.identifier}==${p.version}` : p.identifier, ...pkgArgs]
  else if (p.registryType === 'oci') parts = ['docker', 'run', '-i', '--rm', ...fields.flatMap((f) => ['-e', f.name]), ...runArgs, p.identifier, ...pkgArgs]
  else return null
  const kind = p.registryType === 'npm' ? 'npm' : p.registryType === 'pypi' ? 'pypi' : 'docker'
  return { kind, transport: 'stdio', commandLine: parts.map(quote).join(' '), fields }
}

function normalize(e: Entry): RegistryServer {
  const s = e.server
  const base = {
    name: s.name, title: s.title || s.name.split('/').pop() || s.name, description: s.description ?? '', version: s.version ?? '',
    repoUrl: s.repository?.url || undefined, websiteUrl: s.websiteUrl || undefined
  }
  // Remote first: nothing to install on this computer.
  for (const r of s.remotes ?? []) if (r.type === 'streamable-http' || r.type === 'sse') return { ...base, install: remoteInstall(r) }
  for (const p of s.packages ?? []) { const i = packageInstall(p); if (i) return { ...base, install: i } }
  return { ...base, install: null, note: s.packages?.length ? 'Needs arguments Tyslin can\'t fill in. Add it as Any MCP server using its setup guide.' : 'No remote address or package listed.' }
}

export async function searchRegistry(query: string, cursor?: string): Promise<{ servers: RegistryServer[]; next?: string }> {
  const params = new URLSearchParams({ version: 'latest', limit: '30' })
  if (query.trim()) params.set('search', query.trim().slice(0, 100))
  if (cursor) params.set('cursor', cursor)
  let res: Response
  try {
    res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' } })
  } catch {
    throw new Error("Couldn't reach the MCP Registry. Check your connection.")
  }
  if (!res.ok) throw new Error(`The MCP Registry answered ${res.status}.`)
  const body = (await res.json()) as { servers?: Entry[]; metadata?: { nextCursor?: string } }
  // The registry keeps one entry per name at version=latest; dedupe anyway.
  const seen = new Set<string>()
  const servers = (body.servers ?? []).filter((e) => e?.server?.name && !seen.has(e.server.name) && seen.add(e.server.name)).map(normalize)
  return { servers, next: body.metadata?.nextCursor || undefined }
}
