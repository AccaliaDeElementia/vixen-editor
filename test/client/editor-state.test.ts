'use sanity'

import { language } from '@codemirror/language'
import { EditorState, StateField } from '@codemirror/state'
import { describe, expect, it } from 'vitest'

import { vixenDecorationField } from '../../client/editor/decorations.ts'
import { createEditorState } from '../../client/editor/markdown-setup.ts'

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
    // Without a language extension this facet resolves to null.
    expect(createEditorState({ doc: '# hello' }).facet(language)).not.toBeNull()
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
