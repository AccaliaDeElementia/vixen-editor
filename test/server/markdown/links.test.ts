'use sanity'

import { describe, expect, it } from 'vitest'

import { rewriteLinkDestinations, TestOnly } from '../../../src/server/markdown/links.ts'
import { isAllowedName } from '../../../src/server/storage/safe-path.ts'

const { decodeDestination, encodeDestination, findLinkDestinations } = TestOnly

function valuesIn(markdown: string): string[] {
  return findLinkDestinations(markdown).map((destination) => destination.value)
}

describe('findLinkDestinations', () => {
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
    expect(findLinkDestinations('[a](<x.md>) [b](y.md)').map((d) => d.bracketed)).toStrictEqual([true, false])
  })

  it('reports offsets that slice the written form back out', () => {
    const markdown = '[a](<my file.md>) then [b](plain.md)'

    const sliced = findLinkDestinations(markdown).map((d) => markdown.slice(d.start, d.end))

    expect(sliced).toStrictEqual(['my file.md', 'plain.md'])
  })

  it('finds a link inside a list item and a blockquote', () => {
    expect(valuesIn('- [a](list.md)\n\n> [b](quote.md)')).toStrictEqual(['list.md', 'quote.md'])
  })

  it('finds nothing in a document with no links', () => {
    expect(valuesIn('# Heading\n\nJust prose.')).toStrictEqual([])
  })
})

