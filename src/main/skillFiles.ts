import { basename } from 'path'
import type { SkillInput } from '@shared/types'

/** Skills go into every system prompt they're attached to, so keep them prompt-sized. */
export const MAX_SKILL_CHARS = 20_000

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}

/** Returns a reason the skill can't be saved, or null. */
export function validateSkill(s: SkillInput): string | null {
  if (!NAME_RE.test(s.name)) return 'Name must be lowercase words joined by hyphens, like meeting-notes.'
  if (s.name.length > 64) return 'Name must be 64 characters or fewer.'
  if (!s.body.trim()) return 'Instructions are empty.'
  if (s.body.length > MAX_SKILL_CHARS) return `Instructions are over ${MAX_SKILL_CHARS.toLocaleString()} characters. Shorten them; long skills crowd out the conversation.`
  return null
}

function unquote(v: string): string {
  const t = v.trim()
  if (t.startsWith('"') && t.endsWith('"')) {
    try { return JSON.parse(t) } catch { return t.slice(1, -1) }
  }
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'")
  return t
}

/**
 * Reads a skill from Markdown. Frontmatter is optional; only `name` and `description` are used,
 * including YAML block scalars (| and >). Without a name, the file name is used.
 */
export function parseSkillFile(text: string, fileName: string): SkillInput {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const fields: Record<string, string> = {}
  let body = src
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(src)
  if (fm) {
    body = src.slice(fm[0].length)
    const lines = fm[1].split('\n')
    for (let i = 0; i < lines.length; i++) {
      const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i])
      if (!m) continue
      const [, key, raw] = m
      if (/^[|>][+-]?$/.test(raw.trim())) {
        const block: string[] = []
        while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1] === '')) block.push(lines[++i].trim())
        fields[key] = raw.trim().startsWith('>') ? block.join(' ').trim() : block.join('\n').trim()
      } else {
        fields[key] = unquote(raw)
      }
    }
  }
  body = body.trim()
  const firstLine = body.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '').trim() ?? ''
  return {
    name: slugify(fields.name || basename(fileName).replace(/\.(md|markdown|txt)$/i, '')),
    description: (fields.description || firstLine).replace(/\s+/g, ' ').slice(0, 300),
    body
  }
}

function yamlString(s: string): string {
  return JSON.stringify(s)
}

export function serializeSkill(s: SkillInput): string {
  return `---\nname: ${s.name}\ndescription: ${yamlString(s.description)}\n---\n\n${s.body.trim()}\n`
}
