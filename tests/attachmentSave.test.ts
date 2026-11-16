// Attachments saved into the team folder must stay inside it, even through symlinks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { saveIntoFolder } from '../src/main/attachmentSave'

function setup(): { base: string; team: string; outside: string; src: string } {
  const base = mkdtempSync(join(tmpdir(), 'tyslin-attach-'))
  const team = join(base, 'team')
  const outside = join(base, 'outside')
  mkdirSync(team); mkdirSync(outside)
  const src = join(base, 'logo.png')
  writeFileSync(src, 'png bytes')
  return { base, team, outside, src }
}

test('saves into <team>/attachments and reuses the same copy', () => {
  const { base, team, src } = setup()
  try {
    assert.equal(saveIntoFolder(src, 'logo.png', team), 'attachments/logo.png')
    assert.equal(readFileSync(join(team, 'attachments', 'logo.png'), 'utf8'), 'png bytes')
    assert.equal(saveIntoFolder(src, 'logo.png', team), 'attachments/logo.png')
    writeFileSync(src, 'other bytes')
    assert.equal(saveIntoFolder(src, 'logo.png', team), 'attachments/logo-2.png')
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('refuses when <team>/attachments is a symlink to another folder (16 Nov 2026 QA)', () => {
  const { base, team, outside, src } = setup()
  try {
    symlinkSync(outside, join(team, 'attachments'), 'dir')
    assert.equal(saveIntoFolder(src, 'logo.png', team), null)
    assert.deepEqual(readdirSync(outside), [])
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('refuses when <team>/attachments is a dangling symlink', () => {
  const { base, team, outside, src } = setup()
  try {
    symlinkSync(join(outside, 'not-yet'), join(team, 'attachments'), 'dir')
    assert.equal(saveIntoFolder(src, 'logo.png', team), null)
    assert.equal(existsSync(join(outside, 'not-yet')), false)
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('a file name that is a symlink is skipped, never read or written through', () => {
  const { base, team, outside, src } = setup()
  try {
    mkdirSync(join(team, 'attachments'))
    writeFileSync(join(outside, 'secret.png'), 'png bytes')
    symlinkSync(join(outside, 'secret.png'), join(team, 'attachments', 'logo.png'))
    assert.equal(saveIntoFolder(src, 'logo.png', team), 'attachments/logo-2.png')
    assert.deepEqual(readdirSync(outside), ['secret.png'])
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('a team folder reached through a symlink still works', () => {
  const { base, team, src } = setup()
  try {
    const link = join(base, 'team-link')
    symlinkSync(team, link, 'dir')
    assert.equal(saveIntoFolder(src, 'logo.png', link), 'attachments/logo.png')
    assert.equal(existsSync(join(team, 'attachments', 'logo.png')), true)
  } finally { rmSync(base, { recursive: true, force: true }) }
})
