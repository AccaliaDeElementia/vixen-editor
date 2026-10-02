'use sanity'

import { language } from '@codemirror/language'
import { EditorState, StateField } from '@codemirror/state'
import { describe, expect, it } from 'vitest'

import { TestOnly } from '../../../src/client/editor/decorations.ts'
import { createEditorState } from '../../../src/client/editor/markdown-setup.ts'

const { vixenDecorationField } = TestOnly

describe('createEditorState', () => {
  it('seeds the document', () => {
    expect(createEditorState({ doc: '# hello' }).doc.toString()).toBe('# hello')
  })

  it('defaults to an empty document', () => {
    expect(createEditorState().doc.toString()).toBe('')
  })

  it('returns an EditorState', () => {
    expect(createEditorState()).toBeInstanceOf(EditorState)
  })

  it('installs the vixen decoration field', () => {
    const state = createEditorState({ doc: '# hello' })

    expect(state.field(vixenDecorationField)).toBeDefined()
  })

  it('configures a markdown language', () => {
    expect(createEditorState({ doc: '# hello' }).facet(language)?.name).toBe('markdown')
  })

  it('appends caller-supplied extensions', () => {
    const marker = StateField.define<string>({
      create: () => 'present',
      update: (value) => value,
    })

    const state = createEditorState({ extensions: [marker] })

    expect(state.field(marker)).toBe('present')
  })

  it('applies decorations to the seeded document', () => {
    const state = createEditorState({ doc: '# hello' })
    const decorations = state.field(vixenDecorationField)

    expect(decorations.size).toBe(1)
  })
})

describe('the initial selection', () => {
  it('starts at the top when none is given', () => {
    expect(createEditorState({ doc: '# notes\n\nbody' }).selection.main.head).toBe(0)
  })

  it('opens at the caret it was handed, so a remembered position survives the reload', () => {
    expect(createEditorState({ doc: '# notes\n\nbody', selection: { anchor: 9 } }).selection.main.head).toBe(9)
  })
})
