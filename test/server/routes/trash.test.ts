'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { given } from '../../conditions.ts'
import { fieldOf, refusalOf } from './refusals.ts'
import { buildApp } from '../../../src/server/app.ts'
import { cast } from '../../cast.ts'
import { createFsDocumentStore, type DocumentStore } from '../../../src/server/storage/fs-store.ts'

let root = ''
let store: DocumentStore = createFsDocumentStore('')
let app: Hono = buildApp({ store })

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-trash-routes-'))
  store = createFsDocumentStore(root)
  app = buildApp({ store })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function remove(entryPath: string): Promise<Response> {
  return await app.request(`/api/files/entries/${entryPath}`, { method: 'DELETE' })
}

describe('DELETE /api/files/entries/:path', () => {
  it('moves a document to the trash and reports the entry id', async () => {
    await store.createDocument('notes.md', 'x')

    const res = await remove('notes.md')

    given(() => {
      expect(res.status).toBe(200)
    })

    await expect(fieldOf(res, 'trashId')).resolves.toMatch(/^[0-9a-f\-]{36}$/v)
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

    const res = await remove('journal')
    given(() => {
      expect(res.status).toBe(200)
    })

    await expect(store.tree()).resolves.toStrictEqual([])
  })

  it('returns 404 for a path that is not there', async () => {
    const res = await remove('missing.md')

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 404, code: 'NOT_FOUND' })
  })

  it('rejects an encoded traversal attempt', async () => {
    const res = await remove('..%2F..%2Fescape.md')

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it('refuses to reach into the trash directory', async () => {
    const res = await remove('.trash')

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })
})

describe('the document API no longer hard-deletes', () => {
  it('has no DELETE route, so deletion goes through the trash and nowhere else', async () => {
    await store.createDocument('notes.md', 'x')

    const res = await app.request('/api/documents/notes.md', { method: 'DELETE' })

    expect({ status: res.status, stored: await store.read('notes.md') }).toStrictEqual({
      status: 404,
      stored: 'x',
    })
  })
})

describe('GET /api/trash', () => {
  it('is empty before anything is deleted', async () => {
    const res = await app.request('/api/trash')

    const body: unknown = await res.json()

    expect({ status: res.status, body }).toStrictEqual({ status: 200, body: { entries: [] } })
  })

  it('reports deleted entries in a form that tells them from live files', async () => {
    await store.createDocument('notes.md', 'x')
    await remove('notes.md')

    const res = await app.request('/api/trash')

    const entries = await fieldOf(res, 'entries')

    expect(entries).toMatchObject([
      { originalPath: 'notes.md', kind: 'document', deletedAt: expect.stringMatching(/^\d{4}-/v) as unknown },
    ])
  })
})

async function restoreRequest(entryId: string, paths: readonly string[]): Promise<Response> {
  return await app.request(`/api/trash/${entryId}/restores`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths }),
  })
}

