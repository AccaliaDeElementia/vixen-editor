'use sanity'

import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { EditorView, KeyBinding } from '@codemirror/view'

import { KEYS } from '../help.ts'
import type { DocumentTab } from './document-tab.ts'

import { linkedAround, markedWith, prefixedWith } from './formatting.ts'

type Formatting = (state: EditorState) => TransactionSpec

interface Control {
  part: string
  format: Formatting
}

interface ChordedControl extends Control {
  key: string
}

function around(marker: string): Formatting {
  return (state: EditorState) => markedWith(state, marker)
}

function starting(prefix: string): Formatting {
  return (state: EditorState) => prefixedWith(state, prefix)
}

const CHORDED: readonly ChordedControl[] = [
  { part: 'format-bold', key: KEYS.bold, format: around('**') },
  { part: 'format-italic', key: KEYS.italic, format: around('_') },
  { part: 'format-code', key: KEYS.code, format: around('`') },
  { part: 'format-link', key: KEYS.link, format: linkedAround },
]

const POINTER_ONLY: readonly Control[] = [
  { part: 'format-strikethrough', format: around('~~') },
  { part: 'format-heading', format: starting('# ') },
  { part: 'format-list', format: starting('- ') },
  { part: 'format-quote', format: starting('> ') },
]

export interface PreviewControls {
  showMarkup: () => void
  showSource: () => void
}

interface ControlBarOptions {
  editor: () => DocumentTab
  previewing: () => PreviewControls
}

function onClick(host: ParentNode, part: string, run: () => void): void {
  host.querySelector<HTMLElement>(`[data-part="${part}"]`)?.addEventListener('click', run)
}

function applying(format: Formatting): (view: EditorView) => boolean {
  return (view: EditorView) => {
    view.dispatch(format(view.state))

    return true
  }
}

export const formattingKeys: readonly KeyBinding[] = CHORDED.map(({ key, format }) => ({
  key,
  preventDefault: true,
  run: applying(format),
}))

export function bindControlBar(host: ParentNode, options: ControlBarOptions): void {
  for (const { part, format } of [...CHORDED, ...POINTER_ONLY]) {
    onClick(host, part, () => {
      const { view } = options.editor()
      view.dispatch(format(view.state))
      view.focus()
    })
  }

  onClick(host, 'preview-markup', () => {
    options.previewing().showMarkup()
  })
  onClick(host, 'preview-source', () => {
    options.previewing().showSource()
  })
}
