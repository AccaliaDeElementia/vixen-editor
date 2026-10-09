'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { EditorView } from '@codemirror/view'

import { createEditorState } from '../../../src/client/editor/markdown-setup.ts'
import { trackView } from '../editor-fixtures.ts'

function contentOf(doc = ''): HTMLElement {
  const parent = document.createElement('div')
  document.body.append(parent)

  return trackView(new EditorView({ state: createEditorState({ doc }), parent })).contentDOM
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('what the editor tells the browser about its own text', () => {
  it('asks for the reader’s spell checker, which CodeMirror turns off by default', () => {
    expect(contentOf().getAttribute('spellcheck')).toBe('true')
  })

  it('leaves autocorrect off, because a list marker is not a sentence to be fixed', () => {
    expect(contentOf().getAttribute('autocorrect')).toBe('off')
  })

  it('leaves autocapitalise off, for the same reason', () => {
    expect(contentOf().getAttribute('autocapitalize')).toBe('off')
  })
})

describe('what the editor tells the browser about its markup', () => {
  function markup(doc: string): HTMLElement | null {
    return contentOf(doc).querySelector('[spellcheck]')
  }

  it('turns the checker off over a code span, which is the whole point of scoping it', () => {
    expect(markup('some `codeSpan` here')?.getAttribute('spellcheck')).toBe('false')
  })

  it('leaves prose alone, so the scoping is narrower than the whole document', () => {
    expect(markup('just ordinary prose here')).toBeNull()
  })
})
