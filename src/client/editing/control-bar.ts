'use sanity'

import { redo, undo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { Command, KeyBinding } from '@codemirror/view'

import { chordsForControls, KEYS } from '../platform/help.ts'
import { ariaKeysFor, nameOfChords, platformOf, type KeyPlatform } from '../platform/key-spelling.ts'
import type { DocumentTab } from '../document/document-tab.ts'

import { linkedAround, markedWith, prefixedWith } from './formatting.ts'

type Formatting = (state: EditorState) => TransactionSpec

interface Control {
  part: string
  format: Formatting
}

interface ChordedControl extends Control {
  key: string
}

interface CommandControl {
  part: string
  run: Command
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

const HISTORY: readonly CommandControl[] = [
  { part: 'edit-undo', run: undo },
  { part: 'edit-redo', run: redo },
]

export interface DocumentControls {
  showMarkup: () => void
  showSource: () => void
  saveHtml: () => void
  print: () => void
}

interface ControlBarOptions {
  editor: () => DocumentTab
  documentControls: () => DocumentControls
}

const NAMED = 'aria-label'
const SHORTCUT = 'aria-keyshortcuts'

function hintAtTheChords(host: ParentNode, platform: KeyPlatform): void {
  for (const { part, chords } of chordsForControls()) {
    const control = host.querySelector<HTMLElement>(`[data-part="${part}"]`)
    const named = control?.getAttribute(NAMED) ?? null
    if (control === null || named === null) continue

    control.title = `${named} (${nameOfChords(chords, platform)})`
    control.setAttribute(SHORTCUT, ariaKeysFor(chords, platform))
  }
}

function onClick(host: ParentNode, part: string, run: () => void): void {
  host.querySelector<HTMLElement>(`[data-part="${part}"]`)?.addEventListener('click', run)
}

function applying(format: Formatting): Command {
  return (view) => {
    view.dispatch(format(view.state))

    return true
  }
}

const RETURNING_TO_THE_TEXT: readonly CommandControl[] = [
  ...[...CHORDED, ...POINTER_ONLY].map(({ part, format }) => ({ part, run: applying(format) })),
  ...HISTORY,
]

export const formattingKeys: readonly KeyBinding[] = CHORDED.map(({ key, format }) => ({
  key,
  run: applying(format),
}))

export function bindControlBar(
  host: ParentNode,
  options: ControlBarOptions,
  platform: KeyPlatform = platformOf(navigator),
): void {
  hintAtTheChords(host, platform)

  for (const { part, run } of RETURNING_TO_THE_TEXT) {
    onClick(host, part, () => {
      const { view } = options.editor()
      run(view)
      view.focus()
    })
  }

  onClick(host, 'edit-find', () => {
    openSearchPanel(options.editor().view)
  })

  onClick(host, 'preview-markup', () => {
    options.documentControls().showMarkup()
  })
  onClick(host, 'preview-source', () => {
    options.documentControls().showSource()
  })

  onClick(host, 'save-html', () => {
    options.documentControls().saveHtml()
  })

  onClick(host, 'print-document', () => {
    options.documentControls().print()
  })
}
