'use sanity'

import { describe, expect, it } from 'vitest'

import { matchesAny } from '../../../src/server/routes/conditional.ts'

const ETAG = '"abc123"'

describe('matchesAny', () => {
  it('does not match when the request sent no validator at all', () => {
    expect(matchesAny(undefined, ETAG)).toBe(false)
  })

  it('matches any version when the request sent a star', () => {
    expect(matchesAny('*', ETAG)).toBe(true)
  })

  it('matches a star the sender padded with whitespace', () => {
    expect(matchesAny('  *  ', ETAG)).toBe(true)
  })

  it('matches a validator identical to the one held', () => {
    expect(matchesAny(ETAG, ETAG)).toBe(true)
  })

  it('does not match a validator for different content', () => {
    expect(matchesAny('"other"', ETAG)).toBe(false)
  })

  it('matches when the one held is somewhere in a list the sender offered', () => {
    expect(matchesAny(`"stale", ${ETAG}, "older"`, ETAG)).toBe(true)
  })

  it('does not match when no entry in the list is the one held', () => {
    expect(matchesAny('"stale", "older"', ETAG)).toBe(false)
  })

  it('matches a weak validator, since a weak comparison is what a conditional GET asks for', () => {
    expect(matchesAny(`W/${ETAG}`, ETAG)).toBe(true)
  })

  it('matches a weak validator offered inside a list', () => {
    expect(matchesAny(`"stale", W/${ETAG}`, ETAG)).toBe(true)
  })
})
