'use sanity'

import { describe, expect, it } from 'vitest'

import { TestOnly } from '../../../../src/server/routes/files.ts'
import type { ReceivedBody, ReceivedFile } from '../../../../src/server/routes/multipart.ts'
import { STORE_ROOT } from '../../../../src/shared/store-path.ts'

const { archiveName, contentDisposition, sentAFieldAsAFile, storedName, targetDirectory, uploadedFile } = TestOnly

const NO_BYTES = new Uint8Array()

function body(parts: Partial<ReceivedBody> = {}): ReceivedBody {
  return { fields: {}, files: [], ...parts }
}

function part(name: string, filename: string): ReceivedFile {
  return { name, filename, bytes: NO_BYTES }
}

describe('what a downloaded archive is called', () => {
  it('is named for the subtree it holds', () => {
    expect(archiveName('journal/2026', 'zip')).toBe('vixen-2026.zip')
  })

  it('is named for the store itself when the whole store was asked for', () => {
    expect(archiveName(STORE_ROOT, 'zip')).toBe('vixen-documents.zip')
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
    const sent = part('file', 'photo.png')

    expect(uploadedFile(body({ files: [sent] }))).toBe(sent)
  })

  it('refuses a body carrying no file', () => {
    expect(uploadedFile(body())).toBeNull()
  })

  it('ignores a file sent under another field, so only the upload itself counts', () => {
    expect(uploadedFile(body({ files: [part('filename', 'sneaky.png')] }))).toBeNull()
  })

  it('stores a file under its own name when none was chosen', () => {
    expect(storedName(body(), part('file', 'photo.png'))).toBe('photo.png')
  })

  it('stores it under the name that was chosen instead', () => {
    expect(storedName(body({ fields: { filename: 'chosen.png' } }), part('file', 'photo.png'))).toBe('chosen.png')
  })

  it('lands an upload at the store root when no directory was named', () => {
    expect(targetDirectory(body())).toBe(STORE_ROOT)
  })

  it('lands it in the directory that was named', () => {
    expect(targetDirectory(body({ fields: { path: 'journal/2026' } }))).toBe('journal/2026')
  })
})

describe('a part sent as a file where text was expected', () => {
  it('is refused, because a blob is neither a name nor a directory', () => {
    const sent = body({ files: [part('file', 'photo.png'), part('filename', 'sneaky')] })

    expect(sentAFieldAsAFile(sent)).toBe(true)
  })

  it('is not reported when the upload itself is the only file', () => {
    expect(sentAFieldAsAFile(body({ files: [part('file', 'photo.png')] }))).toBe(false)
  })
})
