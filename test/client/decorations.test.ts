'use sanity'

import { EditorState } from '@codemirror/state'
import type { DecorationSet } from '@codemirror/view'
import { describe, expect, it } from 'vitest'

import { computeDecorations, vixenDecorationField, vixenDecorations } from '../../client/editor/decorations.ts'

interface FlatDecoration {
  from: number
  to: number
  class: string
}

function flatten(set: DecorationSet): FlatDecoration[] {
  const out: FlatDecoration[] = []
  const iter = set.iter()
  while (iter.value !== null) {
    out.push({ from: iter.from, to: iter.to, class: String(iter.value.spec.class) })
    iter.next()
  }
  return out
}

function decorationsFor(doc: string): FlatDecoration[] {
  return flatten(computeDecorations(EditorState.create({ doc })))
}

function classesFor(doc: string): string[] {
  return decorationsFor(doc).map((decoration) => decoration.class)
}

describe('heading decorations', () => {
  it.each([
    ['# one', 1],
    ['## two', 2],
    ['### three', 3],
    ['#### four', 4],
    ['##### five', 5],
    ['###### six', 6],
  ])('decorates %s as level %i', (doc, level) => {
    expect(classesFor(doc)).toStrictEqual([`cm-vixen-heading cm-vixen-heading-${String(level)}`])
  })

  it('anchors the heading decoration at the start of the line', () => {
    expect(decorationsFor('intro\n# title')).toStrictEqual([
      { from: 6, to: 6, class: 'cm-vixen-heading cm-vixen-heading-1' },
    ])
  })

  it('decorates every heading in the document', () => {
    expect(classesFor('# a\ntext\n## b')).toStrictEqual([
      'cm-vixen-heading cm-vixen-heading-1',
      'cm-vixen-heading cm-vixen-heading-2',
    ])
  })

  it('allows leading spaces up to the markdown limit of three', () => {
    expect(classesFor('   # indented')).toStrictEqual(['cm-vixen-heading cm-vixen-heading-1'])
  })

  it.each([
    ['seven hashes', '####### too deep'],
    ['no space after the hashes', '#nospace'],
    ['four leading spaces, which is an indented code block', '    # indented code'],
    ['a hash mid-line', 'text # not a heading'],
    ['an empty document', ''],
    ['plain prose', 'just some text'],
  ])('does not decorate %s', (_label, doc) => {
    expect(classesFor(doc)).toStrictEqual([])
  })

  it('treats a lone hash with no text as a heading', () => {
    expect(classesFor('#')).toStrictEqual(['cm-vixen-heading cm-vixen-heading-1'])
  })
})

describe('marker decorations', () => {
  it.each([
    ['TODO', 'todo'],
    ['FIXME', 'fixme'],
    ['NOTE', 'note'],
  ])('decorates a %s marker', (keyword, modifier) => {
    expect(classesFor(`text ${keyword}: do it`)).toStrictEqual([`cm-vixen-marker cm-vixen-marker-${modifier}`])
  })

  it('spans the keyword and its colon', () => {
    expect(decorationsFor('TODO: x')).toStrictEqual([{ from: 0, to: 5, class: 'cm-vixen-marker cm-vixen-marker-todo' }])
  })

  it('decorates several markers on one line', () => {
    expect(classesFor('TODO: a FIXME: b')).toStrictEqual([
      'cm-vixen-marker cm-vixen-marker-todo',
      'cm-vixen-marker cm-vixen-marker-fixme',
    ])
  })

  it.each([
    ['lowercase', 'todo: x'],
    ['mixed case', 'Todo: x'],
    ['no colon', 'TODO x'],
    ['embedded in a word', 'ANTODO: x'],
    ['followed by letters', 'TODOS: x'],
  ])('does not decorate %s', (_label, doc) => {
    expect(classesFor(doc)).toStrictEqual([])
  })

  it('decorates a marker that ends the document', () => {
    expect(classesFor('TODO:')).toStrictEqual(['cm-vixen-marker cm-vixen-marker-todo'])
  })
})

describe('fenced code blocks', () => {
  it('ignores headings inside a fence', () => {
    expect(classesFor('```\n# not a heading\n```')).toStrictEqual([])
  })

  it('ignores markers inside a fence', () => {
    expect(classesFor('```\nTODO: ignored\n```')).toStrictEqual([])
  })

  it('ignores content inside a tilde fence', () => {
    expect(classesFor('~~~\n# not a heading\n~~~')).toStrictEqual([])
  })

  it('handles an info string on the opening fence', () => {
    expect(classesFor('```ts\n# not a heading\n```')).toStrictEqual([])
  })

  it('resumes decorating after the fence closes', () => {
    expect(classesFor('```\n# inside\n```\n# outside')).toStrictEqual(['cm-vixen-heading cm-vixen-heading-1'])
  })

  it('treats an unterminated fence as running to the end of the document', () => {
    expect(classesFor('```\n# inside\n# still inside')).toStrictEqual([])
  })

  it('does not let a tilde fence be closed by a backtick fence', () => {
    expect(classesFor('~~~\n```\n# still inside')).toStrictEqual([])
  })

  it('decorates before the fence opens', () => {
    expect(classesFor('# before\n```\n# inside\n```')).toStrictEqual(['cm-vixen-heading cm-vixen-heading-1'])
  })
})

describe('ordering', () => {
  it('emits decorations sorted by position', () => {
    const decorations = decorationsFor('# title\nTODO: later\n## sub')
    const positions = decorations.map((decoration) => decoration.from)

    expect(positions).toStrictEqual([...positions].sort((a, b) => a - b))
  })

  it('places a line decoration before a marker on the same line', () => {
    expect(classesFor('# TODO: both')).toStrictEqual([
      'cm-vixen-heading cm-vixen-heading-1',
      'cm-vixen-marker cm-vixen-marker-todo',
    ])
  })
})

describe('vixenDecorationField', () => {
  function stateFor(doc: string): EditorState {
    return EditorState.create({ doc, extensions: [vixenDecorations] })
  }

  it('populates the field when the state is created', () => {
    expect(flatten(stateFor('# title').field(vixenDecorationField))).toStrictEqual([
      { from: 0, to: 0, class: 'cm-vixen-heading cm-vixen-heading-1' },
    ])
  })

  it('recomputes the field when the document changes', () => {
    const state = stateFor('plain')
    const next = state.update({ changes: { from: 0, to: 5, insert: '# title' } }).state

    expect(flatten(next.field(vixenDecorationField))).toStrictEqual([
      { from: 0, to: 0, class: 'cm-vixen-heading cm-vixen-heading-1' },
    ])
  })

  it('leaves the field untouched when a transaction does not change the document', () => {
    const state = stateFor('# title')
    const next = state.update({ selection: { anchor: 1 } }).state

    expect(next.field(vixenDecorationField)).toBe(state.field(vixenDecorationField))
  })

  it('clears decorations when the heading is removed', () => {
    const state = stateFor('# title')
    const next = state.update({ changes: { from: 0, to: 2, insert: '' } }).state

    expect(flatten(next.field(vixenDecorationField))).toStrictEqual([])
  })
})
