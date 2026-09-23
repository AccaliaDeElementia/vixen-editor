'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../../src/server/app.ts'
import { createFsDocumentStore, type DocumentStore } from '../../../src/server/storage/fs-store.ts'

let root: string
let store: DocumentStore
let app: Hono

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-trash-routes-'))
  store = createFsDocumentStore(root)
  app = buildApp({ store })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function fieldOf(res: Response, key: string): Promise<unknown> {
  const body: unknown = await res.json()

  return typeof body === 'object' && body !== null && key in body ? (body as Record<string, unknown>)[key] : undefined
}

async function codeOf(res: Response): Promise<unknown> {
  return await fieldOf(res, 'code')
}

async function remove(entryPath: string): Promise<Response> {
  return await app.request(`/api/files/entries/${entryPath}`, { method: 'DELETE' })
}

describe('DELETE /api/files/entries/:path', () => {
  it('moves a document to the trash and reports the entry id', async () => {
    await store.createDocument('notes.md', 'x')

    const res = await remove('notes.md')

    expect(res.status).toBe(200)
    await expect(fieldOf(res, 'trashId')).resolves.toMatch(/^[0-9a-f-]{36}$/u)
  })

  it('takes the document out of the listing', async () => {
    await store.createDocument('notes.md', 'x')
    await remove('notes.md')

    await expect(store.list()).resolves.toStrictEqual([])
  })

  it('deletes a nested path', async () => {
    await store.createDocument('journal/2026/notes.md', 'x')

    expect((await remove('journal/2026/notes.md')).status).toBe(200)
  })

  it('deletes a folder', async () => {
    await store.createFolder('journal', '# journal')

    expect((await remove('journal')).status).toBe(200)
    await expect(store.tree()).resolves.toStrictEqual([])
  })

  it('returns 404 for a path that is not there', async () => {
    const res = await remove('missing.md')

    expect(res.status).toBe(404)
    await expect(codeOf(res)).resolves.toBe('NOT_FOUND')
  })

  it('rejects an encoded traversal attempt', async () => {
    const res = await remove('..%2F..%2Fescape.md')

    expect(res.status).toBe(400)
    await expect(codeOf(res)).resolves.toBe('INVALID_PATH')
  })

  it('refuses to reach into the trash directory', async () => {
    const res = await remove('.trash')

    expect(res.status).toBe(400)
    await expect(codeOf(res)).resolves.toBe('INVALID_PATH')
  })
})

describe('the document API no longer hard-deletes', () => {
  it('has no DELETE route, so deletion goes through the trash and nowhere else', async () => {
    await store.createDocument('notes.md', 'x')

    const res = await app.request('/api/documents/notes.md', { method: 'DELETE' })

    expect(res.status).toBe(404)
    await expect(store.read('notes.md')).resolves.toBe('x')
  })
})

describe('GET /api/trash', () => {
  it('is empty before anything is deleted', async () => {
    const res = await app.request('/api/trash')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toStrictEqual({ entries: [] })
  })

  it('reports deleted entries in a form that tells them from live files', async () => {
    await store.createDocument('notes.md', 'x')
    await remove('notes.md')

    const res = await app.request('/api/trash')

    const entries = await fieldOf(res, 'entries')

    expect(entries).toMatchObject([{ originalPath: 'notes.md', kind: 'document' }])
    expect(entries).toMatchObject([{ deletedAt: expect.stringMatching(/^\d{4}-/u) as unknown }])
  })
})

describe('POST /api/trash/:entryId/restore', () => {
  async function trashed(): Promise<string> {
    await store.createDocument('notes.md', '# hello')
    return await store.trash('notes.md')
  }

  it('puts the entry back and reports where', async () => {
    const id = await trashed()

    const res = await app.request(`/api/trash/${id}/restore`, { method: 'POST' })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toStrictEqual({ path: 'notes.md' })
    await expect(store.read('notes.md')).resolves.toBe('# hello')
  })

  it('returns 409 when the original path is occupied, leaving the user to decide', async () => {
    const id = await trashed()
    await store.createDocument('notes.md', 'something else')

    const res = await app.request(`/api/trash/${id}/restore`, { method: 'POST' })

    expect(res.status).toBe(409)
    await expect(codeOf(res)).resolves.toBe('ALREADY_EXISTS')
  })

  it('returns 404 for an unknown entry', async () => {
    const res = await app.request('/api/trash/00000000-0000-4000-8000-000000000000/restore', { method: 'POST' })

    expect(res.status).toBe(404)
    await expect(codeOf(res)).resolves.toBe('NOT_FOUND')
  })

  it('rejects an entry id that is not a uuid', async () => {
    const res = await app.request('/api/trash/not-a-uuid/restore', { method: 'POST' })

    expect(res.status).toBe(400)
    await expect(codeOf(res)).resolves.toBe('INVALID_PATH')
  })
})

describe('DELETE /api/trash/:entryId', () => {
  it('purges the entry for good', async () => {
    await store.createDocument('notes.md', 'x')
    const id = await store.trash('notes.md')

    const res = await app.request(`/api/trash/${id}`, { method: 'DELETE' })

    expect(res.status).toBe(204)
    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('returns 404 for an unknown entry', async () => {
    const res = await app.request('/api/trash/00000000-0000-4000-8000-000000000000', { method: 'DELETE' })

    expect(res.status).toBe(404)
  })

  it('rejects an entry id that is not a uuid', async () => {
    const res = await app.request('/api/trash/not-a-uuid', { method: 'DELETE' })

    expect(res.status).toBe(400)
    await expect(codeOf(res)).resolves.toBe('INVALID_PATH')
  })
})
