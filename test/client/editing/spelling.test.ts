'use sanity'

import { EditorState, type Extension } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { beforeEach, describe, expect, it } from 'vitest'

import { isSyntax, notProse, vixenSpellcheck } from '../../../src/client/editing/spelling.ts'

import { trackView } from '../editor-fixtures.ts'

const MARKED_FROM = 3
const MARKED_TO = 7

function showing(doc: string, extensions: Extension[]): HTMLElement {
  const parent = document.createElement('div')
  document.body.append(parent)

  return trackView(new EditorView({ parent, state: EditorState.create({ doc, extensions }) })).contentDOM
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('asking the browser to check the spelling', () => {
  it('turns the checker on, which CodeMirror leaves off by default', () => {
    expect(showing('', [vixenSpellcheck]).getAttribute('spellcheck')).toBe('true')
  })
})

describe('the mark that keeps the checker off a stretch of text', () => {
  it('turns it off over exactly what it covers', () => {
    const marks = EditorView.decorations.of(() => Decoration.set([notProse.range(MARKED_FROM, MARKED_TO)]))

    expect(showing('a: wrod :b', [marks]).querySelector('[spellcheck="false"]')?.textContent).toBe('wrod')
  })

  it('leaves the rest of the line to the checker', () => {
    const marks = EditorView.decorations.of(() => Decoration.set([notProse.range(MARKED_FROM, MARKED_TO)]))

    expect(showing('a: wrod :b', [marks]).textContent).toBe('a: wrod :b')
  })
})

describe('which parts of markdown are syntax rather than prose', () => {
  it.each(['Autolink', 'CodeBlock', 'FencedCode', 'InlineCode', 'URL'])('counts %s', (nodeName) => {
    expect(isSyntax(nodeName)).toBe(true)
  })

  it('does not count a paragraph, which is the prose a reader wrote', () => {
    expect(isSyntax('Paragraph')).toBe(false)
  })

  it('does not count a link label, which is prose inside syntax', () => {
    expect(isSyntax('Link')).toBe(false)
  })
})
