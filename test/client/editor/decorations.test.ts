'use sanity'

import { given } from '../../conditions.ts'
import { EditorState } from '@codemirror/state'
import type { Decoration, DecorationSet } from '@codemirror/view'
import { trackView } from '../editor-fixtures.ts'
import { describe, expect, it } from 'vitest'

import { isRecord } from '../../../src/shared/guards.ts'

import { vixenDecorations, TestOnly } from '../../../src/client/editor/decorations.ts'
import { createEditorState } from '../../../src/client/editor/markdown-setup.ts'
import { createHolderControl } from '../../../src/client/editor/holder.ts'
import { EditorView } from '@codemirror/view'

const { computeDecorations, vixenDecorationField } = TestOnly

interface FlatDecoration {
  from: number
  to: number
  class: string
}

function classOf(decoration: Decoration): string {
  const spec: unknown = decoration.spec

  return isRecord(spec) && typeof spec.class === 'string' ? spec.class : ''
}

function flatten(set: DecorationSet): FlatDecoration[] {
  const out: FlatDecoration[] = []
  const iter = set.iter()
  while (iter.value !== null) {
    out.push({ from: iter.from, to: iter.to, class: classOf(iter.value) })
    iter.next()
  }
  return out
}

function decorationsFor(doc: string): FlatDecoration[] {
  return flatten(computeDecorations(createEditorState({ doc })))
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

  it('decorates a setext heading, which the line scan never recognised', () => {
    expect(classesFor('Title\n=====')).toStrictEqual(['cm-vixen-heading cm-vixen-heading-1'])
  })

  it('anchors a setext heading on its text, not on its underline', () => {
    expect(decorationsFor('Title\n=====')).toStrictEqual([
      { from: 0, to: 0, class: 'cm-vixen-heading cm-vixen-heading-1' },
    ])
  })

  it('decorates the second setext level', () => {
    expect(classesFor('Title\n-----')).toStrictEqual(['cm-vixen-heading cm-vixen-heading-2'])
  })

  it('decorates a heading inside a blockquote, which the line scan skipped', () => {
    expect(decorationsFor('> # quoted')).toStrictEqual([
      { from: 0, to: 0, class: 'cm-vixen-heading cm-vixen-heading-1' },
    ])
  })

  it('decorates a heading inside a list item', () => {
    expect(classesFor('- # listed')).toStrictEqual(['cm-vixen-heading cm-vixen-heading-1'])
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

  it('ignores a marker inside inline code, which the line scan used to decorate', () => {
    expect(classesFor('use `TODO: x` here')).toStrictEqual([])
  })

  it('ignores a marker inside an indented block, which the line scan used to decorate', () => {
    expect(classesFor('    TODO: x')).toStrictEqual([])
  })

  it('decorates a marker that begins where inline code ends, with nothing between', () => {
    expect(classesFor('`code`TODO: x')).toStrictEqual(['cm-vixen-marker cm-vixen-marker-todo'])
  })

  it('still decorates a marker beside inline code on the same line', () => {
    expect(classesFor('`code` TODO: x')).toStrictEqual(['cm-vixen-marker cm-vixen-marker-todo'])
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
    return createEditorState({ doc })
  }

  it('populates the field when the state is created', () => {
    expect(flatten(stateFor('# title').field(vixenDecorationField))).toStrictEqual([
      { from: 0, to: 0, class: 'cm-vixen-heading cm-vixen-heading-1' },
    ])
  })

  it('recomputes the field when the document changes', () => {
    const state = stateFor('plain')
    const { state: next } = state.update({ changes: { from: 0, to: 5, insert: '# title' } })

    expect(flatten(next.field(vixenDecorationField))).toStrictEqual([
      { from: 0, to: 0, class: 'cm-vixen-heading cm-vixen-heading-1' },
    ])
  })

  it('leaves the field untouched when a transaction does not change the document', () => {
    const state = stateFor('# title')
    const { state: next } = state.update({ selection: { anchor: 1 } })

    expect(next.field(vixenDecorationField)).toBe(state.field(vixenDecorationField))
  })

  it('recomputes when the document it holds moves, or the links name the old place', () => {
    const holder = createHolderControl()
    const parent = document.createElement('div')
    document.body.append(parent)
    const view = trackView(
      new EditorView({
        parent,
        state: createEditorState({ doc: '[a](b.md)', extensions: [holder.unset] }),
      }),
    )
    holder.follow(view, 'journal/notes.md')

    const titles = flatten(view.state.field(vixenDecorationField))

    given(() => {
      expect(titles).toHaveLength(1)
    })

    expect(view.dom.querySelector('.cm-vixen-link')?.getAttribute('title')).toBe('Ctrl/Cmd+click to open journal/b.md')
  })

  it('clears decorations when the heading is removed', () => {
    const state = stateFor('# title')
    const { state: next } = state.update({ changes: { from: 0, to: 2, insert: '' } })

    expect(flatten(next.field(vixenDecorationField))).toStrictEqual([])
  })
})

describe('a markdown link to somewhere in the store', () => {
  function linksFrom(set: DecorationSet): Array<{ destination: string; title: string }> {
    const found: Array<{ destination: string; title: string }> = []
    const cursor = set.iter()

    while (cursor.value !== null) {
      const spec: unknown = cursor.value.spec
      const attributes: unknown = isRecord(spec) ? spec.attributes : null
      if (isRecord(attributes) && typeof attributes['data-destination'] === 'string') {
        found.push({
          destination: attributes['data-destination'],
          title: typeof attributes.title === 'string' ? attributes.title : '',
        })
      }
      cursor.next()
    }

    return found
  }

  function linksIn(markdown: string): Array<{ destination: string; title: string }> {
    return linksFrom(computeDecorations(createEditorState({ doc: markdown })))
  }

  function linksHeldBy(entryPath: string, markdown: string): Array<{ destination: string; title: string }> {
    const holder = createHolderControl()
    const parent = document.createElement('div')
    document.body.append(parent)
    const view = trackView(
      new EditorView({ parent, state: createEditorState({ doc: markdown, extensions: [holder.unset] }) }),
    )
    holder.follow(view, entryPath)

    return linksFrom(computeDecorations(view.state))
  }

  it('is marked so the gesture has something to land on', () => {
    expect(linksIn('see [notes](journal/a.md) for more').map((link) => link.destination)).toStrictEqual([
      'journal/a.md',
    ])
  })

  it('names the document it would open, so the gesture is not a guess', () => {
    expect(linksIn('[a](a.md)').at(0)?.title).toBe('Ctrl/Cmd+click to open a.md')
  })

  it('names the target relative to the document holding the link', () => {
    expect(linksHeldBy('journal/2026/notes.md', '[a](./b.md)').at(0)?.title).toBe(
      'Ctrl/Cmd+click to open journal/2026/b.md',
    )
  })

  it('follows a parent step out of the holding directory', () => {
    expect(linksHeldBy('journal/2026/notes.md', '[a](../b.md)').at(0)?.title).toBe(
      'Ctrl/Cmd+click to open journal/b.md',
    )
  })

  it('keeps the destination as written, so the click resolves it the same way', () => {
    expect(linksHeldBy('journal/2026/notes.md', '[a](./b.md)').at(0)?.destination).toBe('./b.md')
  })

  it('leaves a link that climbs out of the store unmarked, since it opens nothing', () => {
    expect(linksHeldBy('notes.md', '[a](../escape.md)')).toStrictEqual([])
  })

  it('marks an image destination too, because it opens the same way', () => {
    expect(linksIn('![p](./photo.png)').map((link) => link.destination)).toStrictEqual(['./photo.png'])
  })

  it.each([
    ['an absolute url', '[a](https://example.test/a.md)'],
    ['a mailto', '[a](mailto:someone@example.test)'],
    ['a route rather than a document', '[a](/doc/a.md)'],
    ['an empty destination', '[a]()'],
  ])('leaves %s unmarked', (_case, markdown) => {
    expect(linksIn(markdown)).toStrictEqual([])
  })

  it('marks every link on a line, not just the first', () => {
    expect(linksIn('[a](a.md) and [b](b.md)').map((link) => link.destination)).toStrictEqual(['a.md', 'b.md'])
  })

  it('leaves a path inside a fenced block alone, because it is being documented', () => {
    expect(linksIn('```\n[a](a.md)\n```')).toStrictEqual([])
  })

  it('tolerates whitespace after the opening bracket', () => {
    expect(linksIn('[a]( a.md)').map((link) => link.destination)).toStrictEqual(['a.md'])
  })

  it('marks a reference definition, which the editor never used to notice', () => {
    expect(linksIn('[a][id]\n\n[id]: journal/b.md').map((link) => link.destination)).toStrictEqual(['journal/b.md'])
  })

  it('leaves a path inside inline code alone, which it used to mark by mistake', () => {
    expect(linksIn('use `[a](a.md)` here')).toStrictEqual([])
  })

  it('leaves a path inside an indented block alone', () => {
    expect(linksIn('    [a](a.md)')).toStrictEqual([])
  })

  it('reports the decoded path, so the gesture opens the name on disk', () => {
    expect(linksIn('[a](my%20file.md)').map((link) => link.destination)).toStrictEqual(['my file.md'])
  })

  it('marks the written form, brackets excluded, so the mark sits on the path', () => {
    const markdown = '[a](<my file.md>)'
    const set = computeDecorations(createEditorState({ doc: markdown }))

    expect(flatten(set).filter((d) => d.class === 'cm-vixen-link')).toStrictEqual([
      { from: 5, to: 15, class: 'cm-vixen-link' },
    ])
  })

  it('needs the markdown language, which is why createEditorState composes them', () => {
    expect(computeDecorations(EditorState.create({ doc: '[a](a.md)', extensions: [vixenDecorations] })).size).toBe(0)
  })
})
