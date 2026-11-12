import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { bracketMatching, foldGutter, foldKeymap, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import { drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { previewKind } from '@shared/preview'

/**
 * The Files editor's CodeMirror 6 setup (the third approved custom surface, 10 Nov 2026): language by file
 * extension, a theme and syntax colours built only from Tyslin's CSS variables (so light, dark and the accent
 * presets all work), and the shared extension list. No hex colours here: every colour is a token in index.css.
 */

export interface Language { label: string; load: () => Extension | null }

const EXT: Record<string, Language> = {
  md: { label: 'Markdown', load: () => markdown() },
  markdown: { label: 'Markdown', load: () => markdown() },
  html: { label: 'HTML', load: () => html() },
  htm: { label: 'HTML', load: () => html() },
  css: { label: 'CSS', load: () => css() },
  js: { label: 'JavaScript', load: () => javascript({ jsx: true }) },
  mjs: { label: 'JavaScript', load: () => javascript() },
  cjs: { label: 'JavaScript', load: () => javascript() },
  jsx: { label: 'JavaScript JSX', load: () => javascript({ jsx: true }) },
  ts: { label: 'TypeScript', load: () => javascript({ typescript: true }) },
  mts: { label: 'TypeScript', load: () => javascript({ typescript: true }) },
  cts: { label: 'TypeScript', load: () => javascript({ typescript: true }) },
  tsx: { label: 'TypeScript JSX', load: () => javascript({ typescript: true, jsx: true }) },
  json: { label: 'JSON', load: () => json() },
  yml: { label: 'YAML', load: () => yaml() },
  yaml: { label: 'YAML', load: () => yaml() }
}

export const extOf = (path: string): string => {
  const name = path.split('/').pop() ?? ''
  const i = name.lastIndexOf('.')
  return i <= 0 ? '' : name.slice(i + 1).toLowerCase()
}

export function languageFor(path: string): Language {
  return EXT[extOf(path)] ?? { label: 'Plain text', load: () => null }
}

/** What the editor does with a file: text opens in Edit; images and PDFs open in Preview only. */
/** `office`: Word, Excel, slides and old Office formats; they open in Preview only (CSV and TSV stay text). */
export type FileKind = 'text' | 'image' | 'pdf' | 'office'
export function fileKind(path: string): FileKind {
  const k = previewKind(path)
  if (k === 'pdf') return 'pdf'
  if (k === 'image' && extOf(path) !== 'svg') return 'image'
  if (k === 'word' || k === 'slides' || k === 'office' || (k === 'sheet' && extOf(path) !== 'csv' && extOf(path) !== 'tsv')) return 'office'
  return 'text'
}
/** Preview is offered for Markdown, HTML, images, PDFs and Office files (through components/FilePreview.tsx). */
export const canPreview = (path: string): boolean => previewKind(path) !== null

/** Tabs or the smallest space indent the file uses (2 when it doesn't say). */
export function detectIndent(text: string): { label: string; unit: string } {
  let tabs = 0
  let min = 0
  const lines = text.split('\n', 2000)
  for (const l of lines) {
    if (l.startsWith('\t')) tabs++
    else {
      const m = /^( +)\S/.exec(l)
      if (m && (min === 0 || m[1].length < min)) min = m[1].length
    }
  }
  if (tabs > lines.length / 10 && tabs > 0) return { label: 'Tabs', unit: '\t' }
  const n = min >= 2 && min <= 8 ? min : 2
  return { label: `Spaces: ${n}`, unit: ' '.repeat(n) }
}

const reducedMotion = (): boolean => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

export const tyslinTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--card)', color: 'var(--ink)', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '22px' },
  '.cm-content': { caretColor: 'var(--green)', padding: '6px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--green)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--code-selection)' },
  '.cm-selectionBackground': { outline: '1px solid var(--green)' },
  '.cm-activeLine': { backgroundColor: 'var(--lime-soft)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--code-selection)' },
  '.cm-gutters': { backgroundColor: 'var(--card)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--lime-soft)', color: 'var(--ink)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px', minWidth: '36px' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', cursor: 'pointer' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: '4px', padding: '0 4px' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'transparent', outline: '1px solid var(--green)' },
  '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'var(--danger-soft)', outline: '1px solid var(--danger)' },
  '.cm-searchMatch': { backgroundColor: 'var(--lime-soft)', outline: '1px solid var(--green)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--code-selection)' },
  '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--ink)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--line)' },
  '.cm-panel.cm-search': { fontFamily: 'var(--font)', fontSize: '13px', padding: '8px 44px 8px 10px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' },
  '.cm-panel.cm-search br': { display: 'none' },
  '.cm-panel.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--muted)' },
  '.cm-textfield': { backgroundColor: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '6px', padding: '4px 8px', fontFamily: 'var(--mono)', fontSize: '13px', margin: '0' },
  '.cm-textfield:focus': { outline: '2px solid var(--green)', outlineOffset: '1px' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '6px', padding: '4px 10px', fontFamily: 'var(--font)', fontSize: '13px', margin: '0', minHeight: '30px' },
  '.cm-button:hover': { backgroundColor: 'var(--line-soft)' },
  '.cm-panel.cm-search [name=close]': { color: 'var(--muted)', fontSize: '18px', width: '30px', height: '30px', right: '6px', top: '6px' },
  '.cm-tooltip': { backgroundColor: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '8px' },
  // @codemirror/merge, unified view: added lines and removed chunks use the diff tokens.
  '&.cm-merge-b .cm-changedLine, .cm-inlineChangedLine': { backgroundColor: 'var(--diff-add)' },
  '.cm-deletedChunk': { backgroundColor: 'var(--diff-del)', paddingLeft: '6px' },
  '&.cm-merge-b .cm-changedText': { background: 'linear-gradient(var(--green), var(--green)) bottom/100% 2px no-repeat' },
  '.cm-deletedChunk .cm-deletedText, &.cm-merge-b .cm-deletedText': { background: 'linear-gradient(var(--danger), var(--danger)) bottom/100% 2px no-repeat' },
  '.cm-changedLineGutter': { backgroundColor: 'var(--green)' },
  '.cm-deletedLineGutter': { backgroundColor: 'var(--danger)' },
  '.cm-collapsedLines': { backgroundColor: 'var(--panel)', background: 'var(--panel)', color: 'var(--muted)', fontFamily: 'var(--font)', fontSize: '12px' }
})

export const tyslinHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.self], color: 'var(--green)', fontWeight: '500' },
  { tag: [t.string, t.special(t.string), t.regexp, t.attributeValue, t.character], color: 'var(--text-amber)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName, t.attributeName, t.typeName, t.className], color: 'var(--text-teal)' },
  { tag: [t.number, t.bool, t.null, t.atom, t.unit], color: 'var(--text-violet)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [t.tagName, t.heading], color: 'var(--green)', fontWeight: '600' },
  { tag: [t.link, t.url], color: 'var(--green)', textDecoration: 'underline' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.meta, t.processingInstruction], color: 'var(--muted)' },
  { tag: t.invalid, color: 'var(--danger)' }
])

/** Everything every editor state shares (not the language, read-only or wrap: those are per file). */
export function baseExtensions(): Extension[] {
  return [
    lineNumbers(),
    foldGutter({ openText: '▾', closedText: '▸' }),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection({ cursorBlinkRate: reducedMotion() ? 0 : 1200 }),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    syntaxHighlighting(tyslinHighlight),
    tyslinTheme,
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab])
  ]
}

export const indentFor = (unit: string): Extension => indentUnit.of(unit)
