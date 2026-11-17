/**
 * Unsplash (owner, 18 Nov 2026): pictures for the Design and Web Design teams, through the user's own free access key
 * (unsplash.com/developers). Follows Unsplash's API guidelines (help.unsplash.com, "Unsplash API Guidelines", read
 * 18 Nov 2026): pages show the photo from the address the API returns (hotlinking), choosing a photo calls its
 * download_location, and every use credits the photographer and Unsplash with utm links. Vecteezy is not fetched:
 * its free licence needs a credit per download, one project per download and no stockpiling, so the boss downloads
 * those by hand. No Electron imports (used by picturesMcp.ts and tests).
 */
export const UNSPLASH_API = process.env.TYSLIN_UNSPLASH_API || 'https://api.unsplash.com'
export const UNSPLASH_IMAGE_HOST = 'https://images.unsplash.com'
const UTM = 'utm_source=tyslin_studio&utm_medium=referral'

export type UnsplashPhoto = {
  id: string
  description: string
  width: number
  height: number
  color: string
  /** The address to show it from on pages and artboards (sized, still Unsplash's own). */
  url: string
  thumb: string
  author: string
  authorUrl: string
  pageUrl: string
  downloadLocation: string
  creditHtml: string
}

type RawPhoto = {
  id: string; width: number; height: number; color?: string; description?: string | null; alt_description?: string | null
  urls: { raw: string; regular: string; small: string; thumb: string }
  links: { html: string; download_location: string }
  user: { name: string; username: string; links: { html: string } }
}

const withUtm = (url: string): string => url + (url.includes('?') ? '&' : '?') + UTM
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "Photo by <a>Name</a> on <a>Unsplash</a>", as Unsplash asks. */
export function unsplashCredit(author: string, authorUrl: string): string {
  return `Photo by <a href="${esc(withUtm(authorUrl))}">${esc(author)}</a> on <a href="${esc(withUtm('https://unsplash.com/'))}">Unsplash</a>`
}

/** A sized address on Unsplash's image host (their dynamic resizing keeps it a hotlink). */
export function sizedUrl(raw: string, width: number): string {
  return raw + (raw.includes('?') ? '&' : '?') + `w=${Math.max(200, Math.min(3000, Math.round(width)))}&fit=max&q=80&auto=format`
}

export function toPhoto(p: RawPhoto): UnsplashPhoto {
  const author = p.user?.name || p.user?.username || 'Unknown'
  const authorUrl = p.user?.links?.html || `https://unsplash.com/@${p.user?.username ?? ''}`
  return {
    id: p.id, width: p.width, height: p.height, color: p.color ?? '',
    description: (p.alt_description || p.description || '').trim(),
    url: sizedUrl(p.urls.raw, 1600), thumb: p.urls.small,
    author, authorUrl, pageUrl: withUtm(p.links.html), downloadLocation: p.links.download_location,
    creditHtml: unsplashCredit(author, authorUrl)
  }
}

async function call(key: string, path: string): Promise<unknown> {
  const res = await fetch(UNSPLASH_API + path, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' }, signal: AbortSignal.timeout(20_000) })
  if (res.status === 401) throw new Error('Unsplash refused the access key. Check it in Settings → Accounts and connectors.')
  if (res.status === 403) throw new Error('Unsplash says the hourly limit for this key is used up. Try again in an hour.')
  if (res.status === 404) throw new Error('Unsplash has no such photo.')
  if (!res.ok) throw new Error(`Unsplash answered ${res.status}.`)
  return res.json()
}

export type Orientation = 'landscape' | 'portrait' | 'squarish'

export async function searchPhotos(key: string, query: string, opts: { orientation?: Orientation; count?: number; page?: number } = {}): Promise<UnsplashPhoto[]> {
  const q = new URLSearchParams({ query, per_page: String(Math.max(1, Math.min(30, opts.count ?? 10))), page: String(Math.max(1, opts.page ?? 1)), content_filter: 'high' })
  if (opts.orientation) q.set('orientation', opts.orientation)
  const r = (await call(key, `/search/photos?${q}`)) as { results?: RawPhoto[] }
  return (r.results ?? []).map(toPhoto)
}

export async function getPhoto(key: string, id: string): Promise<UnsplashPhoto & { raw: string }> {
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) throw new Error('That is not an Unsplash photo id.')
  const p = (await call(key, `/photos/${id}`)) as RawPhoto
  return { ...toPhoto(p), raw: p.urls.raw }
}

/** Tells Unsplash the photo was chosen (required by their guidelines whenever a photo is used). */
export async function trackDownload(key: string, downloadLocation: string): Promise<void> {
  if (!downloadLocation.startsWith(UNSPLASH_API + '/')) return
  await call(key, downloadLocation.slice(UNSPLASH_API.length))
}

/** The photo's bytes at a sensible size for the shared Assets copy. */
export async function photoBytes(raw: string, width = 2400): Promise<Buffer> {
  const url = sizedUrl(raw, width).replace('auto=format', 'fm=jpg')
  if (!url.startsWith(UNSPLASH_IMAGE_HOST + '/') && !process.env.TYSLIN_UNSPLASH_API) throw new Error('Not an Unsplash picture address.')
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Unsplash answered ${res.status} for the picture.`)
  return Buffer.from(await res.arrayBuffer())
}

/** Checks a key before it is saved: a 401 throws; no connection saves it unchecked (like OpenRouter's). */
export async function checkUnsplashKey(key: string): Promise<void> {
  try {
    await call(key, '/search/photos?query=office&per_page=1')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/refused the access key/.test(msg)) throw new Error('Unsplash refused this access key. Copy the Access Key (not the Secret key) from your app at unsplash.com/oauth/applications.')
    if (/^Unsplash/.test(msg)) return
    console.warn('[unsplash] key not checked (offline?):', msg)
  }
}
