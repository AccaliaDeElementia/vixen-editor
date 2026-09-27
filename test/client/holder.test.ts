'use sanity'

import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'

import { createHolderControl, holderOf } from '../../src/client/editor/holder.ts'
import { createEditorState } from '../../src/client/editor/markdown-setup.ts'

function editor(extension: ReturnType<typeof createHolderControl>['unset']): EditorView {
  const parent = document.createElement('div')
  document.body.append(parent)

  return new EditorView({ parent, state: createEditorState({ doc: 'x', extensions: [extension] }) })
}

describe('the path of the document in the buffer', () => {
  it('is the store root until something says otherwise', () => {
    const holder = createHolderControl()

    expect(holderOf(editor(holder.unset).state)).toBe('')
  })

  it('is what the editor last followed', () => {
    const holder = createHolderControl()
    const view = editor(holder.unset)

    holder.follow(view, 'journal/2026/a.md')

    expect(holderOf(view.state)).toBe('journal/2026/a.md')
  })

  it('changes again when the document moves underneath the buffer', () => {
    const holder = createHolderControl()
    const view = editor(holder.unset)

    holder.follow(view, 'journal/a.md')
    holder.follow(view, 'archive/a.md')

    expect(holderOf(view.state)).toBe('archive/a.md')
  })

  it('survives an edit, because it is configuration rather than content', () => {
    const holder = createHolderControl()
    const view = editor(holder.unset)
    holder.follow(view, 'journal/a.md')

    view.dispatch({ changes: { from: 0, insert: 'typing ' } })

    expect(holderOf(view.state)).toBe('journal/a.md')
  })

  it('is forgotten when the buffer is replaced wholesale', () => {
    const holder = createHolderControl()
    const view = editor(holder.unset)
    holder.follow(view, 'journal/a.md')

    view.setState(createEditorState({ doc: 'next', extensions: [holder.unset] }))

    expect(holderOf(view.state)).toBe('')
  })
})
