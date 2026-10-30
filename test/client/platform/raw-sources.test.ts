'use sanity'

import { describe, expect, it } from 'vitest'

import { rawSourceFor } from '../../../src/client/platform/raw-sources.ts'

const HOLDER = 'Two Folder/Day 1.md'

describe('the url a document source points at', () => {
  it('reads a sibling file as the raw file beside the document', () => {
    expect(rawSourceFor(HOLDER, 'picture.png')).toBe('/api/files/raw/Two%20Folder/picture.png')
  })

  it('climbs out of the folder where the document says to', () => {
    expect(rawSourceFor(HOLDER, '../image.png')).toBe('/api/files/raw/image.png')
  })

  it.each([
    'https://example.test/moon.png',
    'data:image/png;base64,AAAA',
    'mailto:someone@example.test',
    '/pictures/moon.png',
    '',
  ])('leaves %s alone, because it names something the store does not hold', (destination) => {
    expect(rawSourceFor(HOLDER, destination)).toBeNull()
  })

  it('leaves a path that climbs past the store root alone, rather than reaching outside it', () => {
    expect(rawSourceFor(HOLDER, '../../../etc/passwd')).toBeNull()
  })
})
