'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { Buffer } from 'node:buffer'
import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../../src/server/app.ts'
import { DEFAULT_LIMITS } from '../../../src/server/config.ts'
import { createFsDocumentStore, type DocumentStore } from '../../../src/server/storage/fs-store.ts'

let root: string
let store: DocumentStore
let app: Hono

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-archive-routes-'))
  store = createFsDocumentStore(root)
  app = buildApp({ store })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function codeOf(res: Response): Promise<unknown> {
  const body: unknown = await res.json()

  return typeof body === 'object' && body !== null && 'code' in body ? body.code : undefined
}

describe('GET /api/files/archive', () => {
  async function entriesIn(res: Response): Promise<string[]> {
    const bytes = Buffer.from(await res.arrayBuffer())
    const names: string[] = []
    // Local file headers start with PK\x03\x04; the name length sits at
    // offset 26 and the name itself begins at offset 30.
    for (let at = 0; at < bytes.length - 4; at += 1) {
      if (bytes.readUInt32LE(at) !== 0x04034b50) continue
      const nameLength = bytes.readUInt16LE(at + 26)
      names.push(bytes.subarray(at + 30, at + 30 + nameLength).toString('utf8'))
    }

    return names.sort((a, b) => a.localeCompare(b))
  }

  it('serves a zip of the whole store', async () => {
    await store.createDocument('notes.md', '# hello')
    await store.createDocument('journal/entry.md', '# entry')

    const res = await app.request('/api/files/archive')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    await expect(entriesIn(res)).resolves.toStrictEqual(['journal/entry.md', 'notes.md'])
  })

  it('names the download after the subtree', async () => {
    await store.createDocument('journal/entry.md', '# entry')

    const res = await app.request('/api/files/archive?path=journal')

    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="vixen-journal.zip"; filename*=UTF-8\'\'vixen-journal.zip',
    )
  })

  it('names a whole-store download after the store', async () => {
    const res = await app.request('/api/files/archive')

    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="vixen-documents.zip"; filename*=UTF-8\'\'vixen-documents.zip',
    )
  })

  // A quote inside a quoted filename closes it early, so the real name travels
  // in `filename*` and the quoted one is a plain-ASCII fallback.
  it('does not let a quote in the name break the quoted filename', async () => {
    await store.createDocument('say "hi"/entry.md', '# entry')

    const res = await app.request(`/api/files/archive?path=${encodeURIComponent('say "hi"')}`)
    const disposition = res.headers.get('content-disposition') ?? ''

    expect(disposition).toBe('attachment; filename="vixen-say_hi_.zip"; filename*=UTF-8\'\'vixen-say%20%22hi%22.zip')
  })

  it('carries a non-ASCII name through the encoded parameter', async () => {
    await store.createDocument('café/entry.md', '# entry')

    const res = await app.request(`/api/files/archive?path=${encodeURIComponent('café')}`)

    expect(res.headers.get('content-disposition')).toContain("filename*=UTF-8''vixen-caf%C3%A9.zip")
  })

  it.each([
    ['a space', 'my folder', 'vixen-my_folder.zip'],
    ['an apostrophe', "it's", 'vixen-it_s.zip'],
    ['an emoji', '🎉', 'vixen-_.zip'],
  ])('reduces %s to plain ASCII in the fallback', async (_label, folder, fallback) => {
    await store.createDocument(`${folder}/entry.md`, '# entry')

    const res = await app.request(`/api/files/archive?path=${encodeURIComponent(folder)}`)

    expect(res.headers.get('content-disposition')).toContain(`filename="${fallback}"`)
  })

  it('archives only the requested subtree, with paths relative to it', async () => {
    await store.createDocument('notes.md', '# outside')
    await store.createDocument('journal/entry.md', '# entry')

    const res = await app.request('/api/files/archive?path=journal')

    await expect(entriesIn(res)).resolves.toStrictEqual(['entry.md'])
  })

  it('leaves the trash out of the export', async () => {
    await store.createDocument('notes.md', '# hello')
    await store.createDocument('gone.md', '# gone')
    await store.trash('gone.md')

    const res = await app.request('/api/files/archive')

    await expect(entriesIn(res)).resolves.toStrictEqual(['notes.md'])
  })

  it('returns 413 before streaming when the byte limit is exceeded', async () => {
    await store.createDocument('notes.md', '# a document longer than four bytes')
    const tiny = buildApp({ store, limits: { ...DEFAULT_LIMITS, archiveMaxBytes: 4 } })

    const res = await tiny.request('/api/files/archive')

    expect(res.status).toBe(413)
    await expect(codeOf(res)).resolves.toBe('TOO_LARGE')
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('names the limit and the measured value, so the message can be specific', async () => {
    await store.createDocument('a.md', 'x')
    await store.createDocument('b.md', 'x')
    const tiny = buildApp({ store, limits: { ...DEFAULT_LIMITS, archiveMaxEntries: 1 } })

    const res = await tiny.request('/api/files/archive')
    const body: unknown = await res.json()

    expect(res.status).toBe(413)
    expect(body).toMatchObject({ code: 'TOO_LARGE', unit: 'entries', limit: 1, measured: 2 })
  })

  it('returns 404 for a subtree that is not there', async () => {
    const res = await app.request('/api/files/archive?path=missing')

    expect(res.status).toBe(404)
    await expect(codeOf(res)).resolves.toBe('NOT_FOUND')
  })

  it('returns 404 when the path names a file rather than a folder', async () => {
    await store.createDocument('notes.md', '# hello')

    expect((await app.request('/api/files/archive?path=notes.md')).status).toBe(404)
  })

  it('rejects a traversal attempt', async () => {
    const res = await app.request('/api/files/archive?path=..%2F..%2Fetc')

    expect(res.status).toBe(400)
    await expect(codeOf(res)).resolves.toBe('INVALID_PATH')
  })
})
