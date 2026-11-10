import { useCallback, useEffect, useRef } from 'react'
import { Compartment, EditorSelection, EditorState, type Text, type TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { baseExtensions, detectIndent, indentFor, languageFor } from './editorSetup'

/**
 * One CodeMirror EditorView for the Files screen and one EditorState per open file, so every tab keeps its own
 * undo history, selection and scroll position. Switching tabs swaps the state into the view (setState).
 * The renderer never writes files itself: saving goes through window.tyslin.drive.writeText.
 */

export interface DocInfo { indent: string; language: string }
export interface Cursor { line: number; col: number }
interface Callbacks {
  onChange: (key: string, doc: Text) => void
  onCursor: (c: Cursor) => void
}

const readOnlyComp = new Compartment()
const wrapComp = new Compartment()
const langComp = new Compartment()

export interface CodeMirror {
  /** The element the view mounts in (always rendered; hidden while another view shows). */
  ref: (el: HTMLDivElement | null) => void
  has: (key: string) => boolean
  /** Creates the state for a file. Returns its indent and language for the footer. */
  open: (key: string, path: string, text: string, opts: { readOnly: boolean; wrap: boolean }) => DocInfo
  /** Shows a file's state in the view (null = nothing). */
  show: (key: string | null) => void
  close: (key: string) => void
  /** Moves a state to a new key (after a rename or move). */
  rename: (from: string, to: string) => void
  /** The file's text with its own line endings, as it would be saved. */
  text: (key: string) => string | null
  doc: (key: string) => Text | null
  /** Replaces the text (a reload from disk); undo can still take it back. */
  replace: (key: string, text: string) => void
  setReadOnly: (key: string, readOnly: boolean) => void
  setWrap: (key: string, wrap: boolean) => void
  goto: (key: string, line: number, col?: number, length?: number) => void
  focus: () => void
}

export function useCodeMirror(cb: Callbacks): CodeMirror {
  const view = useRef<EditorView | null>(null)
  const states = useRef(new Map<string, EditorState>())
  /** Each state's listener reads its key from here, so a rename keeps it reporting under the new key. */
  const ids = useRef(new Map<string, { key: string }>())
  const scroll = useRef(new Map<string, number>())
  const active = useRef<string | null>(null)
  const cbRef = useRef(cb)
  cbRef.current = cb

  const ref = useCallback((el: HTMLDivElement | null) => {
    if (el && !view.current) {
      view.current = new EditorView({ parent: el, state: EditorState.create({ doc: '', extensions: [EditorView.editable.of(false)] }) })
      if (active.current && states.current.has(active.current)) view.current.setState(states.current.get(active.current)!)
    } else if (!el && view.current) {
      if (active.current) states.current.set(active.current, view.current.state)
      view.current.destroy()
      view.current = null
    }
  }, [])

  useEffect(() => () => { view.current?.destroy(); view.current = null }, [])

  const stateOf = (key: string): EditorState | null =>
    key === active.current && view.current ? view.current.state : states.current.get(key) ?? null

  const open: CodeMirror['open'] = (key, path, text, opts) => {
    const id = { key }
    ids.current.set(key, id)
    const lang = languageFor(path)
    const indent = detectIndent(text)
    const crlf = /\r\n/.test(text.slice(0, 20000))
    const ext = lang.load()
    const state = EditorState.create({
      doc: text,
      extensions: [
        baseExtensions(),
        crlf ? EditorState.lineSeparator.of('\r\n') : [],
        indentFor(indent.unit),
        EditorState.tabSize.of(indent.unit === '\t' ? 4 : indent.unit.length),
        langComp.of(ext ?? []),
        readOnlyComp.of([EditorState.readOnly.of(opts.readOnly)]),
        wrapComp.of(opts.wrap ? EditorView.lineWrapping : []),
        EditorView.contentAttributes.of({ 'aria-label': `Contents of ${path}` }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cbRef.current.onChange(id.key, u.state.doc)
          if ((u.selectionSet || u.docChanged) && id.key === active.current) {
            const head = u.state.selection.main.head
            const line = u.state.doc.lineAt(head)
            cbRef.current.onCursor({ line: line.number, col: head - line.from + 1 })
          }
        })
      ]
    })
    states.current.set(key, state)
    return { indent: indent.label, language: lang.label }
  }

  const show: CodeMirror['show'] = (key) => {
    const v = view.current
    if (active.current === key) return
    if (v && active.current && states.current.has(active.current)) {
      states.current.set(active.current, v.state)
      scroll.current.set(active.current, v.scrollDOM.scrollTop)
    }
    active.current = key
    if (!v) return
    const s = key ? states.current.get(key) : null
    v.setState(s ?? EditorState.create({ doc: '', extensions: [EditorView.editable.of(false)] }))
    if (key && s) {
      const top = scroll.current.get(key) ?? 0
      requestAnimationFrame(() => { if (active.current === key) v.scrollDOM.scrollTop = top })
      const head = s.selection.main.head
      const line = s.doc.lineAt(head)
      cbRef.current.onCursor({ line: line.number, col: head - line.from + 1 })
    }
  }

  const close: CodeMirror['close'] = (key) => {
    states.current.delete(key)
    ids.current.delete(key)
    scroll.current.delete(key)
    if (active.current === key) {
      active.current = null
      view.current?.setState(EditorState.create({ doc: '', extensions: [EditorView.editable.of(false)] }))
    }
  }

  const rename: CodeMirror['rename'] = (from, to) => {
    const s = stateOf(from)
    if (!s) return
    states.current.delete(from)
    states.current.set(to, s)
    const id = ids.current.get(from)
    if (id) { id.key = to; ids.current.delete(from); ids.current.set(to, id) }
    if (active.current === from) active.current = to
  }

  /** Applies a transaction to a file's state, whether or not it is the one in the view. */
  const apply = (key: string, spec: TransactionSpec): void => {
    if (key === active.current && view.current) { view.current.dispatch(spec); return }
    const s = states.current.get(key)
    if (s) states.current.set(key, s.update(spec).state)
  }

  return {
    ref,
    has: (key) => states.current.has(key) || (key === active.current && !!view.current),
    open,
    show,
    close,
    rename,
    text: (key) => { const s = stateOf(key); return s ? s.sliceDoc() : null },
    doc: (key) => stateOf(key)?.doc ?? null,
    replace: (key, text) => {
      const s = stateOf(key)
      if (!s) return
      const head = Math.min(s.selection.main.head, text.length)
      apply(key, { changes: { from: 0, to: s.doc.length, insert: text }, selection: EditorSelection.cursor(head) })
    },
    setReadOnly: (key, readOnly) => apply(key, { effects: readOnlyComp.reconfigure([EditorState.readOnly.of(readOnly)]) }),
    setWrap: (key, wrap) => apply(key, { effects: wrapComp.reconfigure(wrap ? EditorView.lineWrapping : []) }),
    goto: (key, line, col = 1, length = 0) => {
      const s = stateOf(key)
      if (!s) return
      const l = s.doc.line(Math.max(1, Math.min(line, s.doc.lines)))
      const from = Math.min(l.to, l.from + Math.max(0, col - 1))
      const to = Math.min(l.to, from + length)
      apply(key, { selection: EditorSelection.range(from, to), effects: EditorView.scrollIntoView(from, { y: 'center' }) })
      if (key === active.current) view.current?.focus()
    },
    focus: () => view.current?.focus()
  }
}
