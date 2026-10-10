'use sanity'

import { describe, expect, it } from 'vitest'

import { TestOnly } from '../../../../src/server/routes/files.ts'
import { STORE_ROOT } from '../../../../src/shared/store-path.ts'

const { archiveName, contentDisposition, storedName, targetDirectory, uploadedFile } = TestOnly

function png(name: string): File {
  return new File([new Uint8Array([1])], name)
}

describe('what a downloaded archive is called', () => {
  it('is named for the subtree it holds', () => {
    expect(archiveName('journal/2026')).toBe('vixen-2026.zip')
  })

  it('is named for the store itself when the whole store was asked for', () => {
    expect(archiveName(STORE_ROOT)).toBe('vixen-documents.zip')
  })

  it('offers the name as a plain quoted filename, which every browser understands', () => {
    expect(contentDisposition('vixen-2026.zip')).toContain('filename="vixen-2026.zip"')
  })

  it('replaces a character that would break out of the quoted form', () => {
    expect(contentDisposition('a"b.zip')).toContain('filename="a_b.zip"')
  })

  it('offers the real name separately, so a reader gets it back intact', () => {
    expect(contentDisposition('journal.zip')).toContain("filename*=UTF-8''journal.zip")
  })

  it('percent-encodes a non-ascii name rather than sending the bytes raw', () => {
    expect(contentDisposition('café.zip')).toContain("filename*=UTF-8''caf%C3%A9.zip")
  })

  it('percent-encodes the characters RFC 5987 excludes but encodeURIComponent leaves alone', () => {
    expect(contentDisposition("a'(b)*.zip")).toContain("filename*=UTF-8''a%27%28b%29%2A.zip")
  })
})

describe('reading what a multipart upload carried', () => {
  it('takes the file it was given', () => {
    const sent = png('photo.png')

    expect(uploadedFile({ file: sent })).toBe(sent)
  })

  it('refuses a body whose file field is not a file at all', () => {
    expect(uploadedFile({ file: 'photo.png' })).toBeNull()
  })

  it('refuses a body carrying no file', () => {
    expect(uploadedFile({})).toBeNull()
  })

  it('stores a file under its own name when none was chosen', () => {
    expect(storedName({}, png('photo.png'))).toBe('photo.png')
  })

  it('stores it under the name that was chosen instead', () => {
    expect(storedName({ filename: 'chosen.png' }, png('photo.png'))).toBe('chosen.png')
  })

  it('refuses a chosen name that is not text', () => {
    expect(storedName({ filename: 42 }, png('photo.png'))).toBeNull()
  })

  it('lands an upload at the store root when no directory was named', () => {
    expect(targetDirectory({})).toBe(STORE_ROOT)
  })

  it('lands it in the directory that was named', () => {
    expect(targetDirectory({ path: 'journal/2026' })).toBe('journal/2026')
  })

  it('refuses a directory that is not text', () => {
    expect(targetDirectory({ path: 42 })).toBeNull()
  })
})
