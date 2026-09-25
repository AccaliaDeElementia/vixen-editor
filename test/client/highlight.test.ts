'use sanity'

import { highlightingFor, language } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { tags, type Tag } from '@lezer/highlight'
import { describe, expect, it } from 'vitest'

import { vixenHighlighting, TestOnly } from '../../src/client/editor/highlight.ts'
import { createEditorState } from '../../src/client/editor/markdown-setup.ts'

const { vixenHighlightStyle } = TestOnly

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

    expect(state.facet(language)).not.toBeNull()
    expect(highlightingFor(state, [tags.heading])).not.toBeNull()
  })

  it('styles markdown syntax markers, which the bundled light theme renders near-black', () => {
    // tags.processingInstruction covers the `#`, `*` and backtick markers.
    expect(styleFor(tags.processingInstruction)).toContain('#adb5bd')
  })

  it('renders headings in white so they read against the dark surface', () => {
    expect(styleFor(tags.heading)).toContain('#ffffff')
  })

  it.each([
    ['links', tags.link, '#3498db'],
    ['inline code', tags.monospace, '#00bc8c'],
    ['quotes', tags.quote, '#adb5bd'],
    ['invalid syntax', tags.invalid, '#e74c3c'],
  ])('colours %s from the Darkly ramp', (_label, tag, expected) => {
    expect(styleFor(tag)).toContain(expected)
  })

  it('keeps every colour it defines off the dark background', () => {
    const nearBlack = /#(?:0{3,6}|1[0-9a-f]|2[0-2])/v
    const rules = vixenHighlightStyle.module?.getRules() ?? ''

    expect(rules).not.toMatch(nearBlack)
  })
})
