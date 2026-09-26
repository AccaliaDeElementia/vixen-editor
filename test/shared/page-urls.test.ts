'use sanity'

import { describe, expect, it } from 'vitest'

import { DOC_PREFIX, TRASH_PREFIX, trashEntryIdFromPath } from '../../src/shared/page-urls.ts'

describe('DOC_PREFIX', () => {
  it('is the path a document url is addressed under', () => {
    expect(DOC_PREFIX).toBe('/doc/')
  })

  it('ends in a slash, so a folder url resolves relative links against itself', () => {
    expect(DOC_PREFIX.endsWith('/')).toBe(true)
  })
})

describe('a trash entry url', () => {
  it('is addressed outside the document prefix, so no document name can shadow it', () => {
    expect({ trash: TRASH_PREFIX, overlaps: TRASH_PREFIX.startsWith(DOC_PREFIX) }).toStrictEqual({
      trash: '/trash/',
      overlaps: false,
    })
  })

  it('decodes an id that was percent-encoded into the path', () => {
    expect(trashEntryIdFromPath(`${TRASH_PREFIX}${encodeURIComponent('an id/with a slash')}`)).toBe(
      'an id/with a slash',
    )
  })

  it.each([
    ['/doc/notes.md', null],
    ['/trash/', null],
    ['/', null],
    ['/trash/abc', 'abc'],
  ])('reads %s as %j', (pathname, expected) => {
    expect(trashEntryIdFromPath(pathname)).toBe(expected)
  })
})
