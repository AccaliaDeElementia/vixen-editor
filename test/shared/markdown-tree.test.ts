'use sanity'

import { describe, expect, it } from 'vitest'

import { parser } from '@lezer/markdown'

import { destinationsIn, VIXEN_MARKDOWN_EXTENSIONS } from '../../src/shared/markdown-tree.ts'

const markdownParser = parser.configure(VIXEN_MARKDOWN_EXTENSIONS)

function found(markdown: string): ReturnType<typeof destinationsIn> {
  return destinationsIn(markdownParser.parse(markdown), markdown)
}

function valuesIn(markdown: string): string[] {
  return found(markdown).map((destination) => destination.value)
}

describe('destinationsIn', () => {
  it('finds an inline link', () => {
    expect(valuesIn('see [the journal](journal/a.md) today')).toStrictEqual(['journal/a.md'])
  })

  it('finds an image', () => {
    expect(valuesIn('![alt](img/p.png "a title")')).toStrictEqual(['img/p.png'])
  })

  it('finds a reference definition', () => {
    expect(valuesIn('[a][id]\n\n[id]: journal/b.md')).toStrictEqual(['journal/b.md'])
  })

  it('finds a definition whose title sits on the next line', () => {
    expect(valuesIn('[id]: next.md\n  "the title"')).toStrictEqual(['next.md'])
  })

  it('reports them in document order', () => {
    expect(valuesIn('[a](one.md) and [b](two.md)')).toStrictEqual(['one.md', 'two.md'])
  })

  it('finds both halves of an image inside a link', () => {
    expect(valuesIn('[![alt](inner.png)](outer.md)')).toStrictEqual(['inner.png', 'outer.md'])
  })

  it('excludes the delimiters of an angle-bracketed destination', () => {
    expect(valuesIn('[a](<my file.md>)')).toStrictEqual(['my file.md'])
  })

  it('reports whether the destination was angle-bracketed', () => {
    expect(found('[a](<x.md>) [b](y.md)').map((d) => d.bracketed)).toStrictEqual([true, false])
  })

  it('reports offsets that slice the written form back out, brackets excluded', () => {
    const markdown = '[a](<my file.md>) then [b](plain.md)'

    const sliced = found(markdown).map((d) => markdown.slice(d.from, d.to))

    expect(sliced).toStrictEqual(['my file.md', 'plain.md'])
  })

  it('reports the whole written form, so a renderer can replace it', () => {
    const markdown = 'before ![alt](pic.png) after'

    const [image] = found(markdown)

    expect(markdown.slice(image?.markupFrom ?? 0, image?.markupTo ?? 0)).toBe('![alt](pic.png)')
  })

  it('reports the written form of a link, not only of an image', () => {
    const markdown = 'see [text](a.md) here'

    const [link] = found(markdown)

    expect(markdown.slice(link?.markupFrom ?? 0, link?.markupTo ?? 0)).toBe('[text](a.md)')
  })

  it('says which destinations are images, so a renderer can tell them apart', () => {
    expect(found('[a](doc.md) and ![b](pic.png)').map((d) => d.isImage)).toStrictEqual([false, true])
  })

  it('finds a link inside a list item and a blockquote', () => {
    expect(valuesIn('- [a](list.md)\n\n> [b](quote.md)')).toStrictEqual(['list.md', 'quote.md'])
  })

  it('finds a link inside a table cell', () => {
    expect(valuesIn('| a | [x](t.md) |\n|---|---|\n')).toStrictEqual(['t.md'])
  })

  it('finds a link inside a task list item', () => {
    expect(valuesIn('- [ ] [x](task.md)\n')).toStrictEqual(['task.md'])
  })

  it('finds nothing in a document with no links', () => {
    expect(valuesIn('# Heading\n\nJust prose.')).toStrictEqual([])
  })
})

describe('destinationsIn leaves code alone', () => {
  it('ignores a fenced block', () => {
    expect(valuesIn('```\n[a](fence.md)\n```')).toStrictEqual([])
  })

  it('ignores an indented block', () => {
    expect(valuesIn('    [a](indent.md)')).toStrictEqual([])
  })

  it('ignores inline code', () => {
    expect(valuesIn('use `[a](code.md)` here')).toStrictEqual([])
  })

  it('ignores a fenced block while still finding the prose around it', () => {
    expect(valuesIn('[a](before.md)\n\n```\n[b](fence.md)\n```\n\n[c](after.md)')).toStrictEqual([
      'before.md',
      'after.md',
    ])
  })
})

describe('destinationsIn ignores what is not markdown link syntax', () => {
  it('ignores an HTML anchor', () => {
    expect(valuesIn('<a href="html.md">x</a>')).toStrictEqual([])
  })

  it('ignores an HTML image', () => {
    expect(valuesIn('<img src="html.png">')).toStrictEqual([])
  })

  it('ignores an autolink', () => {
    expect(valuesIn('see <https://example.com/a.md> ok')).toStrictEqual([])
  })

  it('finds the same target written as a link, which is what makes the autolink case a choice', () => {
    expect(valuesIn('see [x](https://example.com/a.md) ok')).toStrictEqual(['https://example.com/a.md'])
  })

  it('ignores a bracket that was escaped out of being a link', () => {
    expect(valuesIn('\\[a](escaped.md)')).toStrictEqual([])
  })

  it('ignores a link with an empty destination', () => {
    expect(valuesIn('[a]()')).toStrictEqual([])
  })

  it('ignores a link whose angle brackets are empty', () => {
    expect(valuesIn('[a](<>)')).toStrictEqual([])
  })
})

describe('a definition that is only paragraph text', () => {
  it('is not a destination, because an inline tag cannot interrupt a paragraph', () => {
    expect(valuesIn('- item\n<img src="./r.png">\n[c]: ./ref.md')).toStrictEqual([])
  })

  it('is still a destination when a blank line lets the definition start a block', () => {
    expect(valuesIn('- item\n\n[c]: ./ref.md')).toStrictEqual(['./ref.md'])
  })

  it('is not a destination after ordinary paragraph text either', () => {
    expect(valuesIn('item\n[c]: ./ref.md')).toStrictEqual([])
  })
})
