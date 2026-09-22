'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../../server/app.ts'
import { createFsDocumentStore, type DocumentStore } from '../../../server/storage/fs-store.ts'

let root: string
let store: DocumentStore
let app: Hono

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-routes-'))
  store = createFsDocumentStore(root)
  app = buildApp({ store })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function put(id: string, content: string): Promise<Response> {
  return await app.request(`/api/documents/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  })
}

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const res = await app.request('/api/health')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toStrictEqual({ status: 'ok' })
  })
})

describe('GET /api/documents', () => {
  it('returns an empty list initially', async () => {
    const res = await app.request('/api/documents')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toStrictEqual({ documents: [] })
  })

  it('lists stored documents', async () => {
    await store.write('b.md', '')
    await store.write('a.md', '')

    const res = await app.request('/api/documents')

    await expect(res.json()).resolves.toStrictEqual({ documents: ['a.md', 'b.md'] })
  })
})

describe('GET /api/documents/:id', () => {
  it('returns the document content as markdown', async () => {
    await store.write('notes.md', '# hello')

    const res = await app.request('/api/documents/notes.md')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/markdown')
    await expect(res.text()).resolves.toBe('# hello')
  })

  it('returns a nested document', async () => {
    await store.write('journal/2026/september.md', 'entry')

    const res = await app.request('/api/documents/journal/2026/september.md')

    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toBe('entry')
  })

  it('returns 404 for a missing document', async () => {
    const res = await app.request('/api/documents/missing.md')

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toStrictEqual({ error: 'Document not found' })
  })

  it('returns 400 for an invalid id', async () => {
    const res = await app.request('/api/documents/notes.txt')

    expect(res.status).toBe(400)
  })

  it('returns 400 rather than 404 for a traversal attempt', async () => {
    const res = await app.request('/api/documents/..%2F..%2Fetc%2Fpasswd.md')

    expect(res.status).toBe(400)
  })

  it('does not disclose the document root in an error response', async () => {
    const res = await app.request('/api/documents/notes.txt')

    await expect(res.text()).resolves.not.toContain(root)
  })
})

describe('PUT /api/documents/:id', () => {
  it('creates a document and returns 204', async () => {
    const res = await put('notes.md', '# created')

    expect(res.status).toBe(204)
    await expect(store.read('notes.md')).resolves.toBe('# created')
  })

  it('round-trips a write then a read', async () => {
    await put('notes.md', '# round trip')

    const res = await app.request('/api/documents/notes.md')

    await expect(res.text()).resolves.toBe('# round trip')
  })

  it('overwrites an existing document', async () => {
    await put('notes.md', 'first')
    await put('notes.md', 'second')

    await expect(store.read('notes.md')).resolves.toBe('second')
  })

  it('accepts empty content', async () => {
    const res = await put('empty.md', '')

    expect(res.status).toBe(204)
    await expect(store.read('empty.md')).resolves.toBe('')
  })

  it('returns 400 for an invalid id', async () => {
    expect((await put('notes.txt', 'x')).status).toBe(400)
  })

  it('returns 400 for an encoded traversal attempt', async () => {
    expect((await put('..%2F..%2Fescape.md', 'x')).status).toBe(400)
  })

  it('returns 404 for a literal traversal, which the URL parser normalises away', async () => {
    // The WHATWG URL parser collapses `/api/documents/../escape.md` to
    // `/api/escape.md` before routing, so it never reaches the handler.
    expect((await put('../escape.md', 'x')).status).toBe(404)
  })

  it('returns 400 when content is missing', async () => {
    const res = await app.request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
  })

  it('returns 400 when content is not a string', async () => {
    const res = await app.request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 42 }),
    })

    expect(res.status).toBe(400)
  })

  it('returns 400 for a malformed JSON body', async () => {
    const res = await app.request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })

    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/documents/:id', () => {
  it('deletes a document and returns 204', async () => {
    await store.write('notes.md', 'x')

    const res = await app.request('/api/documents/notes.md', { method: 'DELETE' })

    expect(res.status).toBe(204)
    await expect(store.list()).resolves.toStrictEqual([])
  })

  it('returns 404 for a missing document', async () => {
    const res = await app.request('/api/documents/missing.md', { method: 'DELETE' })

    expect(res.status).toBe(404)
  })

  it('returns 400 for an invalid id', async () => {
    const res = await app.request('/api/documents/notes.txt', { method: 'DELETE' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for an encoded traversal attempt', async () => {
    const res = await app.request('/api/documents/..%2F..%2Fescape.md', { method: 'DELETE' })

    expect(res.status).toBe(400)
  })
})

describe('unknown routes', () => {
  it('returns 404 for an unknown api route', async () => {
    const res = await app.request('/api/nope')

    expect(res.status).toBe(404)
  })
})

describe('unexpected storage faults', () => {
  function brokenStore(): DocumentStore {
    return {
      list: () => Promise.reject(new Error('disk on fire')),
      read: () => Promise.reject(new Error('disk on fire')),
      write: () => Promise.reject(new Error('disk on fire')),
      remove: () => Promise.reject(new Error('disk on fire')),
    }
  }

  it('surfaces an unrecognised storage error as 500, not as 400 or 404', async () => {
    const res = await buildApp({ store: brokenStore() }).request('/api/documents/notes.md')

    expect(res.status).toBe(500)
  })

  it('propagates an unrecognised error from a write', async () => {
    const res = await buildApp({ store: brokenStore() }).request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'x' }),
    })

    expect(res.status).toBe(500)
  })
})