describe('POST /api/trash/:entryId/restores', () => {
  async function trashed(): Promise<string> {
    await store.createDocument('notes.md', '# hello')
    return await store.trash('notes.md')
  }

  it('puts the entry back and reports where', async () => {
    const id = await trashed()

    const res = await restoreRequest(id, [''])

    const body: unknown = await res.json()

    expect({ status: res.status, body, restored: await store.read('notes.md') }).toStrictEqual({
      status: 200,
      body: { restored: ['notes.md'], entryRemains: false },
      restored: '# hello',
    })
  })

  it('returns 409 when the original path is occupied, leaving the user to decide', async () => {
    const id = await trashed()
    await store.createDocument('notes.md', 'something else')

    const res = await restoreRequest(id, [''])

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 409, code: 'ALREADY_EXISTS' })
  })

  it('refuses a body that names no paths at all', async () => {
    await store.createDocument('notes.md', '# hello')
    const id = await store.trash('notes.md')

    const res = await app.request(`/api/trash/${id}/restores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths: [] }),
    })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })

  it('returns 404 for an unknown entry', async () => {
    const res = await restoreRequest('00000000-0000-4000-8000-000000000000', [''])

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 404, code: 'NOT_FOUND' })
  })

  it('rejects an entry id that is not a uuid', async () => {
    const res = await restoreRequest('not-a-uuid', [''])

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })
})

describe('DELETE /api/trash/:entryId', () => {
  it('purges the entry for good', async () => {
    await store.createDocument('notes.md', 'x')
    const id = await store.trash('notes.md')

    const res = await app.request(`/api/trash/${id}`, { method: 'DELETE' })

    given(() => {
      expect(res.status).toBe(204)
    })

    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('refuses a body that names no paths at all', async () => {
    await store.createDocument('notes.md', '# hello')
    const id = await store.trash('notes.md')

    const res = await app.request(`/api/trash/${id}/restores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths: [] }),
    })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })

  it('returns 404 for an unknown entry', async () => {
    const res = await app.request('/api/trash/00000000-0000-4000-8000-000000000000', { method: 'DELETE' })

    expect(res.status).toBe(404)
  })

  it('rejects an entry id that is not a uuid', async () => {
    const res = await app.request('/api/trash/not-a-uuid', { method: 'DELETE' })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })
})

describe('GET /api/trash/:entryId/entries', () => {
  it('answers with what the entry holds', async () => {
    await store.createDocument('journal/a.md', '# a')
    const entryId = await store.trash('journal')

    const res = await app.request(`/api/trash/${entryId}/entries`)
    const { entry } = cast<{ entry: { name: string; children: Array<{ name: string }> } }>(await res.json())

    expect({ status: res.status, name: entry.name, children: entry.children.map((c) => c.name) }).toStrictEqual({
      status: 200,
      name: 'journal',
      children: ['a.md'],
    })
  })

  it('refuses an id that is not a trash entry id at all', async () => {
    const res = await app.request('/api/trash/not-a-uuid/entries')

    expect(res.status).toBe(400)
  })

  it('answers 404 for an entry the trash does not hold', async () => {
    const res = await app.request('/api/trash/0d5caef1-147f-45bf-8546-270886fcaa8f/entries')

    expect(res.status).toBe(404)
  })
})

describe('restoring under a different name', () => {
  it('puts the entry where the request asked', async () => {
    await store.createDocument('notes.md', '# hello')
    const id = await store.trash('notes.md')

    const res = await app.request(`/api/trash/${id}/restores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths: [''], to: 'archive/kept.md' }),
    })

    await expect(res.json()).resolves.toStrictEqual({ restored: ['archive/kept.md'], entryRemains: false })
  })

  it('refuses a new name when more than one thing was named', async () => {
    await store.createDocument('journal/a.md', '# a')
    await store.createDocument('journal/b.md', '# b')
    const id = await store.trash('journal')

    const res = await app.request(`/api/trash/${id}/restores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths: ['a.md', 'b.md'], to: 'journal/one.md' }),
    })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })
})

describe('DELETE /api/trash', () => {
  async function emptied(): Promise<Response> {
    return await app.request('/api/trash', { method: 'DELETE' })
  }

  it('answers with how many entries it purged', async () => {
    await store.createDocument('a.md', 'x')
    await store.createDocument('b.md', 'y')
    await remove('a.md')
    await remove('b.md')

    expect(await fieldOf(await emptied(), 'purged')).toBe(2)
  })

  it('leaves the trash empty', async () => {
    await store.createDocument('a.md', 'x')
    await remove('a.md')
    await emptied()

    expect(await store.listTrash()).toStrictEqual([])
  })

  it('answers plainly when the trash was already empty', async () => {
    expect(await fieldOf(await emptied(), 'purged')).toBe(0)
  })

  it('is not reached by a path that names one entry', async () => {
    await store.createDocument('a.md', 'x')
    const entryId = await fieldOf(await remove('a.md'), 'trashId')
    await app.request(`/api/trash/${String(entryId)}`, { method: 'DELETE' })

    expect(await fieldOf(await emptied(), 'purged')).toBe(0)
  })
})
