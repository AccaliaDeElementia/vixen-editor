'use sanity'

import { describe, expect, it } from 'vitest'

import { API_PREFIX, archiveUrlFor, rawUrlFor } from '../../src/shared/api.ts'
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

describe('rawUrlFor', () => {
  it('mirrors the store path, so the preview transform stays a prefix', () => {
    expect(rawUrlFor('journal/photo.png')).toBe('/api/files/raw/journal/photo.png')
  })

  it('encodes each segment without encoding the separators', () => {
    expect(rawUrlFor('my journal/a b.png')).toBe('/api/files/raw/my%20journal/a%20b.png')
  })

  it('keeps a hash out of the path, which would otherwise truncate the request', () => {
    expect(rawUrlFor('notes #1.png')).toBe('/api/files/raw/notes%20%231.png')
  })

  it('takes the same base url override the archive builder does', () => {
    expect(rawUrlFor('photo.png', '/elsewhere')).toBe('/elsewhere/files/raw/photo.png')
  })
})
