'use sanity'

import { describe, expect, it } from 'vitest'

import { headingsOf } from '../../../src/shared/markdown-tree.ts'

function found(markdown: string): ReturnType<typeof headingsOf> {
  return headingsOf(markdown)
}

function textIn(markdown: string): string[] {
  return found(markdown).map((heading) => heading.text)
}

function levelsIn(markdown: string): number[] {
  return found(markdown).map((heading) => heading.level)
}

function quotedIn(markdown: string): boolean[] {
  return found(markdown).map((heading) => heading.quoted)
}

describe('the level a heading is written at', () => {
  it('counts the hashes an ATX heading opens with', () => {
    expect(levelsIn('# a\n\n### c\n')).toStrictEqual([1, 3])
  })

  it('reads a setext underline as the level it stands for', () => {
    expect(levelsIn('a\n=\n\nb\n-\n')).toStrictEqual([1, 2])
  })
})

describe('the text a heading carries', () => {
  it('is what an ATX heading says', () => {
    expect(textIn('# plain')).toStrictEqual(['plain'])
  })

  it('drops the hashes an ATX heading closes with', () => {
    expect(textIn('# closed ##')).toStrictEqual(['closed'])
  })

  it('is the line a setext heading underlines, not the underline', () => {
    expect(textIn('Title\n=====')).toStrictEqual(['Title'])
  })

  it('drops the marks around emphasis, leaving the words emphasised', () => {
    expect(textIn('# with **bold** and _soft_')).toStrictEqual(['with bold and soft'])
  })

  it('drops the backticks around code', () => {
    expect(textIn('# a `b` c')).toStrictEqual(['a b c'])
  })

  it('drops the tildes around a strikethrough', () => {
    expect(textIn('# a ~~b~~ c')).toStrictEqual(['a b c'])
  })

  it('drops the destination of a link, keeping the words that were linked', () => {
    expect(textIn('# see [the doc](/x) here')).toStrictEqual(['see the doc here'])
  })

  it('drops the destination of an image, keeping its alt text', () => {
    expect(textIn('# an ![picture](/p.png) inline')).toStrictEqual(['an picture inline'])
  })

  it('drops the label a reference link points through', () => {
    expect(textIn('# a [ref][r]\n\n[r]: /x')).toStrictEqual(['a ref'])
  })

  it('keeps the address of an autolink, which is the text as well as the destination', () => {
    expect(textIn('# see https://example.com now')).toStrictEqual(['see https://example.com now'])
  })

  it('keeps the character a backslash escaped, and drops the backslash', () => {
    expect(textIn('# C\\# notes')).toStrictEqual(['C# notes'])
  })

  it('leaves a character entity as the author wrote it, there being no renderer here to resolve it', () => {
    expect(textIn('# a &amp; b')).toStrictEqual(['a &amp; b'])
  })

  it('collapses the padding an ATX heading is written with', () => {
    expect(textIn('#   spaced   ')).toStrictEqual(['spaced'])
  })

  it('leaves a heading with nothing after its mark holding nothing', () => {
    expect(textIn('#')).toStrictEqual([''])
  })
})

describe('where a heading sits', () => {
  it('reports an offset that slices the heading back out of the source', () => {
    const markdown = 'intro\n\n## second\n\nmore\n'
    const written = '## second'

    const sliced = found(markdown).map((heading) => markdown.slice(heading.from, heading.from + written.length))

    expect(sliced).toStrictEqual([written])
  })

  it('reports them in document order', () => {
    expect(textIn('# a\n\n## b\n\n# c')).toStrictEqual(['a', 'b', 'c'])
  })
})

describe('what counts as a heading', () => {
  it('finds one inside a blockquote', () => {
    expect(textIn('> # quoted')).toStrictEqual(['quoted'])
  })

  it('finds one inside a list item', () => {
    expect(textIn('- # listed')).toStrictEqual(['listed'])
  })

  it('finds none in a fenced code block, however the line is written', () => {
    expect(textIn('```\n# not a heading\n```')).toStrictEqual([])
  })

  it('finds none in an indented code block', () => {
    expect(textIn('    # not a heading')).toStrictEqual([])
  })

  it('finds none in a document that has none', () => {
    expect(textIn('just prose\n')).toStrictEqual([])
  })
})

describe('whether a heading belongs to the document or to something it quotes', () => {
  it('marks a heading written inside a quote', () => {
    expect(quotedIn('> # theirs\n')).toStrictEqual([true])
  })

  it('leaves a heading of the document itself unmarked', () => {
    expect(quotedIn('# mine\n')).toStrictEqual([false])
  })

  it('marks one the quote holds at a remove, because the quote is still what holds it', () => {
    expect(quotedIn('> - # in a list in a quote\n')).toStrictEqual([true])
  })

  it('marks a setext heading in a quote, which carries its level on the next line', () => {
    expect(quotedIn('> Title\n> =====\n')).toStrictEqual([true])
  })

  it('answers for each heading separately, so a document that quotes one keeps its own', () => {
    expect(quotedIn('# mine\n\n> # theirs\n')).toStrictEqual([false, true])
  })
})
