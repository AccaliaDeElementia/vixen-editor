'use sanity'

import { describe, expect, it } from 'vitest'

import { rewriteLinkDestinations } from '../../../src/server/markdown/links.ts'
import { isAllowedName } from '../../../src/server/storage/safe-path.ts'
import { encodeDestination } from '../../../src/shared/link-syntax.ts'

function valuesIn(markdown: string): string[] {
  const seen: string[] = []

  rewriteLinkDestinations(markdown, (destination) => {
    seen.push(destination)

    return destination
  })

  return seen
}

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
  definitionThatIsOnlyText: '- item\n<img src="./r.png">\n[c]: ./ref.md',

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

  it('leaves a path alone that only looks like a definition, mid-paragraph', () => {
    const markdown = '- item\n<img src="./r.png">\n[c]: ./ref.md'

    expect(rewriteLinkDestinations(markdown, () => 'moved.md')).toBe(markdown)
  })

  it('rewrites the same path when a blank line makes it a real definition', () => {
    const markdown = '- item\n\n[c]: ./ref.md'

    expect(rewriteLinkDestinations(markdown, () => 'moved.md')).toBe('- item\n\n[c]: moved.md')
  })

  it('rewrites an image', () => {
    expect(rewriteLinkDestinations('![alt](img/p.png "t")', () => 'pics/p.png')).toBe('![alt](pics/p.png "t")')
  })
})

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
