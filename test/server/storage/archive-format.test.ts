'use sanity'

import { describe, expect, it } from 'vitest'

import { archiveFormatOf } from '../../../src/server/storage/archive-format.ts'

const ZIP_HEAD = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
const EMPTY_ZIP_HEAD = new Uint8Array([0x50, 0x4b, 0x05, 0x06])
const GZIP_HEAD = new Uint8Array([0x1f, 0x8b, 0x08, 0x00])
const NOT_AN_ARCHIVE = null

describe('what an archive says it is', () => {
  it('reads a zip by the signature it opens with', () => {
    expect(archiveFormatOf(ZIP_HEAD)).toBe('zip')
  })

  it('reads an empty zip, which opens with the end of its own directory', () => {
    expect(archiveFormatOf(EMPTY_ZIP_HEAD)).toBe('zip')
  })

  it('refuses plain text, because the bytes decide and these are not an archive', () => {
    expect(archiveFormatOf(new TextEncoder().encode('# not an archive'))).toBe(NOT_AN_ARCHIVE)
  })

  it('refuses a gzip, which is not a format this endpoint takes yet', () => {
    expect(archiveFormatOf(GZIP_HEAD)).toBe(NOT_AN_ARCHIVE)
  })

  it('refuses a file too short to carry a signature', () => {
    expect(archiveFormatOf(new Uint8Array([0x50]))).toBe(NOT_AN_ARCHIVE)
  })
})
