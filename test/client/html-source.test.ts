'use sanity'

import { describe, expect, it } from 'vitest'

import { htmlSourceBlocks } from '../../src/client/html-source.ts'

function htmlSourceOf(markdown: string): string {
  return htmlSourceBlocks(markdown)
    .map(({ html }) => html)
    .join('\n')
}

describe('the html a document is converted into', () => {
  it('shows a heading as the tag the preview renders', () => {
    expect(htmlSourceOf('# A heading')).toBe('<h1>A heading</h1>')
  })

  it('keeps inline markup inside the line it belongs to, so a paragraph reads as one', () => {
    expect(htmlSourceOf('A **bold** word')).toBe('<p>A <strong>bold</strong> word</p>')
  })

  it('puts each block on its own line rather than running them together', () => {
    expect(htmlSourceOf('# One\n\nTwo')).toBe('<h1>One</h1>\n<p>Two</p>')
  })

  it('indents a block nested inside another, so the structure is readable', () => {
    expect(htmlSourceOf('- one')).toBe('<ul>\n  <li>\n    <p>one</p>\n  </li>\n</ul>')
  })

  it('leaves out the positions the preview records for its own use', () => {
    expect(htmlSourceOf('# A heading')).not.toContain('data-from')
  })

  it('shows the text of a code block, not the colouring the preview gives it', () => {
    expect(htmlSourceOf('```js\nconst x = 1\n```')).toBe('<pre><code>const x = 1</code></pre>')
  })

  it('escapes a character that would otherwise read as markup', () => {
    expect(htmlSourceOf('a < b')).toBe('<p>a &lt; b</p>')
  })

  it('shows an empty document as nothing at all', () => {
    expect(htmlSourceOf('')).toBe('')
  })
})

describe('where each block came from', () => {
  function offsets(markdown: string): number[] {
    return htmlSourceBlocks(markdown).map(({ from }) => from)
  }

  it('records the offset each block was written at, so the caret can be followed into it', () => {
    expect(offsets('# one\n\n# two\n\n# three')).toStrictEqual([0, 7, 14])
  })

  it('records nothing for a document with no blocks in it', () => {
    expect(offsets('')).toStrictEqual([])
  })
})
