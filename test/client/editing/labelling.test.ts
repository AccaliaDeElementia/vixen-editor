'use sanity'

import { EditorView } from '@codemirror/view'
import { beforeEach, describe, expect, it } from 'vitest'

import { EditorState, type Extension } from '@codemirror/state'

import { createHolderControl } from '../../../src/client/editing/holder.ts'
import { vixenEditorLabel } from '../../../src/client/editing/labelling.ts'

import { trackView } from '../editor-fixtures.ts'

function editing(entryPath: string | null): EditorView {
  const holder = createHolderControl()
  const parent = document.createElement('div')
  document.body.append(parent)

  const view = trackView(new EditorView({ parent, state: labelling(holder.unset) }))
  if (entryPath !== null) holder.follow(view, entryPath)

  return view
}

function labelling(held: Extension): EditorState {
  return EditorState.create({ doc: 'x', extensions: [held, vixenEditorLabel] })
}

function labelOf(view: EditorView): string | null {
  return view.contentDOM.getAttribute('aria-label')
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('the name a screen reader reads for the editor', () => {
  it('is the document being edited', () => {
    expect(labelOf(editing('journal/2026/notes.md'))).toBe('journal/2026/notes.md')
  })

  it('is never absent, or the editor announces as an unlabelled text box', () => {
    expect(labelOf(editing(null))).toBe('Document')
  })

  it('follows the document when it moves underneath the buffer', () => {
    const holder = createHolderControl()
    const parent = document.createElement('div')
    document.body.append(parent)
    const view = trackView(new EditorView({ parent, state: labelling(holder.unset) }))

    holder.follow(view, 'journal/notes.md')
    holder.follow(view, 'archive/notes.md')

    expect(labelOf(view)).toBe('archive/notes.md')
  })
})
