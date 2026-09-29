'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { refusalOf } from './refusals.ts'
import { buildApp } from '../../../src/server/app.ts'
import { DEFAULT_LIMITS } from '../../../src/server/config.ts'
import { createFsDocumentStore, type DocumentStore } from '../../../src/server/storage/fs-store.ts'
import { FOLDER_INDEX_NAME } from '../../../src/shared/documents.ts'

let root = ''
let store: DocumentStore = createFsDocumentStore('')
let app: Hono = buildApp({ store })

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-files-'))
  store = createFsDocumentStore(root)
  app = buildApp({ store })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function post(route: string, body: unknown): Promise<Response> {
  return await app.request(`/api/files/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/files', () => {
  it('returns an empty tree initially', async () => {
    const res = await app.request('/api/files')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toStrictEqual({ tree: [] })
  })

  it('reports folders, documents and images with distinct kinds', async () => {
    await store.createDocument('journal/september.md', 'x')
    await fs.writeFile(path.join(root, 'photo.png'), '')

    const res = await app.request('/api/files')

    await expect(res.json()).resolves.toMatchObject({
      tree: [
        { name: 'journal', kind: 'folder', children: [{ name: 'september.md', kind: 'document' }] },
        { name: 'photo.png', kind: 'image' },
      ],
    })
  })
})

describe('POST /api/files/folders', () => {
  it('creates a folder and reports the seeded index', async () => {
    const res = await post('folders', { path: 'journal' })

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({ path: `journal/${FOLDER_INDEX_NAME}` })
  })

  it('returns an etag for the seeded index, so the client can save it without re-reading', async () => {
    const res = await post('folders', { path: 'journal' })
    const created: unknown = await res.json()
    const etag = typeof created === 'object' && created !== null && 'etag' in created ? created.etag : undefined

    const saved = await app.request(`/api/documents/journal/${FOLDER_INDEX_NAME}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'if-match': String(etag) },
      body: JSON.stringify({ content: '# edited' }),
    })

    expect(saved.status).toBe(204)
  })

  it('seeds the index with a heading of the folder name', async () => {
    await post('folders', { path: 'journal' })

    await expect(store.read(`journal/${FOLDER_INDEX_NAME}`)).resolves.toContain('# journal')
  })

  it('creates a nested folder', async () => {
    const res = await post('folders', { path: 'journal/2026' })

    expect(res.status).toBe(201)
    await expect(store.read(`journal/2026/${FOLDER_INDEX_NAME}`)).resolves.toContain('# 2026')
  })

  it('reports a folder that already exists as a conflict', async () => {
    await post('folders', { path: 'journal' })

    const res = await post('folders', { path: 'journal' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 409, code: 'ALREADY_EXISTS' })
  })

  it('rejects a traversal attempt', async () => {
    const res = await post('folders', { path: '../escape' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it('rejects the trash, which is not addressable through the API', async () => {
    const res = await post('folders', { path: '.trash' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it('rejects an empty path', async () => {
    const res = await post('folders', { path: '' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })

  it('rejects a body with no path at all', async () => {
    const res = await post('folders', {})

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })
})

describe('POST /api/files/documents', () => {
  it('creates a document and reports its path', async () => {
    const res = await post('documents', { path: 'notes.md' })

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({ path: 'notes.md' })
  })

  it('returns an etag for the new document', async () => {
    const res = await post('documents', { path: 'notes.md' })
    const created: unknown = await res.json()
    const etag = typeof created === 'object' && created !== null && 'etag' in created ? created.etag : undefined

    const saved = await app.request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'if-match': String(etag) },
      body: JSON.stringify({ content: '# edited' }),
    })

    expect(saved.status).toBe(204)
  })

  it('seeds a heading of the filename without its extension', async () => {
    await post('documents', { path: 'journal/september.md' })

    await expect(store.read('journal/september.md')).resolves.toContain('# september')
  })

  it('stores supplied content verbatim rather than seeding', async () => {
    await post('documents', { path: 'notes.md', content: 'already written' })

    await expect(store.read('notes.md')).resolves.toBe('already written')
  })

  it('accepts a plain text document', async () => {
    const res = await post('documents', { path: 'notes.txt' })

    expect(res.status).toBe(201)
  })

  it('reports a document that already exists as a conflict', async () => {
    await store.createDocument('notes.md', 'original')

    const res = await post('documents', { path: 'notes.md' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 409, code: 'ALREADY_EXISTS' })
  })

  it('leaves the existing content alone on a conflict', async () => {
    await store.createDocument('notes.md', 'original')
    await post('documents', { path: 'notes.md', content: 'replacement' })

    await expect(store.read('notes.md')).resolves.toBe('original')
  })

  it('rejects an extension that is not a document', async () => {
    const res = await post('documents', { path: 'photo.png' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it('rejects a traversal attempt', async () => {
    const res = await post('documents', { path: '../escape.md' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it.each([
    ['empty content', ''],
    ['whitespace-only content', '   \n\t '],
  ])('rejects %s rather than storing a document with nothing in it', async (_label, content) => {
    const res = await post('documents', { path: 'notes.md', content })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 422, code: 'EMPTY_CONTENT' })
  })

  it('does not create the document it rejected as empty', async () => {
    await post('documents', { path: 'notes.md', content: '  ' })

    await expect(store.list()).resolves.toStrictEqual([])
  })

  it('rejects a body with no path at all', async () => {
    const res = await post('documents', {})

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })

  it('rejects a body whose content is not a string', async () => {
    const res = await post('documents', { path: 'notes.md', content: 42 })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })
})

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

async function upload(
  filename: string,
  bytes: Uint8Array<ArrayBuffer>,
  directory?: string,
  target = app,
): Promise<Response> {
  const form = new FormData()
  form.append('file', new File([bytes], filename))
  if (directory !== undefined) form.append('path', directory)

  return await target.request('/api/files/uploads', { method: 'POST', body: form })
}

async function uploadNamed(sentAs: string, storeAs: unknown, bytes: Uint8Array<ArrayBuffer>): Promise<Response> {
  const form = new FormData()
  form.append('file', new File([bytes], sentAs))
  if (storeAs instanceof Blob) form.append('filename', storeAs)
  else if (typeof storeAs === 'string') form.append('filename', storeAs)

  return await app.request('/api/files/uploads', { method: 'POST', body: form })
}

describe('POST /api/files/uploads', () => {
  it('stores an upload and reports the path it landed at', async () => {
    const res = await upload('photo.png', PNG_BYTES, 'journal')

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toStrictEqual({ path: 'journal/photo.png' })
  })

  it('stores at the root when no directory is given', async () => {
    const res = await upload('photo.png', PNG_BYTES)

    await expect(res.json()).resolves.toStrictEqual({ path: 'photo.png' })
  })

  it('writes the bytes verbatim', async () => {
    await upload('photo.png', PNG_BYTES)

    await expect(store.readBytes('photo.png')).resolves.toStrictEqual(PNG_BYTES)
  })

  it('rejects a png whose bytes are html, however the client labelled it', async () => {
    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>')

    const res = await upload('photo.png', html)

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'CONTENT_MISMATCH' })
  })

  it('rejects an extension outside the allowlist', async () => {
    const res = await upload('payload.zip', PNG_BYTES)

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it('rejects a filename that tries to pick its own directory', async () => {
    const res = await upload('../escape.png', PNG_BYTES)

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it('rejects a traversal in the target directory', async () => {
    const res = await upload('photo.png', PNG_BYTES, '../outside')

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it('reports an existing file as a conflict', async () => {
    await upload('photo.png', PNG_BYTES)

    const res = await upload('photo.png', PNG_BYTES)

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 409, code: 'ALREADY_EXISTS' })
  })

  it('rejects an empty upload', async () => {
    const res = await upload('photo.png', new Uint8Array())

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 422, code: 'EMPTY_CONTENT' })
  })

  it('rejects an upload larger than the configured limit', async () => {
    const tiny = buildApp({ store, limits: { ...DEFAULT_LIMITS, uploadMaxBytes: 4 } })

    const res = await upload('photo.png', PNG_BYTES, '', tiny)

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 413, code: 'TOO_LARGE' })
  })

  it('does not store an upload it rejected as too large', async () => {
    const tiny = buildApp({ store, limits: { ...DEFAULT_LIMITS, uploadMaxBytes: 4 } })

    await upload('photo.png', PNG_BYTES, '', tiny)

    await expect(store.readBytes('photo.png')).rejects.toThrow()
  })

  it('rejects a declared content-length over the limit before reading the body', async () => {
    const tiny = buildApp({ store, limits: { ...DEFAULT_LIMITS, uploadMaxBytes: 4 } })

    const res = await tiny.request('/api/files/uploads', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': '999999' },
      body: '--x--',
    })

    expect(res.status).toBe(413)
  })

  it('rejects a body carrying no file at all', async () => {
    const form = new FormData()
    form.append('path', 'journal')

    const res = await app.request('/api/files/uploads', { method: 'POST', body: form })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })

  it('rejects a target directory that is not a string', async () => {
    const form = new FormData()
    form.append('file', new File([PNG_BYTES], 'photo.png'))
    form.append('path', new File([PNG_BYTES], 'not-a-path.png'))

    const res = await app.request('/api/files/uploads', { method: 'POST', body: form })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })
})

describe('GET /api/files/raw/:path', () => {
  it('serves an uploaded image byte for byte', async () => {
    await upload('photo.png', PNG_BYTES)

    const res = await app.request('/api/files/raw/photo.png')

    expect(res.status).toBe(200)
    await expect(res.arrayBuffer().then((b) => new Uint8Array(b))).resolves.toStrictEqual(PNG_BYTES)
  })

  it('serves a nested path, mirroring the store layout so relative links resolve', async () => {
    await upload('photo.png', PNG_BYTES, 'journal/2026')

    const res = await app.request('/api/files/raw/journal/2026/photo.png')

    expect(res.status).toBe(200)
  })

  it.each([
    ['photo.png', PNG_BYTES, 'image/png'],
    ['notes.md', new TextEncoder().encode('# hi'), 'text/markdown'],
  ])('types %s from its extension rather than from the upload', async (name, content, expected) => {
    await store.createUpload('', name, content)

    const res = await app.request(`/api/files/raw/${name}`)

    expect(res.headers.get('content-type')).toContain(expected)
  })

  it('forbids sniffing, so a mislabelled file cannot be reinterpreted', async () => {
    await upload('photo.png', PNG_BYTES)

    const res = await app.request('/api/files/raw/photo.png')

    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('neuters a directly navigated svg with a content security policy', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    await upload('drawing.svg', svg)

    const res = await app.request('/api/files/raw/drawing.svg')

    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
  })

  it('returns 404 for a file that is not there', async () => {
    const res = await app.request('/api/files/raw/missing.png')

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 404, code: 'NOT_FOUND' })
  })

  it('rejects an extension outside the allowlist', async () => {
    const res = await app.request('/api/files/raw/payload.zip')

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it('rejects an encoded traversal attempt', async () => {
    const res = await app.request('/api/files/raw/..%2F..%2Fetc%2Fpasswd.png')

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })
})

describe('POST /api/files/moves', () => {
  it('renames a document and reports what it rewrote', async () => {
    await store.createDocument('notes.md', '# hello')

    const res = await post('moves', { from: 'notes.md', to: 'renamed.md' })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toStrictEqual({ rewritten: [], failed: [] })
    await expect(store.read('renamed.md')).resolves.toBe('# hello')
  })

  it('names the documents whose links it repaired', async () => {
    await store.createDocument('journal/a.md', '# a')
    await store.createDocument('notes.md', 'see [it](journal/a.md)')

    const res = await post('moves', { from: 'journal/a.md', to: 'archive/a.md' })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toStrictEqual({ rewritten: ['notes.md'], failed: [] })
    await expect(store.read('notes.md')).resolves.toBe('see [it](archive/a.md)')
  })

  it('moves a document into a folder', async () => {
    await store.createFolder('archive', '# archive')
    await store.createDocument('notes.md', '# hello')

    expect((await post('moves', { from: 'notes.md', to: 'archive/notes.md' })).status).toBe(200)
  })

  it('returns 404 when the source is not there', async () => {
    const res = await post('moves', { from: 'missing.md', to: 'elsewhere.md' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 404, code: 'NOT_FOUND' })
  })

  it('refuses an occupied destination rather than replacing it', async () => {
    await store.createDocument('notes.md', '# mine')
    await store.createDocument('archive/notes.md', '# theirs')

    const res = await post('moves', { from: 'notes.md', to: 'archive/notes.md' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 409, code: 'ALREADY_EXISTS' })
  })

  it('leaves both documents where they were when it refuses', async () => {
    await store.createDocument('notes.md', '# mine')
    await store.createDocument('archive/notes.md', '# theirs')

    await post('moves', { from: 'notes.md', to: 'archive/notes.md' })

    await expect(store.read('notes.md')).resolves.toBe('# mine')
    await expect(store.read('archive/notes.md')).resolves.toBe('# theirs')
  })

  it('returns 409 for a folder moved into its own descendant', async () => {
    await store.createFolder('journal', '# journal')

    const res = await post('moves', { from: 'journal', to: 'journal/2026' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 409, code: 'INVALID_MOVE' })
  })

  it('returns 400 for a traversal attempt', async () => {
    const res = await post('moves', { from: '../escape.md', to: 'notes.md' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it('returns 400 for a rename that would change what the file claims to be', async () => {
    await store.createDocument('notes.md', '# hello')

    const res = await post('moves', { from: 'notes.md', to: 'notes.svg' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it.each([
    ['no destination', { from: 'notes.md' }],
    ['no source', { to: 'notes.md' }],
  ])('rejects a body with %s', async (_label, body) => {
    const res = await post('moves', body)

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })
})

describe('POST /api/files/uploads with a chosen name', () => {
  it('stores under the name the client asked for, not the one the file carried', async () => {
    const res = await uploadNamed('IMG_0042.png', 'header.png', PNG_BYTES)

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toStrictEqual({ path: 'header.png' })
  })

  it('validates the chosen name exactly as it validates the file’s own', async () => {
    const res = await uploadNamed('photo.png', '../escape.png', PNG_BYTES)

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it('still checks the bytes against the chosen extension', async () => {
    const res = await uploadNamed('photo.png', 'photo.gif', PNG_BYTES)

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'CONTENT_MISMATCH' })
  })

  it('rejects a filename field that is not text', async () => {
    const res = await uploadNamed('photo.png', new File([PNG_BYTES], 'nested.png'), PNG_BYTES)

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })
})

describe('a rejected upload says what the bytes actually are', () => {
  it('names the format, so the client can offer the corrected name', async () => {
    const res = await upload('photo.jpg', PNG_BYTES)

    await expect(res.json()).resolves.toStrictEqual({
      error: 'Content does not match the file extension',
      code: 'CONTENT_MISMATCH',
      detected: '.png',
    })
  })

  it('reports no format when the bytes are not an image at all', async () => {
    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>')

    const res = await upload('photo.png', html)

    await expect(res.json()).resolves.toStrictEqual({
      error: 'Content does not match the file extension',
      code: 'CONTENT_MISMATCH',
      detected: null,
    })
  })
})
