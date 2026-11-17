// The shared Assets folder and the pictures tool (18 Nov 2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { addCredit, copyIntoAssets, insideAssets, listAssets, readCredits, saveAsset } from '../src/main/assetStore'
import { handle, PICTURE_TOOLS } from '../src/main/picturesMcp'
import { sizedUrl, toPhoto, unsplashCredit } from '../src/main/unsplashApi'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'tyslin-assets-'))

test('saveAsset reuses the same bytes, renames different ones, replaces when asked', () => {
  const dir = tmp()
  try {
    assert.equal(saveAsset(dir, 'unsplash', 'bus.jpg', Buffer.from('a')), 'unsplash/bus.jpg')
    assert.equal(saveAsset(dir, 'unsplash', 'bus.jpg', Buffer.from('a')), 'unsplash/bus.jpg')
    assert.equal(saveAsset(dir, 'unsplash', 'bus.jpg', Buffer.from('b')), 'unsplash/bus-2.jpg')
    assert.equal(saveAsset(dir, 'designs/Team', 'home.png', Buffer.from('v1')), 'designs/Team/home.png')
    assert.equal(saveAsset(dir, 'designs/Team', 'home.png', Buffer.from('v2'), { replace: true }), 'designs/Team/home.png')
    assert.equal(readFileSync(join(dir, 'designs/Team/home.png'), 'utf8'), 'v2')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('paths stay inside Assets; symlinked folders are refused', () => {
  const dir = tmp()
  const outside = tmp()
  try {
    assert.throws(() => insideAssets(dir, '../x.png'))
    assert.throws(() => insideAssets(dir, '/etc/passwd'))
    symlinkSync(outside, join(dir, 'link'))
    assert.throws(() => insideAssets(dir, 'link/x.png'))
    assert.throws(() => saveAsset(dir, '../escape', 'x.png', Buffer.from('a')))
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }) }
})

test('copyIntoAssets takes pictures only; credits are listed with the files', () => {
  const dir = tmp()
  try {
    const src = join(dir, '..', `notes-${Date.now()}.txt`)
    writeFileSync(src, 'text')
    assert.equal(copyIntoAssets(dir, 'attachments', src, 'notes.txt'), null)
    rmSync(src)
    const png = join(tmpdir(), `logo-${Date.now()}.png`)
    writeFileSync(png, 'png')
    const file = copyIntoAssets(dir, 'attachments', png, 'logo.png')
    rmSync(png)
    assert.equal(file, 'attachments/logo.png')
    addCredit(dir, { file: file!, source: 'attachment', title: 'logo.png', addedAt: 1 })
    addCredit(dir, { file: file!, source: 'attachment', title: 'logo.png', team: 'Web', addedAt: 2 })
    assert.equal(readCredits(dir).length, 1)
    const list = listAssets(dir)
    assert.equal(list.length, 1)
    assert.equal(list[0].credit?.team, 'Web')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('Unsplash photos keep the hotlink, the credit and the utm links', () => {
  const p = toPhoto({
    id: 'abc123', width: 4000, height: 3000, color: '#336699', description: null, alt_description: 'red bus on a street',
    urls: { raw: 'https://images.unsplash.com/photo-1?ixid=x', regular: '', small: 'https://images.unsplash.com/s', thumb: '' },
    links: { html: 'https://unsplash.com/photos/abc123', download_location: 'https://api.unsplash.com/photos/abc123/download?ixid=x' },
    user: { name: 'Ana <B>', username: 'ana', links: { html: 'https://unsplash.com/@ana' } }
  })
  assert.ok(p.url.startsWith('https://images.unsplash.com/photo-1?ixid=x&w=1600'))
  assert.equal(p.description, 'red bus on a street')
  assert.match(p.creditHtml, /utm_source=tyslin_studio&amp;utm_medium=referral/)
  assert.match(p.creditHtml, /Ana &lt;B&gt;/)
  assert.equal(unsplashCredit('A', 'https://unsplash.com/@a').includes('on <a href="https://unsplash.com/?utm_source'), true)
  assert.match(sizedUrl('https://images.unsplash.com/p', 99999), /w=3000/)
})

test('the MCP server answers initialize, tools/list and list_assets; without a key search explains', async () => {
  const dir = tmp()
  try {
    const env = { key: '', assetsDir: dir, team: 'Design' }
    const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, env)
    assert.equal((init?.result as { protocolVersion: string }).protocolVersion, '2025-06-18')
    assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, env), null)
    const tools = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, env)
    assert.deepEqual((tools?.result as { tools: { name: string }[] }).tools.map((t) => t.name), PICTURE_TOOLS.map((t) => t.name))
    mkdirSync(join(dir, 'vecteezy'))
    writeFileSync(join(dir, 'vecteezy', 'van.jpg'), 'jpg')
    const list = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_assets', arguments: {} } }, env)
    assert.match(JSON.stringify(list), /vecteezy\/van\.jpg/)
    const search = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'search_photos', arguments: { query: 'bus' } } }, env)
    assert.equal((search?.result as { isError?: boolean }).isError, true)
    assert.match(JSON.stringify(search), /Unsplash key/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
