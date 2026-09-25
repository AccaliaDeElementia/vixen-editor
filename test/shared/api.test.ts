'use sanity'

import { describe, expect, it } from 'vitest'

import { API_PREFIX, archiveUrlFor } from '../../src/shared/api.ts'
import { STORE_ROOT } from '../../src/shared/store-path.ts'

describe('API_PREFIX', () => {
  it('is the path every api route is mounted under', () => {
    expect(API_PREFIX).toBe('/api')
  })

  it('carries no trailing slash, so a route appends its own', () => {
    expect(API_PREFIX.endsWith('/')).toBe(false)
  })
})

describe('archiveUrlFor', () => {
  it('addresses the whole store with no query', () => {
    expect(archiveUrlFor(STORE_ROOT)).toBe('/api/files/archive')
  })

  it('addresses a subtree by query, encoding it', () => {
    expect(archiveUrlFor('my folder/2026')).toBe('/api/files/archive?path=my%20folder%2F2026')
  })

  it('builds under whatever prefix it is given, which is what makes the default a default', () => {
    expect(archiveUrlFor(STORE_ROOT, '/elsewhere')).toBe('/elsewhere/files/archive')
  })
})
