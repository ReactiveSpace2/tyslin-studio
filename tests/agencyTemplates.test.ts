// Template data checks: pack skills point at a real skill pack and real team members.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AGENCY_TEMPLATES } from '../src/shared/agencies'
import { PACKS } from '../src/main/skillPacks'

test('templates: every pack skill names a known pack and members of the team', () => {
  for (const t of AGENCY_TEMPLATES) {
    for (const p of t.packSkills ?? []) {
      assert.ok(PACKS.some((d) => d.id === p.pack), `${t.id}: unknown pack ${p.pack}`)
      assert.match(p.skill, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${t.id}: ${p.skill}`)
      for (const first of p.for ?? []) assert.ok(t.roster.some((m) => m.first === first), `${t.id}: no member ${first}`)
    }
  }
})

test('templates: Web Design gives frontend-design to its designer and builder', () => {
  const t = AGENCY_TEMPLATES.find((x) => x.id === 'web-design')!
  assert.deepEqual(t.packSkills, [{ pack: 'anthropic-skills', skill: 'frontend-design', for: ['Max', 'Finn'] }])
})
