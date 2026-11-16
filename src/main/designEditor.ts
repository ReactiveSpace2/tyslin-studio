/**
 * Hand editing on the Design board (17 Nov 2026). An artboard opened for editing is served with `?edit=1`; the
 * preview protocol then adds one script tag, `/__tyslin__/editor.js`, served from the same locked-down origin (so the
 * page CSP allows it). The script lets the boss pick any part of the artboard, change its text in place and take
 * style changes from the board's side panel, and after every change posts the whole page back to the board, which
 * saves it into the same file (the user's own edit, like Files: no review). The board talks to it with postMessage
 * ({ tyslin: 1, type }). No Electron imports here, so tests can load it.
 */

export const EDITOR_PATH = '__tyslin__/editor.js'
const TAG = `<script data-tyslin-ui src="/${EDITOR_PATH}"></script>`

/** The artboard's HTML with the editor script added before </body> (or at the end). */
export function injectEditor(html: string): string {
  const i = html.toLowerCase().lastIndexOf('</body>')
  return i >= 0 ? html.slice(0, i) + TAG + html.slice(i) : html + TAG
}

/** Runs inside the artboard's frame. Plain DOM code, typed loosely because main has no DOM types. */
/* eslint-disable @typescript-eslint/no-explicit-any */
function editorMain(): void {
  const w: any = globalThis
  const doc: any = w.document
  if (w.__tyslinEditor || w.parent === w) return
  w.__tyslinEditor = true
  const post = (m: Record<string, unknown>): void => w.parent.postMessage(Object.assign({ tyslin: 1 }, m), '*')
  let editing = false
  let sel: any = null
  let editingText = false

  const overlay = (border: string): any => {
    const d = doc.createElement('div')
    d.setAttribute('data-tyslin-ui', '')
    d.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;display:none;box-sizing:border-box;' + border
    doc.documentElement.appendChild(d)
    return d
  }
  const hov = overlay('border:1px dashed #4A7000')
  const box = overlay('border:2px solid #7DB800')
  const place = (d: any, el: any): void => {
    if (!el || !el.isConnected) { d.style.display = 'none'; return }
    const r = el.getBoundingClientRect()
    d.style.display = 'block'
    d.style.left = r.left + 'px'; d.style.top = r.top + 'px'; d.style.width = r.width + 'px'; d.style.height = r.height + 'px'
  }
  const pickable = (el: any): boolean => !!el && el.nodeType === 1 && el !== doc.documentElement && el !== doc.body && !el.closest('[data-tyslin-ui]')
  const BLOCK = /^(block|flex|grid|table|list-item)$/
  const textOnly = (el: any): boolean => Array.prototype.every.call(el.children, (c: any) => !BLOCK.test(w.getComputedStyle(c).display))

  const describe = (el: any): Record<string, unknown> => {
    const cs = w.getComputedStyle(el)
    const tag = el.tagName.toLowerCase()
    const r = el.getBoundingClientRect()
    return {
      type: 'select', tag,
      label: tag + (el.id ? '#' + el.id : el.classList.length ? '.' + el.classList[0] : ''),
      text: el.children.length === 0 ? el.textContent : null,
      canEditText: tag !== 'img' && textOnly(el) && !!el.textContent.trim(),
      color: cs.color, background: cs.backgroundColor,
      fontSize: parseFloat(cs.fontSize) || 0, fontWeight: cs.fontWeight,
      radius: parseFloat(cs.borderTopLeftRadius) || 0, padding: parseFloat(cs.paddingTop) || 0,
      align: cs.textAlign, width: Math.round(r.width), height: Math.round(r.height),
      canParent: !!el.parentElement && pickable(el.parentElement)
    }
  }
  const serialize = (): string => {
    const c = doc.documentElement.cloneNode(true)
    c.querySelectorAll('[data-tyslin-ui]').forEach((n: any) => n.remove())
    c.querySelectorAll('[contenteditable]').forEach((n: any) => n.removeAttribute('contenteditable'))
    return (doc.doctype ? '<!doctype ' + doc.doctype.name + '>\n' : '') + c.outerHTML
  }
  const select = (el: any): void => {
    sel = el
    place(box, el)
    post(el ? describe(el) : { type: 'select', none: true })
  }
  const changed = (): void => {
    post({ type: 'html', html: serialize() })
    if (sel && sel.isConnected) select(sel); else select(null)
  }
  const stopText = (save: boolean): void => {
    if (!editingText || !sel) return
    editingText = false
    sel.removeAttribute('contenteditable')
    if (save) changed()
  }
  const startText = (): void => {
    if (!sel || !textOnly(sel) || sel.tagName === 'IMG') return
    editingText = true
    sel.setAttribute('contenteditable', 'true')
    sel.focus()
  }

  doc.addEventListener('mousemove', (e: any) => { if (editing && !editingText) place(hov, pickable(e.target) ? e.target : null) }, true)
  doc.addEventListener('mouseleave', () => { hov.style.display = 'none' }, true)
  doc.addEventListener('click', (e: any) => {
    if (!editing) return
    if (editingText && sel && sel.contains(e.target)) return
    e.preventDefault(); e.stopPropagation()
    stopText(true)
    select(pickable(e.target) ? e.target : null)
  }, true)
  doc.addEventListener('dblclick', (e: any) => {
    if (!editing) return
    e.preventDefault(); e.stopPropagation()
    if (pickable(e.target) && sel !== e.target) select(e.target)
    startText()
  }, true)
  doc.addEventListener('submit', (e: any) => { if (editing) e.preventDefault() }, true)
  doc.addEventListener('keydown', (e: any) => {
    if (!editing) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); stopText(false); post({ type: e.shiftKey ? 'redo' : 'undo' }); return }
    if (editingText) {
      if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); stopText(true) }
      return
    }
    if (e.key === 'Escape') { select(null); return }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); const gone = sel; select(null); gone.remove(); changed() }
  }, true)
  const reflow = (): void => { place(box, sel); hov.style.display = 'none' }
  w.addEventListener('scroll', reflow, true)
  w.addEventListener('resize', reflow)

  w.addEventListener('message', (e: any) => {
    const m = e.data
    if (e.source !== w.parent || !m || m.tyslin !== 1) return
    if (m.type === 'mode') {
      editing = m.mode === 'edit'
      if (!editing) { stopText(true); select(null); hov.style.display = 'none' }
      return
    }
    if (!sel) return
    if (m.type === 'style' && typeof m.prop === 'string') {
      if (m.value === null || m.value === '') sel.style.removeProperty(m.prop); else sel.style.setProperty(m.prop, String(m.value))
      changed()
    } else if (m.type === 'text' && typeof m.value === 'string' && sel.children.length === 0) {
      sel.textContent = m.value; changed()
    } else if (m.type === 'delete') {
      const gone = sel; select(null); gone.remove(); changed()
    } else if (m.type === 'duplicate') {
      const copy = sel.cloneNode(true); sel.after(copy); sel = copy; changed()
    } else if (m.type === 'parent' && sel.parentElement && pickable(sel.parentElement)) {
      select(sel.parentElement)
    } else if (m.type === 'editText') {
      startText()
    } else if (m.type === 'deselect') {
      stopText(true); select(null)
    }
  })
  post({ type: 'ready' })
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The script the protocol serves at EDITOR_PATH. */
export const EDITOR_JS = `(${editorMain.toString()})();\n`
