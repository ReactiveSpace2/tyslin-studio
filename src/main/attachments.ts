import { app, dialog, type BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { closeSync, copyFileSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import type { Attachment } from '@shared/types'
import { listProjectFiles } from './tools'

/**
 * Chat attachments. The user picks files or folders with the system dialog; they are read here,
 * once, so the agent sees the same content on every later turn even if the files change or move.
 * Text goes into the message as context; images are copied into the app's data folder.
 */

/** A file the model can be given as an image. Max 5 MB (the Anthropic limit). */
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp'
}
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
/** Files larger than this are not read at all. */
const MAX_FILE_BYTES = 2 * 1024 * 1024
/** Characters per file, and per message across all its attachments (about 50,000 tokens). */
const MAX_FILE_CHARS = 100_000
const MAX_MESSAGE_CHARS = 200_000
const MAX_FOLDER_FILES = 500

/** What gets saved with the message: the visible attachment, plus the image copy if any. */
export interface StoredAttachment extends Attachment {
  /** Path of the image copy in the app's data folder. */
  copy?: string
  mime?: string
}

export interface PreparedMessage {
  attachments: StoredAttachment[]
  /** Text the model sees after the user's message. */
  context: string
}

/** Picked but not yet sent. Only ids from this map are accepted by `sessions:send`. */
const picked = new Map<string, Attachment>()

export async function pickAttachments(win: BrowserWindow, kind: 'file' | 'folder'): Promise<Attachment[]> {
  const r = await dialog.showOpenDialog(win, {
    title: kind === 'file' ? 'Attach files' : 'Attach a folder',
    properties: kind === 'file' ? ['openFile', 'multiSelections'] : ['openDirectory', 'multiSelections']
  })
  if (r.canceled) return []
  return r.filePaths.map((path) => {
    const a = describe(path, kind)
    picked.set(a.id, a)
    return a
  })
}

function describe(path: string, kind: 'file' | 'folder'): Attachment {
  const base = { id: randomUUID(), name: basename(path) || path, path }
  if (kind === 'folder') {
    const files = listProjectFiles(path, MAX_FOLDER_FILES)
    const size = files.reduce((n, f) => n + sizeOf(join(path, f)), 0)
    return { ...base, kind: 'folder', size, files: files.length }
  }
  const size = sizeOf(path)
  const isImage = extname(path).toLowerCase() in IMAGE_TYPES
  return { ...base, kind: isImage ? 'image' : 'file', size }
}

function sizeOf(path: string): number {
  try { return statSync(path).size } catch { return 0 }
}

/** Reads a text file, or explains why it can't be included. */
function readText(path: string, size: number): { text?: string; note?: string } {
  if (size > MAX_FILE_BYTES) return { note: 'too large to include' }
  let fd: number | null = null
  try {
    // Binary check on the first 8 KB: text files have no NUL bytes.
    fd = openSync(path, 'r')
    const head = Buffer.alloc(Math.min(size, 8192))
    readSync(fd, head, 0, head.length, 0)
    if (head.includes(0)) return { note: 'not a text file' }
  } catch {
    return { note: 'could not be read' }
  } finally {
    if (fd !== null) closeSync(fd)
  }
  let text: string
  // Moved, deleted or locked since it was picked: note it rather than failing the whole message.
  try { text = readFileSync(path, 'utf8') } catch { return { note: 'could not be read' } }
  return text.length > MAX_FILE_CHARS
    ? { text: text.slice(0, MAX_FILE_CHARS), note: `cut to the first ${MAX_FILE_CHARS.toLocaleString('en')} characters` }
    : { text }
}

const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** Reads the picked attachments for a message being sent, and forgets them. Unknown ids are ignored. */
export function prepareAttachments(ids: string[]): PreparedMessage {
  const out: StoredAttachment[] = []
  const parts: string[] = []
  let budget = MAX_MESSAGE_CHARS

  /** Adds one text file to the context while the message budget lasts. */
  const addFile = (path: string, label: string, size: number): string | undefined => {
    const { text, note } = readText(path, size)
    if (text === undefined) {
      parts.push(`<file path="${attr(label)}" note="${note}" />`)
      return note
    }
    if (budget <= 0) {
      parts.push(`<file path="${attr(label)}" note="left out: attachments too large" />`)
      return 'left out: attachments too large'
    }
    const body = text.slice(0, budget)
    budget -= body.length
    const cut = body.length < text.length ? 'cut short: attachments too large' : note
    parts.push(`<file path="${attr(label)}"${cut ? ` note="${cut}"` : ''}>\n${body}\n</file>`)
    return cut
  }

  for (const id of ids) {
    const a = picked.get(id)
    if (!a) continue
    picked.delete(id)

    if (a.kind === 'image') {
      if (a.size > MAX_IMAGE_BYTES) {
        out.push({ ...a, note: 'image over 5 MB, not sent' })
        parts.push(`<image name="${attr(a.name)}" note="over 5 MB, not sent" />`)
        continue
      }
      try {
        const dir = join(app.getPath('userData'), 'attachments')
        mkdirSync(dir, { recursive: true })
        const copy = join(dir, `${a.id}${extname(a.path).toLowerCase()}`)
        copyFileSync(a.path, copy)
        out.push({ ...a, copy, mime: IMAGE_TYPES[extname(a.path).toLowerCase()] })
        parts.push(`<image name="${attr(a.name)}" path="${attr(a.path)}" />`)
      } catch {
        out.push({ ...a, note: 'could not be read' })
      }
      continue
    }

    if (a.kind === 'file') {
      const note = addFile(a.path, a.name, sizeOf(a.path))
      out.push(note ? { ...a, note } : a)
      continue
    }

    // Folder: the file list, then each text file's contents while the budget lasts.
    const files = listProjectFiles(a.path, MAX_FOLDER_FILES)
    const start = parts.length
    let skipped = 0
    for (const f of files) {
      if (addFile(join(a.path, f), `${a.name}/${f}`, sizeOf(join(a.path, f)))) skipped++
    }
    const inner = parts.splice(start)
    parts.push(
      `<folder name="${attr(a.name)}" files="${files.length}">\nFiles:\n${files.map((f) => `- ${f}`).join('\n') || '(empty)'}\n\n${inner.join('\n')}\n</folder>`
    )
    out.push({ ...a, files: files.length, ...(skipped ? { note: `${skipped} file${skipped === 1 ? '' : 's'} not fully included` } : {}) })
  }

  const context = parts.length
    ? `The user attached the following. Hidden folders, node_modules and build folders are left out.\n<attachments>\n${parts.join('\n')}\n</attachments>`
    : ''
  return { attachments: out, context }
}

/** Registers a PNG the app itself made (a preview screenshot) as a picked image attachment. */
export function addCapturedImage(path: string, name: string): Attachment {
  const a: Attachment = { id: randomUUID(), kind: 'image', name: name.endsWith('.png') ? name : name + '.png', path, size: sizeOf(path) }
  picked.set(a.id, a)
  return a
}

/** Base64 of a stored image copy, or null if it is gone. */
export function readImage(a: StoredAttachment): { mime: string; data: string } | null {
  if (!a.copy || !a.mime) return null
  try { return { mime: a.mime, data: readFileSync(a.copy).toString('base64') } } catch { return null }
}