// A path inside a code block is being documented, not linked. This is the
// reason the feature uses a parser rather than a regex.
describe('findLinkDestinations leaves code alone', () => {
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

// Links inside embedded HTML are out of scope by decision: chasing them means
// parsing HTML inside markdown. They break on a move, like they do today.
describe('findLinkDestinations ignores what is not markdown link syntax', () => {
  it('ignores an HTML anchor', () => {
    expect(valuesIn('<a href="html.md">x</a>')).toStrictEqual([])
  })

  it('ignores an HTML image', () => {
    expect(valuesIn('<img src="html.png">')).toStrictEqual([])
  })

  it('ignores an autolink', () => {
    expect(valuesIn('see <https://example.com> ok')).toStrictEqual([])
  })

  it('ignores a bracket that was escaped out of being a link', () => {
    expect(valuesIn('\\[a](escaped.md)')).toStrictEqual([])
  })

  it('ignores a link with an empty destination', () => {
    expect(valuesIn('[a]()')).toStrictEqual([])
  })
})

describe('decodeDestination', () => {
  it('leaves a plain path alone', () => {
    expect(decodeDestination('journal/a.md')).toBe('journal/a.md')
  })

  it('decodes a percent-encoded space', () => {
    expect(decodeDestination('my%20file.md')).toBe('my file.md')
  })

  it('decodes a multi-byte sequence', () => {
    expect(decodeDestination('caf%C3%A9.md')).toBe('café.md')
  })

  it('resolves a backslash escape', () => {
    expect(decodeDestination('a\\(b.md')).toBe('a(b.md')
  })

  it('leaves a lone percent alone', () => {
    expect(decodeDestination('100% done.md')).toBe('100% done.md')
  })

  it('leaves a malformed percent sequence alone', () => {
    expect(decodeDestination('a%zzb.md')).toBe('a%zzb.md')
  })

  it('decodes a valid sequence that sits beside a malformed one', () => {
    expect(decodeDestination('a%20b%zz.md')).toBe('a b%zz.md')
  })

  it('leaves a percent pair that is not valid UTF-8 alone', () => {
    expect(decodeDestination('a%FFb.md')).toBe('a%FFb.md')
  })
})

describe('encodeDestination', () => {
  it('leaves a plain path alone in either form', () => {
    expect(encodeDestination('journal/a.md', false)).toBe('journal/a.md')
    expect(encodeDestination('journal/a.md', true)).toBe('journal/a.md')
  })

  it('encodes a space outside angle brackets and keeps it inside them', () => {
    expect(encodeDestination('my file.md', false)).toBe('my%20file.md')
    expect(encodeDestination('my file.md', true)).toBe('my file.md')
  })

  it('encodes parentheses outside angle brackets and keeps them inside', () => {
    expect(encodeDestination('a(b).md', false)).toBe('a%28b%29.md')
    expect(encodeDestination('a(b).md', true)).toBe('a(b).md')
  })

  it('encodes angle brackets inside angle brackets', () => {
    expect(encodeDestination('a<b>.md', true)).toBe('a%3Cb%3E.md')
  })

  it('encodes a literal percent, so the path survives decoding', () => {
    expect(encodeDestination('100%.md', false)).toBe('100%25.md')
    expect(decodeDestination(encodeDestination('100%.md', false))).toBe('100%.md')
  })

  it('encodes an ampersand only when it would read as a character reference', () => {
    expect(encodeDestination('rock & roll.md', true)).toBe('rock & roll.md')
    expect(encodeDestination('a&amp;b.md', true)).toBe('a%26amp;b.md')
  })

  it('leaves non-ASCII alone, which is legal and more readable than encoding it', () => {
    expect(encodeDestination('café/🎉.md', false)).toBe('café/🎉.md')
  })
})

// The parser is the judge. Anything the store can hold must survive being
// written into a document and read back out of it.
describe('a name the store allows survives a round trip through a document', () => {
  const NAMES = [
    'plain.md',
    'my file.md',
    'a  two spaces.md',
    'a(b).md',
    'a(b.md',
    'a)b.md',
    '100%.md',
    'say "hi".md',
    "it's.md",
    'a&b.md',
    'a&amp;b.md',
    '[x].md',
    'a<b.md',
    'a>b.md',
    'a#b.md',
    'a?b.md',
    'café.md',
    '🎉.md',
    'Rock & Roll (live).md',
  ]

  it('covers only names the store would actually accept', () => {
    expect(NAMES.filter((name) => !isAllowedName(name))).toStrictEqual([])
  })

  it.each(NAMES)('round trips %j written as an inline link', (name) => {
    const markdown = `[a](${encodeDestination(name, false)})`

    expect(valuesIn(markdown)).toStrictEqual([name])
  })

  it.each(NAMES)('round trips %j written inside angle brackets', (name) => {
    const markdown = `[a](<${encodeDestination(name, true)}>)`

    expect(valuesIn(markdown)).toStrictEqual([name])
  })

  it.each(NAMES)('round trips %j written as a reference definition', (name) => {
    const markdown = `[x][id]\n\n[id]: ${encodeDestination(name, false)}`

    expect(valuesIn(markdown)).toStrictEqual([name])
  })
})

const CORPUS: Readonly<Record<string, string>> = {
  empty: '',
  prose: '# Heading\n\nJust prose, no links at all.\n',
  inline: 'see [the journal](journal/a.md) today\n',
  image: '![alt](img/p.png "a title")\n',
  bracketed: '[a](<my file.md>)\n',
  encoded: '[a](my%20file.md)\n',
  definition: '[a][id]\n\n[id]: journal/b.md "t"\n',
  nested: '[![alt](inner.png)](outer.md)\n',
  fenced: '```js\nconst a = [1](2)\n```\n\n[a](after.md)\n',
  indented: '    [a](indent.md)\n\n[b](after.md)\n',
  inlineCode: 'use `[a](code.md)` and [b](real.md)\n',
  html: '<a href="html.md">x</a>\n\n[b](real.md)\n',
  autolink: 'see <https://example.com> and [b](real.md)\n',
  crlf: '[a](crlf.md)\r\n\r\n[id]: crlf2.md\r\n',
  trailingNoNewline: '[a](no-newline.md)',
  manyLinks: '[a](1.md) [b](2.md) [c](3.md)\n\n[id]: 4.md\n',
  selfReferential: '[journal/a.md](journal/a.md)\n',

  // Written forms that do not survive a decode-then-encode round trip: the
  // author encoded something this module would have left plain, or left plain
  // something it would have encoded. Re-writing these unasked is precisely the
  // drift the invariant forbids, so a corpus without them proves nothing.
  encodedUnnecessarily: '[a](my%2Dfile.md)\n',
  encodedNonAscii: '[a](caf%C3%A9.md)\n',
  encodedLowerCaseHex: '[a](caf%c3%a9.md)\n',
  encodedTilde: '[id]: %7Ehome.md\n',
  backslashEscaped: '[a](a\\(b.md)\n',
  bracketedWithParens: '[a](<a(b).md>)\n',
}

// The whole feature rests on this: a rewrite that changes no destination must
// give the document back unchanged, byte for byte.
describe('rewriteLinkDestinations is byte-identical under an identity rewrite', () => {
  it.each(Object.entries(CORPUS))('leaves the %s document untouched', (_name, markdown) => {
    expect(rewriteLinkDestinations(markdown, (destination) => destination)).toBe(markdown)
  })
})

describe('rewriteLinkDestinations', () => {
  it('replaces the destination it is asked to', () => {
    const markdown = 'see [the journal](journal/a.md) today'

    expect(rewriteLinkDestinations(markdown, () => 'archive/a.md')).toBe('see [the journal](archive/a.md) today')
  })

  it('replaces several, so an earlier edit does not disturb a later offset', () => {
    const markdown = '[a](1.md) [b](2.md) [c](3.md)'

    const rewritten = rewriteLinkDestinations(markdown, (destination) => `sub/${destination}`)

    expect(rewritten).toBe('[a](sub/1.md) [b](sub/2.md) [c](sub/3.md)')
  })

  it('replaces only what the rewrite changes', () => {
    const markdown = '[a](1.md) [b](2.md)'

    const rewritten = rewriteLinkDestinations(markdown, (d) => (d === '2.md' ? 'moved.md' : d))

    expect(rewritten).toBe('[a](1.md) [b](moved.md)')
  })

  it('leaves code untouched while replacing the prose around it', () => {
    const markdown = '[a](old.md)\n\n```\n[b](old.md)\n```\n\n`[c](old.md)`\n'

    const rewritten = rewriteLinkDestinations(markdown, () => 'new.md')

    expect(rewritten).toBe('[a](new.md)\n\n```\n[b](old.md)\n```\n\n`[c](old.md)`\n')
  })

  it('keeps the angle brackets the author used', () => {
    expect(rewriteLinkDestinations('[a](<old file.md>)', () => 'new file.md')).toBe('[a](<new file.md>)')
  })

  it('encodes a space when the author used no angle brackets', () => {
    expect(rewriteLinkDestinations('[a](old.md)', () => 'new file.md')).toBe('[a](new%20file.md)')
  })

  it('rewrites a reference definition', () => {
    expect(rewriteLinkDestinations('[a][id]\n\n[id]: old.md "t"', () => 'new.md')).toBe('[a][id]\n\n[id]: new.md "t"')
  })

  it('sees the decoded path, not the written form', () => {
    const seen: string[] = []

    rewriteLinkDestinations('[a](my%20file.md)', (destination) => {
      seen.push(destination)
      return destination
    })

    expect(seen).toStrictEqual(['my file.md'])
  })

  it('rewrites an image', () => {
    expect(rewriteLinkDestinations('![alt](img/p.png "t")', () => 'pics/p.png')).toBe('![alt](pics/p.png "t")')
  })
})
