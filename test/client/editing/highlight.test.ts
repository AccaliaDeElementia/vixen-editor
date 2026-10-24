'use sanity'

import { given } from '../../conditions.ts'
import { highlightingFor, language } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { tags, type Tag } from '@lezer/highlight'
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'

import { vixenHighlighting, vixenHighlightStyle } from '../../../src/client/editing/highlight.ts'
import { createEditorState } from '../../../src/client/editing/markdown-setup.ts'

function classesFor(tag: Tag): string | null {
  const state = EditorState.create({ extensions: [vixenHighlighting] })
  return highlightingFor(state, [tag])
}

function styleFor(tag: Tag): string {
  const className = classesFor(tag)
  if (className === null) return ''

  const rules = vixenHighlightStyle.module?.getRules() ?? ''
  const selector = className.split(' ').at(-1) ?? ''
  const match = new RegExp(`\\.${selector}\\s*\\{([^\\}]*)\\}`, 'v').exec(rules)
  return match?.[1] ?? ''
}

describe('vixenHighlightStyle', () => {
  it('is installed by the editor state', () => {
    const state = createEditorState({ doc: '# hello' })

    given(() => {
      expect(state.facet(language)).not.toBeNull()
    })

    expect(highlightingFor(state, [tags.heading])).not.toBeNull()
  })

  it('styles markdown syntax markers, which the bundled light theme renders near-black', () => {
    // tags.processingInstruction covers the `#`, `*` and backtick markers.
    expect(styleFor(tags.processingInstruction)).toContain('var(--muted)')
  })

  it.each([
    ['headings', tags.heading, 'var(--ink-heading)'],
    ['links', tags.link, 'var(--ink-info)'],
    ['inline code', tags.monospace, 'var(--ink-success)'],
    ['quotes', tags.quote, 'var(--muted)'],
    ['thematic breaks', tags.contentSeparator, 'var(--ink-primary)'],
    ['invalid syntax', tags.invalid, 'var(--ink-danger)'],
    ['html tag names', tags.tagName, 'var(--ink-info)'],
    ['html attribute names', tags.attributeName, 'var(--ink-warning)'],
    ['strings and attribute values', tags.string, 'var(--ink-success)'],
    ['comments', tags.comment, 'var(--muted)'],
    ['punctuation', tags.punctuation, 'var(--muted)'],
    ['operators', tags.operator, 'var(--muted)'],
  ])('reads the colour of %s from a token, so the colour scheme decides it', (_label, tag, expected) => {
    expect(styleFor(tag)).toContain(expected)
  })

  it('names a token for every colour it sets, so no scheme is baked into the bundle', () => {
    const literalColour = /(?<!-)\b(?:color|background):(?!\s*var\()/v
    const rules = vixenHighlightStyle.module?.getRules() ?? ''

    expect(literalColour.exec(rules)).toBeNull()
  })
})

describe('the editor surface', () => {
  it('declares itself dark, so CodeMirror serves the dark half of its own themes', () => {
    expect(createEditorState().facet(EditorView.darkTheme)).toBe(true)
  })
})
