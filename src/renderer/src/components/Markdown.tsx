import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A small Markdown renderer for agent replies: headings, paragraphs, bold, italic, inline code, code blocks,
 * bullet and numbered lists, quotes, rules and links. It builds React elements only (never raw HTML), so a reply
 * can't inject markup. Links open in the system browser (http/https/mailto only).
 */

const SAFE_LINK = /^(https?:|mailto:)/i

// Classes on the elements this renderer creates (no stylesheet needed).
const C = {
  code: 'rounded-[5px] border border-border bg-panel px-[5px] py-px font-mono text-[0.88em]',
  pre: 'mb-2.5 overflow-x-auto rounded-lg border border-border bg-panel px-3.5 py-3 font-mono text-[13px] leading-normal',
  h: 'mt-4 mb-1.5 text-[15.5px] font-semibold leading-[1.4]',
  p: 'mb-2.5',
  list: 'mb-2.5 flex flex-col gap-1 pl-[22px] marker:text-muted-foreground',
  quote: 'mb-2.5 border-l-[3px] border-border py-0.5 pl-3 text-muted-foreground',
  hr: 'my-3.5 border-0 border-t border-border',
  a: 'text-green underline underline-offset-2',
  strong: 'font-semibold',
  em: 'italic'
}

/** Inline: `code`, **bold**, *italic* / _italic_, [text](url), bare https:// links. Inside a link's text (`inLink`) nothing becomes a link again (an <a> inside an <a>, 10 Nov 2026). */
function inline(text: string, key = 'i', inLink = false): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(\*[^*\s][^*\n]*?\*|\b_[^_\s][^_\n]*?_\b)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g
  let last = 0
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const k = `${key}-${n++}`
    const [tok] = m
    if (m[1]) out.push(<code key={k} className={C.code}>{tok.slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={k} className={C.strong}>{inline(tok.slice(2, -2), k, inLink)}</strong>)
    else if (m[3]) out.push(<em key={k} className={C.em}>{inline(tok.slice(1, -1), k, inLink)}</em>)
    else if (inLink) out.push(tok)
    else if (m[4]) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok) ?? []
      out.push(SAFE_LINK.test(href ?? '') ? <a key={k} className={C.a} href={href} target="_blank" rel="noreferrer">{inline(label ?? '', k, true)}</a> : <Fragment key={k}>{label}</Fragment>)
    } else out.push(<a key={k} className={C.a} href={tok} target="_blank" rel="noreferrer">{tok}</a>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Lines → blocks. */
export function Markdown({ text, className }: { text: string; className?: string }): JSX.Element {
  // HTML comments (the memory files' `<!-- tyslin-agent -->` tag, authors' notes) are not content.
  const lines = text.replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n/g, '\n').split('\n')
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
      blocks.push(<pre key={k++} className={C.pre}><code>{body.join('\n')}</code></pre>)
      continue
    }
    if (!line.trim()) { i++; continue }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const level = Math.min(h[1].length + 2, 6)
      const Tag = `h${level}` as 'h3'
      blocks.push(<Tag key={k++} className={C.h}>{inline(h[2], `h${k}`)}</Tag>)
      i++
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push(<hr key={k++} className={C.hr} />); i++; continue }
    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push(<blockquote key={k++} className={C.quote}>{inline(body.join(' '), `q${k}`)}</blockquote>)
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
      blocks.push(ordered ? <ol key={k++} className={cn(C.list, 'list-decimal')} start={start && start !== 1 ? start : undefined}>{items}</ol> : <ul key={k++} className={cn(C.list, 'list-disc')}>{items}</ul>)
      continue
    }
    // Paragraph: until a blank line or another block starts. Single line breaks are kept.
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && !isList(lines[i]) && !/^\s*>/.test(lines[i])) para.push(lines[i++])
    blocks.push(<p key={k++} className={C.p}>{para.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, `p${k}-${j}`)}</Fragment>)}</p>)
  }
  return <div className={cn('[&>:first-child]:mt-0 [&>:last-child]:mb-0', className)}>{blocks}</div>
}
