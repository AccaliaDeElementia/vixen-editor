'use sanity'

import { language } from '@codemirror/language'
import { EditorState, StateField } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { beforeEach, describe, expect, it } from 'vitest'

import { TestOnly } from '../../../src/client/editing/decorations.ts'
import { createEditorState } from '../../../src/client/editing/markdown-setup.ts'

import { trackView } from '../editor-fixtures.ts'

const { vixenDecorationField } = TestOnly

function contentOf(doc = ''): HTMLElement {
  const parent = document.createElement('div')
  document.body.append(parent)

  return trackView(new EditorView({ parent, state: createEditorState({ doc }) })).contentDOM
}

beforeEach(() => {
  document.body.innerHTML = ''
})

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

describe('what a composed editor tells the browser about its own text', () => {
  it('leaves autocorrect off, because a list marker is not a sentence to be fixed', () => {
    expect(contentOf().getAttribute('autocorrect')).toBe('off')
  })

  it('leaves autocapitalise off, for the same reason', () => {
    expect(contentOf().getAttribute('autocapitalize')).toBe('off')
  })

  it('leaves the role alone, since CodeMirror owns it', () => {
    expect(contentOf().getAttribute('role')).toBe('textbox')
  })
})

describe('the extensions a composed editor carries', () => {
  it('names itself for a screen reader, so the labelling extension is wired up', () => {
    expect(contentOf().getAttribute('aria-label')).toBe('Document')
  })

  it('asks for the spell checker, so the spelling extension is wired up', () => {
    expect(contentOf().getAttribute('spellcheck')).toBe('true')
  })
})
