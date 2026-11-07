import { Fragment, type ReactNode } from 'react'

/**
 * A small Markdown renderer for agent replies: headings, paragraphs, bold, italic, inline code, code blocks,
 * bullet and numbered lists, quotes, rules and links. It builds React elements only (never raw HTML), so a reply
 * can't inject markup. Links open in the system browser (http/https/mailto only).
 */

const SAFE_LINK = /^(https?:|mailto:)/i

/** Inline: `code`, **bold**, *italic* / _italic_, [text](url), bare https:// links. */
function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(\*[^*\s][^*\n]*?\*|\b_[^_\s][^_\n]*?_\b)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g
  let last = 0
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const k = `${key}-${n++}`
    const [tok] = m
    if (m[1]) out.push(<code key={k}>{tok.slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>)
    else if (m[3]) out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>)
    else if (m[4]) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok) ?? []
      out.push(SAFE_LINK.test(href ?? '') ? <a key={k} href={href} target="_blank" rel="noreferrer">{inline(label ?? '', k)}</a> : <Fragment key={k}>{label}</Fragment>)
    } else out.push(<a key={k} href={tok} target="_blank" rel="noreferrer">{tok}</a>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Lines → blocks. */
export function Markdown({ text, className }: { text: string; className?: string }): JSX.Element {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let k = 0
  const isList = (l: string): RegExpExecArray | null => /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l)

  while (i < lines.length) {
    const line = lines[i]
    // Fenced code block.
    const fence = /^\s*```(\S*)/.exec(line)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++])
      i++
      blocks.push(<pre key={k++} className="md-code"><code>{body.join('\n')}</code></pre>)
      continue
    }
    if (!line.trim()) { i++; continue }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const level = Math.min(h[1].length + 2, 6)
      const Tag = `h${level}` as 'h3'
      blocks.push(<Tag key={k++} className="md-h">{inline(h[2], `h${k}`)}</Tag>)
      i++
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push(<hr key={k++} />); i++; continue }
    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push(<blockquote key={k++}>{inline(body.join(' '), `q${k}`)}</blockquote>)
      continue
    }
    const first = isList(line)
    if (first) {
      const ordered = /\d/.test(first[2])
      const items: ReactNode[] = []
      while (i < lines.length) {
        const it = isList(lines[i])
        if (!it || /\d/.test(it[2]) !== ordered) break
        // Continuation lines (indented, not a new item) join the item.
        let body = it[3]
        i++
        while (i < lines.length && lines[i].trim() && !isList(lines[i]) && /^\s{2,}/.test(lines[i])) body += ' ' + lines[i++].trim()
        items.push(<li key={items.length}>{inline(body, `l${k}-${items.length}`)}</li>)
      }
      const start = ordered ? parseInt(first[2], 10) : undefined
      blocks.push(ordered ? <ol key={k++} start={start && start !== 1 ? start : undefined}>{items}</ol> : <ul key={k++}>{items}</ul>)
      continue
    }
    // Paragraph: until a blank line or another block starts. Single line breaks are kept.
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && !isList(lines[i]) && !/^\s*>/.test(lines[i])) para.push(lines[i++])
    blocks.push(<p key={k++}>{para.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, `p${k}-${j}`)}</Fragment>)}</p>)
  }
  return <div className={'md' + (className ? ' ' + className : '')}>{blocks}</div>
}
