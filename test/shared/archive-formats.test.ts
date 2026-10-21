'use sanity'

import { describe, expect, it } from 'vitest'

import { archiveFormatNamed } from '../../src/shared/archive-formats.ts'

describe('archiveFormatNamed', () => {
  it.each(['zip', 'tar.gz'])('answers %s, which is the word the API and the dialog both use', (asked) => {
    expect(archiveFormatNamed(asked)).toBe(asked)
  })

  it('answers nothing for a format neither side can write', () => {
    expect(archiveFormatNamed('tar.bz2')).toBeNull()
  })
})
