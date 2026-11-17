// Design team (17 Nov 2026): the board file, the hand-editing script and the template.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { designExport, exportName, layoutArtboards, pageInstructions, parseDesignBoard, presetFor } from '../src/shared/pages'
import { EDITOR_JS, EDITOR_PATH, injectEditor } from '../src/main/designEditor'
import { AGENCY_TEMPLATES, intakeInstructions, isQuick } from '../src/shared/agencies'
import { AGENCY_SKILLS, SKILL_BODY_UPDATES } from '../src/main/seedSkillsAgencies'

test('board.json: bad entries are skipped, sizes kept in range, no paths outside the folder', () => {
  const doc = parseDesignBoard(JSON.stringify({ artboards: [
    { file: 'design/home.html', title: 'Home', width: 1440, height: 2400 },
    { file: '../secret.html', width: 100, height: 100 },
    { file: '/etc/x.html', width: 100, height: 100 },
    { file: 'design/notes.md', width: 100, height: 100 },
    { file: 'design/post.html', width: 99999, height: 1080, x: 10, y: 20 },
    { file: 'design/home.html', width: 1, height: 1 },
    'nonsense'
  ] }))
  assert.deepEqual(doc.artboards.map((a) => a.file), ['design/home.html', 'design/post.html'])
  assert.equal(doc.artboards[1].width, 8000)
  assert.equal(doc.artboards[0].title, 'Home')
  assert.throws(() => parseDesignBoard('{'), /not valid JSON/)
})

test('board.json: artboards without a place go in a row after the placed ones', () => {
  const placed = layoutArtboards({ artboards: [
    { file: 'a.html', title: 'A', width: 100, height: 100, x: 0, y: 0 },
    { file: 'b.html', title: 'B', width: 200, height: 100 },
    { file: 'c.html', title: 'C', width: 50, height: 50 }
  ] })
  assert.deepEqual(placed.map((a) => [a.x, a.y]), [[0, 0], [180, 0], [460, 0]])
})

test('the editor script is added before </body> and is plain, runnable JavaScript', () => {
  const html = injectEditor('<!doctype html><html><body><h1>Hi</h1></body></html>')
  assert.match(html, new RegExp(`<script data-tyslin-ui src="/${EDITOR_PATH}"></script></body>`))
  assert.ok(injectEditor('<p>no body').endsWith('</script>'))
  // It must not lean on bundler helpers: it runs on its own inside the artboard.
  assert.doesNotThrow(() => new Function(EDITOR_JS))
  assert.ok(!/__name\(|require\(|import /.test(EDITOR_JS))
  // Outside a frame (no parent) it does nothing.
  const g = globalThis as unknown as { parent?: unknown; document?: unknown }
  g.parent = globalThis
  assert.doesNotThrow(() => new Function(EDITOR_JS)())
  delete g.parent
})

test('the Design template: a Lead and a designer who writes directly, skills that exist, the board page', () => {
  const t = AGENCY_TEMPLATES.find((x) => x.id === 'design')!
  assert.ok(t && !t.comingSoon)
  assert.deepEqual(t.roster.map((m) => [m.job, !!m.lead, m.writeMode ?? 'ask']), [['Lead', true, 'ask'], ['Designer', false, 'direct']])
  assert.equal(new Set(t.roster.map((m) => m.head)).size, t.roster.length)
  const names = new Set(AGENCY_SKILLS.map((s) => s.name))
  for (const s of ['artboards', 'artboard-sizes', 'brand-styles', 'playful-footer', 'ai-ux-patterns']) assert.ok(names.has(s), s)
  assert.ok(t.pages?.some((p) => p.kind === 'design'))
  assert.match(pageInstructions(t.pages!), /design\/board\.json/)
})

test('quick teams: the Design team starts at once, with no question list or starter cards', () => {
  const t = AGENCY_TEMPLATES.find((x) => x.id === 'design')!
  assert.ok(isQuick('design') && !isQuick('web-design') && !isQuick(null))
  assert.deepEqual(t.starterCards, [])
  const lead = intakeInstructions(t)
  assert.match(lead, /## Start right away/)
  assert.match(lead, /no plan to approve/)
  assert.doesNotMatch(lead, /Before you plan/)
  // Other templates keep their question list.
  assert.match(intakeInstructions(AGENCY_TEMPLATES.find((x) => x.id === 'seo')), /Before you plan/)
  const artboards = AGENCY_SKILLS.find((s) => s.name === 'artboards')!
  assert.match(artboards.body, /^Work fast/)
  assert.ok(SKILL_BODY_UPDATES.some((u) => u.name === 'artboards' && u.old !== artboards.body))
})

test('design exports: picture names, what each size is for, and the manifest entry', () => {
  assert.equal(exportName('design/post-launch.html'), 'post-launch')
  assert.equal(exportName('design/posts/Launch day.html'), 'posts-Launch-day')
  assert.deepEqual(presetFor(1080, 1080), { use: 'Square post', group: 'Social' })
  assert.deepEqual(presetFor(1440, 3100), { use: 'Web page', group: 'Web' })
  assert.deepEqual(presetFor(333, 333), { use: 'Custom size', group: 'Other' })
  const e = designExport({ file: 'design/story.html', title: 'Story', width: 1080, height: 1920 }, 5)
  assert.deepEqual([e.png, e.jpg, e.use, e.source, e.updatedAt], ['design/exports/story.png', 'design/exports/story.jpg', 'Story', 'design/story.html', 5])
})
