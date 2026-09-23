'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../../src/server/app.ts'
import { createFsDocumentStore, FOLDER_INDEX_NAME, type DocumentStore } from '../../../src/server/storage/fs-store.ts'

let root: string
let store: DocumentStore
let app: Hono

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

async function codeOf(res: Response): Promise<unknown> {
  const body: unknown = await res.json()

  return typeof body === 'object' && body !== null && 'code' in body ? body.code : undefined
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

    expect(res.status).toBe(409)
    await expect(codeOf(res)).resolves.toBe('ALREADY_EXISTS')
  })

  it('rejects a traversal attempt', async () => {
    const res = await post('folders', { path: '../escape' })

    expect(res.status).toBe(400)
    await expect(codeOf(res)).resolves.toBe('INVALID_PATH')
  })

  it('rejects the trash, which is not addressable through the API', async () => {
    const res = await post('folders', { path: '.trash' })

    expect(res.status).toBe(400)
    await expect(codeOf(res)).resolves.toBe('INVALID_PATH')
  })

  it('rejects an empty path', async () => {
    const res = await post('folders', { path: '' })

    expect(res.status).toBe(400)
    await expect(codeOf(res)).resolves.toBe('BAD_REQUEST')
  })

  it('rejects a body with no path at all', async () => {
    const res = await post('folders', {})

    expect(res.status).toBe(400)
    await expect(codeOf(res)).resolves.toBe('BAD_REQUEST')
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

    expect(res.status).toBe(409)
    await expect(codeOf(res)).resolves.toBe('ALREADY_EXISTS')
  })

  it('leaves the existing content alone on a conflict', async () => {
    await store.createDocument('notes.md', 'original')
    await post('documents', { path: 'notes.md', content: 'replacement' })

    await expect(store.read('notes.md')).resolves.toBe('original')
  })

  it('rejects an extension that is not a document', async () => {
    const res = await post('documents', { path: 'photo.png' })

    expect(res.status).toBe(400)
    await expect(codeOf(res)).resolves.toBe('INVALID_PATH')
  })

  it('rejects a traversal attempt', async () => {
    const res = await post('documents', { path: '../escape.md' })

    expect(res.status).toBe(400)
    await expect(codeOf(res)).resolves.toBe('INVALID_PATH')
  })

  it.each([
    ['empty content', ''],
    ['whitespace-only content', '   \n\t '],
  ])('rejects %s rather than storing a document with nothing in it', async (_label, content) => {
    const res = await post('documents', { path: 'notes.md', content })

    expect(res.status).toBe(422)
    await expect(codeOf(res)).resolves.toBe('EMPTY_CONTENT')
  })

  it('does not create the document it rejected as empty', async () => {
    await post('documents', { path: 'notes.md', content: '  ' })

    await expect(store.list()).resolves.toStrictEqual([])
  })

  it('rejects a body with no path at all', async () => {
    const res = await post('documents', {})

    expect(res.status).toBe(400)
    await expect(codeOf(res)).resolves.toBe('BAD_REQUEST')
  })

  it('rejects a body whose content is not a string', async () => {
    const res = await post('documents', { path: 'notes.md', content: 42 })

    expect(res.status).toBe(400)
    await expect(codeOf(res)).resolves.toBe('BAD_REQUEST')
  })
})
