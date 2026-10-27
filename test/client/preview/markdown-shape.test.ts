'use sanity'

import { parser } from '@lezer/markdown'
import type { SyntaxNode } from '@lezer/common'
import { describe, expect, it } from 'vitest'

import { VIXEN_MARKDOWN_EXTENSIONS } from '../../../src/shared/markdown-tree.ts'
import {
  alignmentsOf,
  cellsOf,
  childNamed,
  childrenOf,
  FIRST_NUMBER,
  isLoose,
  startOf,
} from '../../../src/client/preview/markdown-shape.ts'

const shaped = parser.configure(VIXEN_MARKDOWN_EXTENSIONS)

function nodeAt(source: string, ...names: readonly string[]): SyntaxNode {
  return names.reduce<SyntaxNode>((node, name) => {
    const found = node.getChild(name)
    if (found === null) throw new Error(`no ${name} in ${JSON.stringify(source)}`)

    return found
  }, shaped.parse(source).topNode)
}

describe('reading a list out of the tree', () => {
  it.each([
    ['items run together', '- a\n- b\n', false],
    ['a blank line separates two items', '- a\n\n- b\n', true],
    ['one item holds two paragraphs', '- a\n\n  more\n', true],
    ['a nested list runs together', '- a\n  - b\n', false],
    ['the blank line belongs to a nested list', '- a\n  - b\n\n  - c\n', false],
  ])('calls a list loose or not when %s', (_case, source, loose) => {
    expect(isLoose(nodeAt(source, 'BulletList'), source)).toBe(loose)
  })

  it('reads the number an ordered list starts at', () => {
    const source = '3. three\n4. four\n'

    expect(startOf(nodeAt(source, 'OrderedList'), source)).toBe(3)
  })

  it('reads the usual start as the first number, so no attribute is needed for it', () => {
    const source = '1. one\n'

    expect(startOf(nodeAt(source, 'OrderedList'), source)).toBe(FIRST_NUMBER)
  })
})

describe('reading a table out of the tree', () => {
  it.each([
    ['colons on both sides centre a column', '| a |\n| :-: |\n', ['center']],
    ['a trailing colon aligns right', '| a |\n| --: |\n', ['right']],
    ['a leading colon aligns left', '| a |\n| :-- |\n', ['left']],
    ['no colon leaves a column unaligned', '| a |\n| --- |\n', [null]],
    ['each column is read in turn', '| a | b | c |\n| :- | :-: | -: |\n', ['left', 'center', 'right']],
    ['outer pipes are optional', 'a | b\n:-: | --:\n', ['center', 'right']],
  ])('reads alignments when %s', (_case, source, alignments) => {
    expect(alignmentsOf(nodeAt(source, 'Table'), source)).toStrictEqual(alignments)
  })

  it('counts only the cells of a row, not the pipes between them', () => {
    const source = '| a | b |\n| - | - |\n'

    expect(cellsOf(nodeAt(source, 'Table', 'TableHeader'))).toHaveLength(2)
  })
})

describe('reading a node out of the tree', () => {
  it('lists the children of a node in the order they appear', () => {
    const source = '# a\n\n> b\n'

    expect(childrenOf(shaped.parse(source).topNode).map((child) => child.name)).toStrictEqual([
      'ATXHeading1',
      'Blockquote',
    ])
  })

  it('finds a child by name', () => {
    const source = '[a](/x)\n'

    expect(childNamed(nodeAt(source, 'Paragraph'), 'Link')?.name).toBe('Link')
  })

  it('reports no child when nothing carries that name', () => {
    const source = 'plain\n'

    expect(childNamed(nodeAt(source, 'Paragraph'), 'Link')).toBeNull()
  })
})
