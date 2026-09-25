'use sanity'

import { describe, expect, it } from 'vitest'

import { DOC_PREFIX } from '../../src/shared/doc-url.ts'

describe('DOC_PREFIX', () => {
  it('is the path a document url is addressed under', () => {
    expect(DOC_PREFIX).toBe('/doc/')
  })

  it('ends in a slash, so a folder url resolves relative links against itself', () => {
    expect(DOC_PREFIX.endsWith('/')).toBe(true)
  })
})
