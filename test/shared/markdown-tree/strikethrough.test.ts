'use sanity'

import { parser } from '@lezer/markdown'
import { describe, expect, it } from 'vitest'

import { VIXEN_MARKDOWN_EXTENSIONS } from '../../../src/shared/markdown-tree.ts'

const struck = parser.configure(VIXEN_MARKDOWN_EXTENSIONS)

function strokesIn(source: string): string[] {
  const found: string[] = []

  struck.parse(source).iterate({
    enter: (node) => {
      if (node.name === 'Strikethrough') found.push(source.slice(node.from, node.to))
    },
  })

  return found
}

describe('how many tildes strike text out', () => {
  it.each([
    ['two tildes, as every renderer has always taken them', '~~x~~', ['~~x~~']],
    ['one tilde, which the spec allows just as much', '~x~', ['~x~']],
    ['both forms on the line the spec writes them on', '~~Hi~~ Hello, ~there~ world!', ['~~Hi~~', '~there~']],
    ['one tilde opening and two closing, which do not pair', '~a~~', []],
    ['two tildes opening and one closing, which do not pair', '~~a~', []],
    ['tildes held apart by spaces, which can neither open nor close', 'a ~ b ~ c', []],
    ['tildes inside a word, which still strike', 'a~~b~~c', ['~~b~~']],
    ['a space just inside the opening tildes, which cannot open', '~~ x~~', []],
    ['a space just inside the closing tildes, which cannot close', '~~x ~~', []],
    ['punctuation just inside the tildes, which still strikes', '~~(x)~~', ['~~(x)~~']],
    ['punctuation on both sides of the tildes, which still strikes', '(~~(x)~~)', ['~~(x)~~']],
    ['a run of more than two tildes, which is no delimiter of its own', 'a ~~~x~~~ b', ['~~x~~~']],
  ])('strikes %s', (_case, source, expected) => {
    expect(strokesIn(source)).toStrictEqual(expected)
  })

  it('strikes a single-tilde run inside a double-tilde one, rather than reading it as text', () => {
    expect(strokesIn('~~a ~b~ c~~')).toStrictEqual(['~~a ~b~ c~~', '~b~'])
  })

  it('names the mark so an editor can style the tildes apart from what they strike', () => {
    const marks: string[] = []

    struck.parse('~~x~~').iterate({
      enter: (node) => {
        if (node.name === 'StrikethroughMark') marks.push('~~')
      },
    })

    expect(marks).toStrictEqual(['~~', '~~'])
  })
})
