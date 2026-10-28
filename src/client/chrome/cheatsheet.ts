'use sanity'

import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

import { createEditorState } from '../editing/markdown-setup.ts'

const CHEATSHEET_URL = '/assets/markdown-cheatsheet.md'
const MOUNT_SELECTOR = '[data-part="cheatsheet"]'
const COULD_NOT_LOAD = 'The markdown cheatsheet could not be loaded.'
const REACHABLE_BY_KEYBOARD = '0'

async function cheatsheetText(fetchImpl: typeof fetch): Promise<string> {
  const answer = await fetchImpl(CHEATSHEET_URL).catch(() => null)
  if (answer?.ok !== true) return COULD_NOT_LOAD

  return await answer.text()
}

export async function mountCheatsheet(into: ParentNode, fetchImpl: typeof fetch = fetch): Promise<EditorView | null> {
  const mount = into.querySelector(MOUNT_SELECTOR)
  if (mount === null || mount.hasChildNodes()) return null

  const view = new EditorView({
    parent: mount,
    state: createEditorState({
      doc: await cheatsheetText(fetchImpl),
      extensions: [EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.lineWrapping],
    }),
  })
  view.scrollDOM.setAttribute('tabindex', REACHABLE_BY_KEYBOARD)

  return view
}

export const TestOnly = { CHEATSHEET_URL, COULD_NOT_LOAD }
